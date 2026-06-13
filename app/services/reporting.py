"""
Fallback report builder — used only for Low-risk cases (Agent 미참여).

Medium/High/review_required cases receive their report text from the Agent
(agent.run → final_action). This module is intentionally short.
"""
from __future__ import annotations


def build_report(
    *,
    wafer_id: str,
    line_id: str,
    equipment_id: str,
    defect_type: str,
    confidence: float,
    risk_level: str,
    hotspot_ratio: float,
    cases: list[dict[str, str]],
    process_context: dict[str, object] | None = None,
    metrology: dict[str, object] | None = None,
    metrology_rule_hits: list[dict[str, object]] | None = None,
) -> str:
    """Generate a short rule-based report for Low-risk auto-screened wafers.

    For Medium/High cases, the Agent produces the full analysis text;
    this function provides a placeholder that pipeline.py replaces with
    agent.final_action when available.
    """
    first_action = cases[0]["action"] if cases else "엔지니어 검토 큐에서 수동 확인"
    confidence_text = "높음" if confidence >= 0.9 else "보통" if confidence >= 0.7 else "낮음"

    if risk_level == "Low":
        label = "룰 기반 자동 통과 (Agent 미참여)"
    else:
        label = f"위험도 {risk_level} — Agent 분석 진행 중"

    return (
        f"[{label}] "
        f"{wafer_id}은 {line_id}/{equipment_id}에서 {defect_type} 패턴으로 분류되었습니다. "
        f"신뢰도 {confidence:.1%} ({confidence_text}), "
        f"Grad-CAM hotspot {hotspot_ratio:.1%}.\n\n"
        f"우선 조치: {first_action}.\n\n"
        "이 리포트는 규칙 기반 fallback입니다. "
        "실제 배포에서는 Agent의 LLM 분석 텍스트로 대체됩니다."
    )
