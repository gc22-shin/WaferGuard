from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime, timezone

from app.services.schemas import HandoffReportRequest
from app.services.storage import (
    insert_handoff_report,
    latest_handoff_report,
    list_inspections_for_handoff,
    metrics,
    utc_now,
)


SHIFT_LABELS = {
    "day": "오전 근무",
    "swing": "오후 근무",
    "night": "야간 근무",
}


def get_latest_handoff_report() -> dict[str, object] | None:
    return latest_handoff_report()


def generate_handoff_report(request: HandoffReportRequest) -> dict[str, object]:
    rows = list_inspections_for_handoff(request.line_id, limit=60)
    data = metrics()
    high_risk = [row for row in rows if row["risk_level"] == "High"]
    review_required = [
        row
        for row in rows
        if row["status"] == "review_required" or row["engineer_decision"] == "needs_review"
    ]
    equipment_watch = _equipment_watch(rows)
    unresolved = _unresolved_items(high_risk, review_required)
    checklist = _next_shift_checklist(equipment_watch, high_risk, review_required, data)
    scrap_risk = _scrap_risk(high_risk, review_required, data)
    headline = _headline(rows, high_risk, review_required, equipment_watch)

    report = {
        "id": f"HANDOFF-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
        "shift_from": request.shift_from,
        "shift_from_label": SHIFT_LABELS[request.shift_from],
        "shift_to": request.shift_to,
        "shift_to_label": SHIFT_LABELS[request.shift_to],
        "line_id": request.line_id,
        "operator": request.operator,
        "headline": headline,
        "scrap_risk": scrap_risk,
        "summary": {
            "inspection_count": len(rows),
            "high_risk_count": len(high_risk),
            "review_required_count": len(review_required),
            "top_defects": _top_defects(rows),
            "latest_drift_event": data["latest_drift_event"],
        },
        "equipment_watch": equipment_watch,
        "unresolved_items": unresolved,
        "next_shift_checklist": checklist,
        "operator_note": request.note.strip(),
        "markdown": "",
        "created_at": utc_now(),
    }
    report["markdown"] = _markdown(report)
    insert_handoff_report(report)
    return report


def _headline(
    rows: list[dict[str, object]],
    high_risk: list[dict[str, object]],
    review_required: list[dict[str, object]],
    equipment_watch: list[dict[str, object]],
) -> str:
    if not rows:
        return "현재 인수인계할 검사 데이터가 없습니다. 다음 근무자는 첫 lot 투입 후 baseline을 확인하세요."
    if high_risk:
        first = high_risk[0]
        return (
            f"{first['equipment_id']}에서 {first['defect_type']} High Risk가 확인되었습니다. "
            "다음 근무자는 lot hold 여부와 설비 상태를 우선 확인해야 합니다."
        )
    if review_required:
        return "검토 대기 항목이 남아 있습니다. 다음 근무자는 Grad-CAM 근거와 현장 로그를 확인하세요."
    if equipment_watch:
        first = equipment_watch[0]
        return f"{first['equipment_id']} 설비에서 {first['main_defect']} 패턴 관찰 빈도가 높습니다. 추세 확인이 필요합니다."
    return "현재 심각 이슈는 없으며 정상 운영 상태입니다. 다음 근무자는 동일 조건에서 변동 여부를 확인하세요."


