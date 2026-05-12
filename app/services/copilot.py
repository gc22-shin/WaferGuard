from __future__ import annotations

from collections import Counter, defaultdict

from app.services.storage import latest_handoff_report, list_inspections_for_handoff, metrics


ACTION_PLAYBOOK = {
    "Scratch": {
        "check": "이송 arm, cassette slot, load port 접촉 여부",
        "owner": "Equipment",
        "why": "선형 결함은 물리 접촉이나 이송 구간 문제와 연결될 가능성이 큼",
    },
    "Edge-Ring": {
        "check": "EBR, CMP edge exclusion, edge handling 조건",
        "owner": "Process",
        "why": "엣지 링 패턴은 edge 공정 조건 또는 가장자리 handling 이슈와 자주 연결됨",
    },
    "Edge-Loc": {
        "check": "edge grip mark, robot handoff, 이송 로그",
        "owner": "Equipment",
        "why": "한쪽 edge에 몰린 결함은 grip/이송 위치와 비교해야 함",
    },
    "Center": {
        "check": "CMP pad condition, focus/exposure, 중심부 두께 편차",
        "owner": "Process",
        "why": "중심부 집중 패턴은 압력/두께/focus 조건 변화와 연결될 수 있음",
    },
    "Donut": {
        "check": "증착 온도 zone, showerhead PM, film uniformity",
        "owner": "Process",
        "why": "링 형태 결함은 증착 균일도와 chamber condition 확인이 필요함",
    },
    "Loc": {
        "check": "chamber particle trend, 국소 오염, 최근 PM 이력",
        "owner": "Equipment",
        "why": "국소 결함은 특정 chamber 오염이나 particle event 가능성이 있음",
    },
    "Random": {
        "check": "클린룸 particle trend, 세정 조건, 필터 교체 이력",
        "owner": "Yield",
        "why": "무작위 분산은 환경/세정/일시 오염 이벤트와 비교해야 함",
    },
    "Near-full": {
        "check": "recipe mismatch, operator override, lot start 조건",
        "owner": "Process",
        "why": "전체에 가까운 불량은 즉시 lot hold와 recipe 확인이 필요함",
    },
    "None": {
        "check": "정상 baseline 저장 후 다음 lot 변동 비교",
        "owner": "Yield",
        "why": "정상 wafer는 drift 기준선으로 활용 가능함",
    },
}


def ops_copilot_summary(line_id: str = "ALL") -> dict[str, object]:
    rows = list_inspections_for_handoff(line_id, limit=80)
    handoff = latest_handoff_report()
    data = metrics()
    equipment_memory = _equipment_memory(rows)
    action_recommendations = _action_recommendations(rows)
    near_miss_log = _near_miss_log(rows, handoff)
    human_decision_trace = _human_decision_trace(rows)

    return {
        "headline": _headline(equipment_memory, action_recommendations, near_miss_log),
        "line_id": line_id,
        "equipment_memory": equipment_memory,
        "action_recommendations": action_recommendations,
        "near_miss_log": near_miss_log,
        "human_decision_trace": human_decision_trace,
        "handoff_linked": bool(handoff),
        "latest_handoff_id": handoff["id"] if handoff else None,
        "latest_drift_event": data["latest_drift_event"],
    }


