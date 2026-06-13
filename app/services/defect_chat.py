"""
Defect chat — agentic LLM Q&A about a single inspection.

The chat is grounded in the inspection's evidence but is no longer single-shot:
it can call read-only tools (equipment history, metrology trend, MLOps state,
RAG search, multimodal wafer comparison) to answer questions whose answer is not
in the static evidence ("이 설비 최근에도 이랬어?").

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

# Read-only tools the chat agent may call. Names map into tools.TOOL_REGISTRY.
_CHAT_TOOL_NAMES = (
    "search_similar_cases",
    "get_equipment_history",
    "get_metrology_trend",
    "get_mlops_state",
    "compare_with_past_wafer",
)

_SYSTEM_PROMPT = (
    "당신은 WaferGuard의 반도체 공정 결함 대응 어시스턴트입니다. "
    "엔지니어는 지금 특정 검사(웨이퍼) 한 건을 보고 있고, 그 검사의 evidence(분류 결과, 리스크, "
    "계측값, 계측 룰 히트, 추정 원인, 권장 액션, RAG 유사 사례, Agent 판단)가 아래에 주어집니다.\n"
    "역할과 답변 규칙:\n"
    "1. 항상 '이 검사' 맥락 안에서, 현장 엔지니어에게 말하듯 한국어로 구체적으로 답합니다.\n"
    "2. 함께 제공되는 이미지는 '이 웨이퍼의 Grad-CAM/ROI 결함 이미지'입니다. 절대 "
    "'이 이미지는 무엇을 시각화한 것처럼 보입니다' 같은 일반적·추상적 설명을 하지 마세요. "
    "결함 위치·패턴을 evidence와 연결해 해석합니다.\n"
    "3. '그래서 내가 뭐해야돼?', '어떻게 조치해?', '다음 뭐 봐야돼?' 같은 질문에는 절대 일반론으로 "
    "답하지 말고, 위 evidence의 '권장 액션'과 '추정 원인'을 근거로 우선순위가 있는 구체적 조치를 "
    "1·2·3 번호로 제시합니다 (예: '1) ETCH-02 EBR nozzle 압력 로그부터 확인 → ...').\n"
    "4. evidence로 답할 수 있으면 evidence 범위 안에서 답합니다. evidence에 없는 정보(같은 설비 과거 "
    "이력, 계측 추세, 모델/drift 상태, 추가 유사 사례)가 필요하면 도구를 호출해 실제 데이터를 조회한 뒤 "
    "답합니다. 수치를 지어내지 않습니다.\n"
    "5. 'ETCH-02에서 최근에도 이랬어?'는 get_equipment_history로, '계속 밀리는 거야?'는 "
    "get_metrology_trend로 직접 확인하고, 결과를 근거로 인용합니다 (예: '24h 내 동일 결함 5회 → 반복성').\n"
    "6. 답변은 3~6문장 또는 번호 목록으로 간결하게. 질문이 모호해도 되묻지 말고, 이 검사에서 가장 "
    "합리적인 다음 행동을 제안합니다."
)


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
    lines.append(
        "\n[도구 사용 힌트] 이 설비 ID="
        f"{record.get('equipment_id')}, 결함 유형={record.get('defect_type')}. "
        "과거 이력/추세 질문에는 이 값을 도구 인자로 사용하세요."
    )
    return "\n".join(lines)


def _chat_tool_schemas() -> list[dict]:
    try:
        from app.services.tools import TOOL_SCHEMAS  # noqa: PLC0415

        return [s for s in TOOL_SCHEMAS if s.get("function", {}).get("name") in _CHAT_TOOL_NAMES]
    except ImportError:
        return []


def _chat_tool_registry() -> dict:
    try:
        from app.services.tools import TOOL_REGISTRY  # noqa: PLC0415

        return {n: TOOL_REGISTRY[n] for n in _CHAT_TOOL_NAMES if n in TOOL_REGISTRY}
    except ImportError:
        return {}


def _summarize_tool_result(name: str, result: object) -> str:
    """Short human-readable line shown in the chat tool-activity UI."""
    if not isinstance(result, dict):
        if isinstance(result, list):
            return f"{len(result)}건 반환"
        return str(result)[:80]
    if result.get("error"):
        return f"오류: {result['error']}"
    if name == "get_equipment_history":
        rec = "· 반복성 결함" if result.get("is_recurring") else ""
        return (
            f"{result.get('equipment_id')} 최근 {result.get('window_hours')}h: "
            f"검사 {result.get('total_inspections')}건, 동일결함 {result.get('same_defect_count')}회 {rec}"
        )
    if name == "get_metrology_trend":
        return (
            f"{result.get('metric')} 추세 {result.get('trend')} "
            f"(Δ{result.get('delta')}, {result.get('pct_change')}%, n={result.get('n')})"
        )
    if name == "get_mlops_state":
        pm = result.get("production_model") or {}
        de = result.get("latest_drift_event") or {}
        return f"운영모델 F1 {pm.get('f1_score', '?')}, drift {de.get('status', '?')}"
    if name == "compare_with_past_wafer":
        return "웨이퍼 이미지 비교 완료"
    if name == "search_similar_cases":
        return "유사 사례 검색 완료"
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

    # Attach the wafer image only on the opening message of a conversation. Re-sending
    # it on every follow-up makes the model re-anchor on "describe this image" and
    # answer generically (e.g. "이 이미지는 ...") instead of staying on the case.
    is_opening_turn = not (history or [])
    image_urls = [u for u in [record.get("overlay_url"), record.get("roi_url")] if u] if is_opening_turn else []

    system_content = _SYSTEM_PROMPT + "\n\n[검사 Evidence]\n" + _evidence_context(record, trace)
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
    registry = _chat_tool_registry()
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
