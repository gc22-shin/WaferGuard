"""
Defect chat — the inspection agent in conversational mode.

This is the SAME agent as the per-wafer inspection agent (agent.py): it shares that
agent's persona (system prompt) and full toolset — RAG search, equipment history,
metrology trend, MLOps state, image inspection/comparison, enqueue-for-review,
recommend-retrain, and escalate-to-MLOps (multi-agent handoff) — grounded in this
inspection's evidence. On top of that it adds save_case_to_knowledge so an
engineer's stated action/conclusion gets recorded back into the RAG corpus.

The only difference from the one-shot analysis run is the turn structure: this is a
multi-turn, streaming conversation. The persona and tools are defined once in
agent.py and reused here (see _system_prompt / _chat_tool_schemas / _chat_tool_registry).

Two entry points share one loop:
- ``stream_chat_about_inspection`` yields event dicts for SSE (tool_call /
  tool_result / token / done).
- ``chat_about_inspection`` consumes the stream and returns the final dict
  (kept for the non-streaming endpoint).
"""
from __future__ import annotations

import json
import logging
import os
from collections.abc import Iterator

from app.services import luxia_client

logger = logging.getLogger(__name__)

_MAX_HISTORY = 10
_MAX_ITERATIONS = 4
_CHUNK_SIZE = 3  # chars per streamed token-ish chunk

# The chat IS the inspection agent in conversational mode — same persona, same
# toolset (loaded from agent.py), plus one extra write tool: save_case_to_knowledge,
# so an engineer's stated action lands back in the RAG corpus. See _chat_tool_*.
_EXTRA_CHAT_TOOL = "save_case_to_knowledge"

# Conversation-mode addendum, appended to the inspection agent's system prompt so
# the two share one identity and one set of rules.
_CHAT_ADDENDUM = (
    "\n\n=== 대화 모드 ===\n"
    "지금은 위 역할 그대로, 엔지니어와 실시간으로 대화하는 모드입니다. 아래 규칙을 추가로 따릅니다.\n"
    "1. 아래 [검사 Evidence]와 '에이전트 분석'이 이 검사의 확정 정보입니다. '구체적인 정보가 필요하다', "
    "'어떤 결함/설비인지 알려달라'고 절대 되묻지 말고, 주어진 내용만으로 바로 구체적으로 답합니다.\n"
    "2. '그래서 뭐부터 해야 돼?' 류 질문에는 권장 액션·추정 원인을 근거로 1·2·3 우선순위 조치를 제시합니다.\n"
    "3. evidence에 없는 정보(같은 설비 과거 이력, 계측 추세, 모델/drift 상태, 추가 유사 사례)가 필요하면 "
    "도구로 직접 조회해 인용합니다. 수치는 지어내지 않습니다.\n"
    "4. 엔지니어가 취할 조치나 결론을 밝히면(예: 'EBR 노즐 압력 점검하고 교체할게', '오탐으로 종결') "
    "save_case_to_knowledge로 RAG 지식베이스에 저장하고 '○○ 조치를 기록했습니다'라고 한 줄로 알립니다. "
    "단순 질문에는 저장하지 않습니다.\n"
    "5. 이미지는 첨부되지 않습니다. 결함 이미지를 직접 봐야 하면 inspect_image(image_url, focus)에 "
    "아래 evidence에 적힌 이미지 URL을 넣어 호출합니다.\n"
    "6. 답변은 한국어로 3~6문장 또는 번호 목록으로 간결하게. 되묻지 말고 가장 합리적인 다음 행동을 제안합니다."
)


def _system_prompt() -> str:
    """Inspection-agent persona + conversation-mode rules (one unified agent)."""
    try:
        from app.services.agent import _SYSTEM_PROMPT as _AGENT_PROMPT  # noqa: PLC0415
    except Exception:  # noqa: BLE001
        _AGENT_PROMPT = "당신은 WaferGuard Fab Ops Agent입니다. 반도체 공정 이상 상황을 판단하고 대응합니다."
    return _AGENT_PROMPT + _CHAT_ADDENDUM