def _equipment_watch(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    grouped: dict[str, list[dict[str, object]]] = defaultdict(list)
    for row in rows:
        grouped[str(row["equipment_id"])].append(row)

    watch: list[dict[str, object]] = []
    for equipment_id, items in grouped.items():
        high_count = sum(1 for item in items if item["risk_level"] == "High")
        medium_count = sum(1 for item in items if item["risk_level"] == "Medium")
        top_defect = Counter(str(item["defect_type"]) for item in items).most_common(1)[0][0]
        avg_risk = sum(float(item["risk_score"]) for item in items) / len(items)
        if high_count == 0 and medium_count < 2 and avg_risk < 0.42:
            continue
        action = _action_for_defect(top_defect)
        watch.append(
            {
                "equipment_id": equipment_id,
                "main_defect": top_defect,
                "inspection_count": len(items),
                "high_risk_count": high_count,
                "medium_risk_count": medium_count,
                "avg_risk_score": round(avg_risk, 3),
                "handoff_reason": f"{top_defect} 패턴이 {len(items)}건 중 주요 패턴으로 관찰됨",
                "required_action": action,
            }
        )
    return sorted(watch, key=lambda item: (item["high_risk_count"], item["avg_risk_score"]), reverse=True)[:5]


def _unresolved_items(
    high_risk: list[dict[str, object]],
    review_required: list[dict[str, object]],
) -> list[dict[str, object]]:
    seen: set[str] = set()
    items: list[dict[str, object]] = []
    for row in [*high_risk, *review_required]:
        if str(row["id"]) in seen:
            continue
        seen.add(str(row["id"]))
        items.append(
            {
                "inspection_id": row["id"],
                "wafer_id": row["wafer_id"],
                "line_id": row["line_id"],
                "equipment_id": row["equipment_id"],
                "defect_type": row["defect_type"],
                "risk_level": row["risk_level"],
                "status": row["status"],
                "required_action": _action_for_defect(str(row["defect_type"])),
            }
        )
    return items[:8]


def _next_shift_checklist(
    equipment_watch: list[dict[str, object]],
    high_risk: list[dict[str, object]],
    review_required: list[dict[str, object]],
    data: dict[str, object],
) -> list[str]:
    checklist = [
        "근무 시작 시 High Risk/검토 큐를 먼저 열고 미처리 wafer를 확인",
        "동일 설비에서 같은 결함이 반복되는지 최근 lot 이력 비교",
    ]
    if equipment_watch:
        checklist.append(f"{equipment_watch[0]['equipment_id']} 설비 로그, PM 이력, recipe 변경 여부 확인")
    if high_risk:
        checklist.append("High Risk lot은 rework/scrap 판단 전 엔지니어 2차 확인 완료")
    if review_required:
        checklist.append("confidence 낮은 항목은 Grad-CAM overlay와 원본 wafer map을 함께 검토")
    if data["latest_drift_event"]:
        checklist.append("최신 drift score와 재학습 job 상태 확인")
    checklist.append("특이사항 확인 후 Daily Report를 다시 생성해 다음 교대자에게 남김")
    return checklist


def _scrap_risk(
    high_risk: list[dict[str, object]],
    review_required: list[dict[str, object]],
    data: dict[str, object],
) -> str:
    drift = data["latest_drift_event"]
    drift_detected = bool(drift and drift.get("status") == "detected")
    if len(high_risk) >= 2 or (high_risk and drift_detected):
        return "High"
    if high_risk or review_required or drift_detected:
        return "Medium"
    return "Low"


def _top_defects(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    counts = Counter(str(row["defect_type"]) for row in rows)
    return [{"defect_type": defect, "count": count} for defect, count in counts.most_common(5)]


def _action_for_defect(defect_type: str) -> str:
    actions = {
        "Scratch": "이송 arm, cassette slot, load port 접촉 여부 확인",
        "Edge-Ring": "EBR, CMP edge exclusion, edge handling 조건 확인",
        "Edge-Loc": "edge grip mark와 이송 로그 확인",
        "Center": "CMP pad condition, focus/exposure 로그 확인",
        "Donut": "증착 온도 zone, showerhead PM 이력 확인",
        "Loc": "chamber particle trend와 국소 오염 여부 확인",
        "Random": "클린룸 particle trend, 세정/필터 교체 이력 확인",
        "Near-full": "recipe mismatch 가능성 확인 후 lot hold 검토",
        "None": "정상 baseline으로 보관하고 다음 lot 변동 비교",
    }
    return actions.get(defect_type, "원본 이미지, Grad-CAM, 설비 로그를 함께 확인")


def _markdown(report: dict[str, object]) -> str:
    summary = report["summary"]
    equipment_lines = "\n".join(
        f"- {item['equipment_id']}: {item['main_defect']} / {item['required_action']}"
        for item in report["equipment_watch"]
    ) or "- 특이 설비 없음"
    unresolved_lines = "\n".join(
        f"- {item['inspection_id']} {item['wafer_id']} {item['defect_type']} {item['risk_level']}: {item['required_action']}"
        for item in report["unresolved_items"]
    ) or "- 미처리 항목 없음"
    checklist_lines = "\n".join(f"- {item}" for item in report["next_shift_checklist"])
    note = report["operator_note"] or "작성자 추가 메모 없음"

    return (
        f"# Daily Handoff Report - {report['id']}\n\n"
        f"- From: {report['shift_from_label']} -> To: {report['shift_to_label']}\n"
        f"- Line: {report['line_id']}\n"
        f"- Operator: {report['operator']}\n"
        f"- Scrap Risk: {report['scrap_risk']}\n"
        f"- Inspections: {summary['inspection_count']}\n"
        f"- High Risk: {summary['high_risk_count']}\n"
        f"- Review Required: {summary['review_required_count']}\n\n"
        f"## 핵심 인수인계\n\n{report['headline']}\n\n"
        f"## 설비 특이사항\n\n{equipment_lines}\n\n"
        f"## 미처리 항목\n\n{unresolved_lines}\n\n"
        f"## 다음 근무자 체크리스트\n\n{checklist_lines}\n\n"
        f"## 작성자 메모\n\n{note}\n"
    )