def _equipment_memory(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    grouped: dict[str, list[dict[str, object]]] = defaultdict(list)
    for row in rows:
        grouped[str(row["equipment_id"])].append(row)

    memory: list[dict[str, object]] = []
    for equipment_id, items in grouped.items():
        defect_counts = Counter(str(item["defect_type"]) for item in items)
        risk_counts = Counter(str(item["risk_level"]) for item in items)
        top_defect, top_count = defect_counts.most_common(1)[0]
        avg_risk = sum(float(item["risk_score"]) for item in items) / len(items)
        playbook = ACTION_PLAYBOOK.get(top_defect, ACTION_PLAYBOOK["Random"])
        repeated = top_count >= 2 or risk_counts["High"] > 0
        memory.append(
            {
                "equipment_id": equipment_id,
                "main_pattern": top_defect,
                "pattern_count": top_count,
                "inspection_count": len(items),
                "high_risk_count": risk_counts["High"],
                "avg_risk_score": round(avg_risk, 3),
                "last_seen": items[0]["created_at"],
                "memory_note": (
                    f"{top_defect} 패턴이 반복되어 {playbook['check']} 확인 필요"
                    if repeated
                    else f"현재는 {top_defect} 단발성 관찰. 다음 lot에서 반복 여부 확인"
                ),
                "first_check": playbook["check"],
            }
        )
    return sorted(memory, key=lambda item: (item["high_risk_count"], item["avg_risk_score"]), reverse=True)[:6]


def _action_recommendations(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    candidates = [
        row
        for row in rows
        if row["risk_level"] in {"High", "Medium"} or row["status"] == "review_required"
    ][:8]
    recommendations = []
    for row in candidates:
        defect_type = str(row["defect_type"])
        playbook = ACTION_PLAYBOOK.get(defect_type, ACTION_PLAYBOOK["Random"])
        priority = "P0" if row["risk_level"] == "High" else "P1"
        recommendations.append(
            {
                "priority": priority,
                "inspection_id": row["id"],
                "wafer_id": row["wafer_id"],
                "equipment_id": row["equipment_id"],
                "defect_type": defect_type,
                "risk_level": row["risk_level"],
                "owner": playbook["owner"],
                "recommended_action": playbook["check"],
                "reason": playbook["why"],
            }
        )
    if recommendations:
        return recommendations
    return [
        {
            "priority": "P2",
            "inspection_id": None,
            "wafer_id": None,
            "equipment_id": "ALL",
            "defect_type": "None",
            "risk_level": "Low",
            "owner": "Yield",
            "recommended_action": "정상 lot baseline을 유지하고 다음 교대 때 변동 여부 확인",
            "reason": "현재 High/Medium 위험 항목이 없어 baseline 관리가 우선",
        }
    ]


def _near_miss_log(rows: list[dict[str, object]], handoff: dict[str, object] | None) -> list[dict[str, object]]:
    risky = [row for row in rows if row["risk_level"] == "High" or row["status"] == "review_required"][:8]
    logs = []
    for row in risky:
        status = "handoff_captured" if handoff else "needs_handoff"
        if row["engineer_decision"]:
            status = f"engineer_{row['engineer_decision']}"
        logs.append(
            {
                "inspection_id": row["id"],
                "wafer_id": row["wafer_id"],
                "equipment_id": row["equipment_id"],
                "defect_type": row["defect_type"],
                "risk_level": row["risk_level"],
                "prevention_status": status,
                "scrap_prevention_note": "후속 공정 투입 전 lot hold/review 판단 지점으로 기록됨",
            }
        )
    return logs


def _human_decision_trace(rows: list[dict[str, object]]) -> list[dict[str, object]]:
    trace = []
    for row in rows[:10]:
        playbook = ACTION_PLAYBOOK.get(str(row["defect_type"]), ACTION_PLAYBOOK["Random"])
        trace.append(
            {
                "inspection_id": row["id"],
                "ai_prediction": f"{row['defect_type']} / {round(float(row['confidence']) * 100)}%",
                "evidence": f"Risk {row['risk_level']}, hotspot {round(float(row['hotspot_ratio']) * 100, 1)}%",
                "engineer_decision": row["engineer_decision"] or "pending",
                "reviewer": row["reviewer"] or "-",
                "review_note": row["review_note"] or playbook["check"],
            }
        )
    return trace


def _headline(
    equipment_memory: list[dict[str, object]],
    action_recommendations: list[dict[str, object]],
    near_miss_log: list[dict[str, object]],
) -> str:
    if near_miss_log:
        first = near_miss_log[0]
        return (
            f"{first['equipment_id']} {first['defect_type']} 항목이 scrap near-miss로 기록되었습니다. "
            "다음 행동은 검사 결과가 아니라 설비/공정 확인으로 이어져야 합니다."
        )
    if equipment_memory:
        first = equipment_memory[0]
        return f"{first['equipment_id']}의 {first['main_pattern']} 패턴을 설비 메모리에 유지하고 다음 lot에서 반복 여부를 확인하세요."
    if action_recommendations:
        return action_recommendations[0]["recommended_action"]
    return "현재 운영 Copilot이 표시할 위험 항목이 없습니다."