def _evidence_context(record: dict, trace: dict | None) -> str:
    card = record.get("action_card") or {}
    met = record.get("metrology") or {}
    pc = record.get("process_context") or {}
    lines = [
        f"검사 ID: {record.get('id')}",
        f"웨이퍼: {record.get('wafer_id')} / Lot: {record.get('lot_id')} / 설비: {record.get('equipment_id')} ({pc.get('process_step', '?')})",
        f"분류: {record.get('defect_type')} (신뢰도 {float(record.get('confidence') or 0):.1%})",
        f"리스크: {record.get('risk_level')} (score {float(record.get('risk_score') or 0):.2f}), hotspot {float(record.get('hotspot_ratio') or 0):.1%}",
        f"계측값: CD {met.get('cd_nm')}nm, Overlay {met.get('overlay_nm')}nm, "
        f"두께 {met.get('film_thickness_nm')}nm, 거칠기 {met.get('roughness_nm')}nm, "
        f"defect count {met.get('defect_count')}, yield proxy {met.get('yield_proxy')}",
    ]
    hits = card.get("metrology_rule_hits") or []
    if hits:
        lines.append("계측 룰 히트:")
        lines.extend(f"- [{h.get('severity')}] {h.get('signal')}: {h.get('evidence')} → {h.get('action')}" for h in hits)
    causes = card.get("possible_causes") or []
    if causes:
        lines.append("추정 원인 후보: " + ", ".join(map(str, causes)))
    actions = card.get("next_actions") or []
    if actions:
        lines.append("권장 액션: " + " / ".join(map(str, actions)))
    cases = record.get("cases") or []
    if cases:
        lines.append("RAG 유사 사례:")
        lines.extend(
            f"- {c.get('title')}: {c.get('summary')} (당시 조치: {c.get('action')})" for c in cases
        )
    if trace and trace.get("final_action"):
        lines.append(f"Agent 판단: {trace['final_action']}")
    if record.get("report"):
        lines.append(f"분석 리포트: {record['report']}")
    overlay = record.get("overlay_url")
    roi = record.get("roi_url")
    lines.append(
        "\n[도구 사용 힌트] 이 설비 ID="
        f"{record.get('equipment_id')}, 결함 유형={record.get('defect_type')}. "
        "과거 이력/추세 질문에는 이 값을 도구 인자로 사용하세요. "
        f"이미지 URL: overlay={overlay}, roi={roi} (inspect_image/compare_with_past_wafer에 사용)."
    )
    return "\n".join(lines)


def _chat_tool_schemas() -> list[dict]:
    """Same toolset as the inspection agent, plus save_case_to_knowledge."""
    try:
        from app.services.agent import _TOOL_SCHEMAS  # noqa: PLC0415
        from app.services.tools import TOOL_SCHEMAS  # noqa: PLC0415
    except ImportError:
        return []
    schemas = list(_TOOL_SCHEMAS)
    save = next((s for s in TOOL_SCHEMAS if s.get("function", {}).get("name") == _EXTRA_CHAT_TOOL), None)
    if save is not None:
        schemas.append(save)
    return schemas


def _chat_tool_registry(record: dict) -> dict:
    """The inspection agent's tool registry + save_case_to_knowledge bound to this
    inspection (so a chat-recorded action is traceable)."""
    try:
        from app.services.agent import _get_tool_registry  # noqa: PLC0415
        from app.services.tools import save_case_to_knowledge as base_save  # noqa: PLC0415
    except ImportError:
        return {}
    registry = dict(_get_tool_registry())

    def _save(title, summary, action, defect_type=None, **_):
        return base_save(
            title=title,
            summary=summary,
            action=action,
            defect_type=defect_type or record.get("defect_type"),
            metadata={
                "inspection_id": record.get("id"),
                "equipment_id": record.get("equipment_id"),
                "source": "engineer_chat",
            },
        )

    registry[_EXTRA_CHAT_TOOL] = _save
    return registry


def _summarize_tool_result(name: str, result: object) -> str:
    """Short human-readable line shown in the tool-activity UI. Delegates to the
    inspection agent's summarizer so both modes describe tools identically."""
    if name == "save_case_to_knowledge":
        if isinstance(result, dict) and result.get("ok"):
            return f"지식베이스 저장 완료 ({result.get('doc_id', 'saved')})"
        err = result.get("error", "알 수 없음") if isinstance(result, dict) else result
        return f"저장 실패: {err}"
    try:
        from app.services.agent import _summarize_inspection_tool  # noqa: PLC0415

        return _summarize_inspection_tool(name, result)
    except Exception:  # noqa: BLE001
        return "완료"


def _stub_message(use_llm: bool) -> str:
    if not use_llm:
        return (
            "설정에서 LLM 호출이 꺼져 있어 채팅 응답을 생성할 수 없습니다. "
            "설정 탭의 'Agent LLM 분석'을 켜면 이 검사의 evidence를 근거로 답해드립니다."
        )
    return (
        "LLM이 비활성 상태라 채팅 응답을 생성할 수 없습니다. "
        ".env에 LUXIA_API_KEY를 설정하면 이 검사의 evidence를 근거로 질문에 답해드립니다."
    )


