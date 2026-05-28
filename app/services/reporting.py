from __future__ import annotations


SEVERITY_BY_DEFECT = {
    "Near-full": "심각",
    "Scratch": "심각",
    "Edge-Ring": "주의",
    "Edge-Loc": "주의",
    "Center": "주의",
    "Donut": "주의",
    "Loc": "주의",
    "Random": "주의",
    "None": "정상",
}


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
    severity = SEVERITY_BY_DEFECT.get(defect_type, "주의")
    first_action = cases[0]["action"] if cases else "엔지니어 검토 큐에서 수동 확인"
    confidence_text = "높음" if confidence >= 0.9 else "보통" if confidence >= 0.7 else "낮음"
    review_text = (
        "자동 승인 가능"
        if risk_level == "Low"
        else "엔지니어 검토 필요"
        if risk_level == "Medium"
        else "즉시 확인 및 라인 영향도 점검 필요"
    )
    context_text = ""
    if process_context and metrology:
        context_text = (
            f"\n\n공정/계측 맥락: {process_context.get('lot_id')} / "
            f"{process_context.get('process_step')} / {process_context.get('tool_id')} / "
            f"{process_context.get('recipe_id')} 기준입니다. "
            f"CD {metrology.get('cd_nm')}nm, overlay {metrology.get('overlay_nm')}nm, "
            f"film thickness {metrology.get('film_thickness_nm')}nm, "
            f"roughness {metrology.get('roughness_nm')}nm, "
            f"defect count {metrology.get('defect_count')}를 함께 확인합니다."
        )
    rule_text = ""
    if metrology_rule_hits:
        top_hit = metrology_rule_hits[0]
        rule_text = (
            f"\n\n계측 rule hit: {top_hit.get('signal')} / {top_hit.get('severity')}. "
            f"근거는 {top_hit.get('evidence')}이며, 조치는 {top_hit.get('action')}입니다."
        )

    return (
        f"{wafer_id}는 {line_id}/{equipment_id}에서 {defect_type} 패턴으로 분류되었습니다. "
        f"신뢰도는 {confidence:.1%}로 {confidence_text} 수준이며, Grad-CAM hotspot 비율은 "
        f"{hotspot_ratio:.1%}입니다.\n\n"
        f"운영 판단: 위험도는 {risk_level}이고 심각도는 {severity}입니다. {review_text}합니다.\n\n"
        f"우선 조치: {first_action}.{context_text}{rule_text}\n\n"
        "근거: 이 리포트는 로컬 MVP의 규칙 기반 리포트 엔진이 생성했습니다. "
        "실제 배포에서는 PRD의 Gemini API + RAG 결과로 같은 형식의 설명을 대체할 수 있습니다."
    )
