"""
Defect chat — LLM Q&A about a single inspection, grounded in its evidence.

The frontend keeps the conversation state and sends it back as `history`;
the backend is stateless and rebuilds the evidence context on every turn.
"""
from __future__ import annotations

import os

from app.services import luxia_client

_MAX_HISTORY = 10

_SYSTEM_PROMPT = (
    "당신은 WaferGuard의 결함 분석 어시스턴트입니다. "
    "아래 제공된 검사 evidence를 근거로 엔지니어의 질문에 한국어로 간결하게 답합니다.\n"
    "규칙:\n"
    "1. 제공된 evidence(분류 결과, 계측값, 룰 히트, RAG 유사 사례, Agent 판단) 범위 안에서 답합니다.\n"
    "2. evidence에 없는 수치나 사례를 만들어내지 않습니다. 모르면 모른다고 답합니다.\n"
    "3. 답변은 3~6문장 이내로, 필요하면 점검 순서를 번호로 제시합니다."
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
    return "\n".join(lines)


def chat_about_inspection(
    record: dict,
    message: str,
    history: list[dict] | None = None,
    trace: dict | None = None,
    use_llm: bool = True,
) -> dict:
    """One chat turn about an inspection. Returns {reply, agent_mode}."""
    if not use_llm:
        return {
            "reply": (
                "설정에서 LLM 호출이 꺼져 있어 채팅 응답을 생성할 수 없습니다. "
                "설정 탭의 'Agent LLM 분석'을 켜면 이 검사의 evidence를 근거로 답해드립니다."
            ),
            "agent_mode": "stub",
        }
    messages: list[dict] = [
        {"role": "system", "content": _SYSTEM_PROMPT + "\n\n[검사 Evidence]\n" + _evidence_context(record, trace)},
    ]
    for turn in (history or [])[-_MAX_HISTORY:]:
        role = turn.get("role")
        content = turn.get("content")
        if role in ("user", "assistant") and isinstance(content, str) and content.strip():
            messages.append({"role": role, "content": content})
    messages.append({"role": "user", "content": message})

    has_key = bool(os.environ.get("LUXIA_API_KEY", "").strip())
    if not has_key:
        return {
            "reply": (
                "LLM이 비활성 상태라 채팅 응답을 생성할 수 없습니다. "
                ".env에 LUXIA_API_KEY를 설정하면 이 검사의 evidence를 근거로 질문에 답해드립니다."
            ),
            "agent_mode": "stub",
        }

    result = luxia_client.chat_with_tools(messages)
    reply = (
        result.get("choices", [{}])[0].get("message", {}).get("content")
        or "응답을 생성하지 못했습니다. 다시 시도해주세요."
    )
    return {"reply": reply, "agent_mode": "llm"}
