from __future__ import annotations

from datetime import datetime, timezone

from app.services.mlops import simulate_drift
from app.services.pipeline import run_inspection
from app.services.schemas import DemoSeedRequest, DriftRequest, InspectRequest
from app.services.storage import record_review


DEMO_SCENARIOS = [
    {
        "defect_hint": "Scratch",
        "equipment_id": "ETCH-02",
        "decision": "needs_review",
        "note": "이송 arm과 cassette slot 접촉 가능성 확인 필요",
    },
    {
        "defect_hint": "Edge-Ring",
        "equipment_id": "CMP-01",
        "decision": "needs_review",
        "note": "edge exclusion 조건과 ring wear 확인 필요",
    },
    {
        "defect_hint": "Center",
        "equipment_id": "LITHO-03",
        "decision": "approved",
        "note": "focus/exposure 로그와 일치해 공정 추세로 기록",
    },
    {
        "defect_hint": "Donut",
        "equipment_id": "CVD-04",
        "decision": "approved",
        "note": "온도 zone 편차 확인 대상으로 인수인계",
    },
    {
        "defect_hint": "Random",
        "equipment_id": "CLEAN-01",
        "decision": "false_alarm",
        "note": "원본 wafer map 재확인 결과 일시 particle noise로 판단",
    },
    {
        "defect_hint": "Near-full",
        "equipment_id": "ETCH-02",
        "decision": "needs_review",
        "note": "recipe mismatch 가능성으로 lot hold 검토",
    },
    {
        "defect_hint": "Edge-Loc",
        "equipment_id": "HANDLER-07",
        "decision": "needs_review",
        "note": "edge grip mark와 robot handoff 로그 비교 필요",
    },
    {
        "defect_hint": "Loc",
        "equipment_id": "PVD-05",
        "decision": "approved",
        "note": "국소 chamber particle event로 설비 메모리에 기록",
    },
    {
        "defect_hint": "None",
        "equipment_id": "METRO-01",
        "decision": "approved",
        "note": "정상 baseline으로 다음 lot 변동 비교",
    },
]


def seed_demo_data(request: DemoSeedRequest) -> dict[str, object]:
    stamp = datetime.now(timezone.utc).strftime("%m%d%H%M%S")
    created = []
    reviewed = []

    for index, scenario in enumerate(DEMO_SCENARIOS, start=1):
        inspection = run_inspection(
            InspectRequest(
                wafer_id=f"WF-DEMO-{stamp}-{index:02d}",
                line_id=request.line_id,
                equipment_id=str(scenario["equipment_id"]),
                defect_hint=scenario["defect_hint"],
                operator_note="데모 시나리오 자동 생성",
            )
        )
        created.append(inspection)

        if request.include_reviews:
            updated = record_review(
                str(inspection["id"]),
                str(scenario["decision"]),
                request.reviewer,
                str(scenario["note"]),
            )
            if updated is not None:
                reviewed.append(updated)

    drift_event = simulate_drift(DriftRequest(intensity="strong", line_id=request.line_id))
    return {
        "created_count": len(created),
        "reviewed_count": len(reviewed),
        "drift_event": drift_event,
        "inspections": created,
        "reviewed": reviewed,
        "message": "다양한 결함 샘플, 엔지니어 판단 이력, 드리프트 이벤트를 생성했습니다.",
    }