def _chunk_text(text: str, size: int = _CHUNK_SIZE) -> Iterator[str]:
    for i in range(0, len(text), size):
        yield text[i : i + size]


def stream_chat_about_inspection(
    record: dict,
    message: str,
    history: list[dict] | None = None,
    trace: dict | None = None,
    use_llm: bool = True,
    extra_context: str = "",
) -> Iterator[dict]:
    """Agentic chat turn, yielding SSE-friendly event dicts.

    Event types:
      {"type": "tool_call", "name", "args"}
      {"type": "tool_result", "name", "summary"}
      {"type": "token", "text"}
      {"type": "done", "reply", "agent_mode", "tool_calls"}
    """
    has_key = bool(os.environ.get("LUXIA_API_KEY", "").strip())
    if not use_llm or not has_key:
        msg = _stub_message(use_llm)
        yield {"type": "token", "text": msg}
        yield {"type": "done", "reply": msg, "agent_mode": "stub", "tool_calls": []}
        return

    # Do NOT attach the wafer image to the chat. The multimodal model anchors on the
    # image and answers generically ("제공된 이미지에 대한 정보가 더 필요합니다") instead of
    # using the rich evidence below — exactly the failure we want to avoid. Image-level
    # analysis remains available through tools (inspect_image / compare_with_past_wafer).
    image_urls: list[str] = []

    system_content = _system_prompt() + "\n\n[검사 Evidence]\n" + _evidence_context(record, trace)
    if extra_context and extra_context.strip():
        system_content += "\n\n[화면에 표시된 AI 추천 — 엔지니어가 보고 있는 내용]\n" + extra_context.strip()
    messages: list[dict] = [
        {"role": "system", "content": system_content},
    ]
    for turn in (history or [])[-_MAX_HISTORY:]:
        role = turn.get("role")
        content = turn.get("content")
        if role in ("user", "assistant") and isinstance(content, str) and content.strip():
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": message})

    tools_schemas = _chat_tool_schemas()
    registry = _chat_tool_registry(record)
    tool_calls_log: list[dict] = []

    for iteration in range(_MAX_ITERATIONS):
        last_turn = iteration == _MAX_ITERATIONS - 1
        resp = luxia_client.chat_with_tools(
            messages,
            tools=None if last_turn else tools_schemas,  # force a text answer on the last turn
            image_urls=image_urls if iteration == 0 else None,
        )
        msg = resp.get("choices", [{}])[0].get("message", {}) or {}
        tool_calls = msg.get("tool_calls") if not last_turn else None

        if tool_calls:
            messages.append(msg)
            for tc in tool_calls:
                fn = tc.get("function", {})
                name = fn.get("name", "")
                try:
                    args = json.loads(fn.get("arguments", "{}"))
                except json.JSONDecodeError:
                    args = {}
                yield {"type": "tool_call", "name": name, "args": args}

                tool_fn = registry.get(name)
                if tool_fn is None:
                    result: object = {"error": f"unknown tool: {name}"}
                else:
                    try:
                        result = tool_fn(**args)
                    except Exception as exc:  # noqa: BLE001
                        logger.warning("chat tool %s failed: %s", name, exc)
                        result = {"error": str(exc)}

                tool_calls_log.append({"name": name, "args": args, "result": result})
                yield {"type": "tool_result", "name": name, "summary": _summarize_tool_result(name, result), "result": result}
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tc.get("id", name),
                        "name": name,
                        "content": json.dumps(result, ensure_ascii=False),
                    }
                )
            continue

        # Final answer — stream it out chunk by chunk.
        content = msg.get("content") or "응답을 생성하지 못했습니다. 다시 시도해주세요."
        for chunk in _chunk_text(content):
            yield {"type": "token", "text": chunk}
        yield {"type": "done", "reply": content, "agent_mode": "llm", "tool_calls": tool_calls_log}
        return


def chat_about_inspection(
    record: dict,
    message: str,
    history: list[dict] | None = None,
    trace: dict | None = None,
    use_llm: bool = True,
    extra_context: str = "",
) -> dict:
    """Non-streaming wrapper: drains the stream and returns the final dict."""
    reply = ""
    agent_mode = "llm"
    tool_calls: list[dict] = []
    for event in stream_chat_about_inspection(record, message, history, trace, use_llm, extra_context):
        if event.get("type") == "done":
            reply = event.get("reply", "")
            agent_mode = event.get("agent_mode", "llm")
            tool_calls = event.get("tool_calls", [])
    return {"reply": reply, "agent_mode": agent_mode, "tool_calls": tool_calls}
