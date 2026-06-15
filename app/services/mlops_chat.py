"""
MLOps chat — the fleet-level MLOps agent in conversational mode.

Same agent as the streaming MLOps monitor (agent.py): it shares that agent's
persona (system prompt) and tools — get_mlops_state, get_metrology_trend,
get_equipment_history, recommend_retrain (bound to the approval queue here, so a
chat never silently launches a retrain). The difference from the one-shot monitor
run is the turn structure: this is a multi-turn streaming conversation grounded in
the monitoring log so far.

The model is given the running monitoring log (recent agent runs + current model/
drift state + how engineers ruled on past recommendations) as context, so the
engineer can ask "왜 재학습 권고했어?" / "지금 드리프트 어때?" and get answers tied
to what actually happened, not generic ones.

Two entry points share one loop, mirroring defect_chat:
- ``stream_mlops_chat`` yields SSE event dicts (tool_call / tool_result / token / done).
- ``chat_about_mlops`` drains the stream and returns the final dict.
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
_CHUNK_SIZE = 3
_MONITORING_LOG_LIMIT = 8

# Conversation-mode addendum, appended to the MLOps agent's system prompt so the
# monitor and the chat share one identity and one set of rules.
_CHAT_ADDENDUM = (
    "\n\n=== 대화 모드 ===\n"
    "지금은 위 MLOps 에이전트 역할 그대로, 엔지니어와 실시간으로 대화하는 모드입니다. 아래 규칙을 추가로 따릅니다.\n"
    "1. 아래 [모니터링 로그]가 지금까지 이 에이전트가 점검한 운영 상태와 판단 기록입니다. "
    "'정보가 부족하다'고 되묻지 말고, 이 로그와 도구 조회 결과를 근거로 바로 구체적으로 답합니다.\n"
    "2. 현재 상태·수치를 묻는 질문(모델/레지스트리 상태, 재학습 현황, drift, 설비 계측 추세, 결함 분포 등)에는 "
    "답하기 전에 반드시 해당 도구를 먼저 호출해 최신 값을 확인하고 그 값을 인용합니다. "
    "예: 모델/재학습/드리프트 → get_mlops_state 또는 get_model_registry, 계측 추세 → get_metrology_trend, 설비 이력 → get_equipment_history. "
    "로그에 값이 있어 보여도, 최신 확인을 위해 도구 호출을 우선합니다(추측·암기 금지).\n"
    "3. '왜 그렇게 판단했어?' 같은 순수 해석 질문은 도구 없이 로그 근거로 설명해도 됩니다. 단, 인용하는 수치가 오래됐을 가능성이 있으면 도구로 다시 확인합니다.\n"
    "4. 과거 사람 피드백(담당자 코멘트 포함)이 있으면 반드시 반영합니다. 같은 조치가 과거에 반려됐다면 같은 권고를 반복하지 말고 코멘트 사유를 짚어 답합니다.\n"
    "5. recommend_retrain을 호출하면 자동 실행되지 않고 승인 대기열에 등록됩니다. 정말 필요할 때만 신중히 호출하세요.\n"
    "6. 답변은 한국어로 3~6문장 또는 번호 목록으로 간결하게. 되묻지 말고 가장 합리적인 다음 행동을 제안합니다."
)


def _outcome_of(trace: dict) -> str:
    tools = trace.get("tool_calls") or []
    rec = next((t for t in tools if t.get("name") == "recommend_retrain"), None)
    if rec is None:
        return "현 상태 유지"
    # Reconcile with how the human eventually ruled — a recommendation later
    # rejected/approved must NOT keep reading as a live "재학습 권고/승인 대기".
    result = rec.get("result") or {}
    mode = result.get("mode")
    if mode == "auto" or result.get("executed"):
        return "재학습 자동 실행"
    approval_id = result.get("approval_id")
    if approval_id:
        try:
            from app.services.storage import get_approval  # noqa: PLC0415

            row = get_approval(approval_id) or {}
        except Exception:  # noqa: BLE001
            row = {}
        status = row.get("status")
        if status == "rejected":
            comment = (row.get("comment") or "").strip()
            return f"재학습 권고 → 담당자 거절{f' (사유: {comment[:50]})' if comment else ''}"
        if status == "approved":
            return "재학습 권고 → 담당자 승인"
    return "재학습 권고 (승인 대기)"


def _monitoring_log_context(line_id: str) -> str:
    """The running monitoring log: recent agent runs + current operational state.

    This is what the chat is grounded in — the user explicitly wants the agent to
    'hold the monitoring log so far as context'.
    """
    sections: list[str] = []

    # current operational state + fleet human feedback (incl. approval comments)
    try:
        from app.services.agent import _build_mlops_evidence  # noqa: PLC0415

        sections.append("[현재 운영 상태]\n" + _build_mlops_evidence(line_id))
    except Exception as exc:  # noqa: BLE001
        logger.debug("mlops chat evidence build failed: %s", exc)

    # the running monitoring log (recent agent runs, newest first)
    try:
        from app.services.storage import list_mlops_agent_traces  # noqa: PLC0415

        traces = list_mlops_agent_traces(limit=_MONITORING_LOG_LIMIT)
    except Exception as exc:  # noqa: BLE001
        logger.debug("mlops chat trace load failed: %s", exc)
        traces = []

    if traces:
        lines = ["[모니터링 로그 — 최근 점검 기록 (최신순)]"]
        for t in traces:
            ts = (t.get("created_at") or "")[:19].replace("T", " ")
            trig = "위임" if t.get("trigger") == "delegation" else "수동/자동"
            autonomy = t.get("autonomy") or "approval"
            outcome = _outcome_of(t)
            tools = t.get("tool_calls") or []
            tool_names = ", ".join(dict.fromkeys(tc.get("name", "") for tc in tools)) or "없음"
            final = (t.get("final_action") or "").strip().replace("\n", " ")
            if len(final) > 200:
                final = final[:200] + "…"
            lines.append(
                f"- {ts} · {trig} · 자율={autonomy} · 결론={outcome} · 사용툴=[{tool_names}]"
                + (f"\n  판단: {final}" if final else "")
            )
        sections.append("\n".join(lines))
    else:
        sections.append("[모니터링 로그] 아직 기록된 점검 실행이 없습니다.")

    return "\n\n".join(sections)


def _stub_message(use_llm: bool) -> str:
    if not use_llm:
        return (
            "설정에서 LLM 호출이 꺼져 있어 채팅 응답을 생성할 수 없습니다. "
            "설정 탭의 'Agent LLM 분석'을 켜면 모니터링 로그를 근거로 답해드립니다."
        )
    return (
        "LLM이 비활성 상태라 채팅 응답을 생성할 수 없습니다. "
        ".env에 LUXIA_API_KEY를 설정하면 모니터링 로그를 근거로 질문에 답해드립니다."
    )


def _chunk_text(text: str, size: int = _CHUNK_SIZE) -> Iterator[str]:
    for i in range(0, len(text), size):
        yield text[i : i + size]


def _summarize_tool_result(name: str, result: object) -> str:
    try:
        from app.services.agent import _summarize_mlops_tool  # noqa: PLC0415

        return _summarize_mlops_tool(name, result)
    except Exception:  # noqa: BLE001
        return "완료"


def stream_mlops_chat(
    message: str,
    history: list[dict] | None = None,
    use_llm: bool = True,
    extra_context: str = "",
    line_id: str = "ALL",
) -> Iterator[dict]:
    """Agentic MLOps chat turn, yielding SSE-friendly event dicts.

    Event types: tool_call / tool_result / token / done — same contract the
    inspection chat and MLOps monitor use, so the frontend reuses its handler.
    """
    has_key = bool(os.environ.get("LUXIA_API_KEY", "").strip())
    if not use_llm or not has_key:
        msg = _stub_message(use_llm)
        yield {"type": "token", "text": msg}
        yield {"type": "done", "reply": msg, "agent_mode": "stub", "tool_calls": []}
        return

    try:
        from app.services.agent import (  # noqa: PLC0415
            _MLOPS_SYSTEM_PROMPT,
            _mlops_registry,
            _mlops_tool_schemas,
        )
    except ImportError as exc:
        logger.error("mlops chat could not load agent internals: %s", exc)
        msg = "MLOps 에이전트 구성을 불러오지 못했습니다."
        yield {"type": "token", "text": msg}
        yield {"type": "done", "reply": msg, "agent_mode": "error", "tool_calls": []}
        return

    system_content = _MLOPS_SYSTEM_PROMPT + _CHAT_ADDENDUM + "\n\n" + _monitoring_log_context(line_id)
    if extra_context and extra_context.strip():
        system_content += "\n\n[화면에 표시된 모니터링 로그 — 엔지니어가 보고 있는 내용]\n" + extra_context.strip()

    messages: list[dict] = [{"role": "system", "content": system_content}]
    for turn in (history or [])[-_MAX_HISTORY:]:
        role = turn.get("role")
        content = turn.get("content")
        if role in ("user", "assistant") and isinstance(content, str) and content.strip():
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": message})

    schemas = _mlops_tool_schemas()
    registry = _mlops_registry("approval")  # chat never auto-executes retrain
    tool_calls_log: list[dict] = []

    for iteration in range(_MAX_ITERATIONS):
        last_turn = iteration == _MAX_ITERATIONS - 1
        resp = luxia_client.chat_with_tools(messages, tools=None if last_turn else schemas)
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
                        logger.warning("mlops chat tool %s failed: %s", name, exc)
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

        content = msg.get("content") or "응답을 생성하지 못했습니다. 다시 시도해주세요."
        for chunk in _chunk_text(content):
            yield {"type": "token", "text": chunk}
        yield {"type": "done", "reply": content, "agent_mode": "llm", "tool_calls": tool_calls_log}
        return


def chat_about_mlops(
    message: str,
    history: list[dict] | None = None,
    use_llm: bool = True,
    extra_context: str = "",
    line_id: str = "ALL",
) -> dict:
    """Non-streaming wrapper: drains the stream and returns the final dict."""
    reply = ""
    agent_mode = "llm"
    tool_calls: list[dict] = []
    for event in stream_mlops_chat(message, history, use_llm, extra_context, line_id):
        if event.get("type") == "done":
            reply = event.get("reply", "")
            agent_mode = event.get("agent_mode", "llm")
            tool_calls = event.get("tool_calls", [])
    return {"reply": reply, "agent_mode": agent_mode, "tool_calls": tool_calls}
