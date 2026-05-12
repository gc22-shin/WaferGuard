import sys
from pathlib import Path

from fastapi.testclient import TestClient

ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR))

from app.main import app


def main() -> None:
    client = TestClient(app)

    health = client.get("/health")
    assert health.status_code == 200, health.text

    inspection = client.post(
        "/api/v1/inspect",
        json={
            "wafer_id": "WF-SMOKE-001",
            "line_id": "LINE-7",
            "equipment_id": "ETCH-02",
            "defect_hint": "Scratch",
        },
    )
    assert inspection.status_code == 200, inspection.text
    payload = inspection.json()
    assert payload["defect_type"] == "Scratch"
    assert payload["overlay_url"].endswith("_overlay.png")

    metrics = client.get("/api/v1/metrics")
    assert metrics.status_code == 200, metrics.text
    assert metrics.json()["total_inspections"] >= 1

    drift = client.post("/api/v1/mlops/drift", json={"intensity": "strong", "line_id": "LINE-7"})
    assert drift.status_code == 200, drift.text

    handoff = client.post(
        "/api/v1/handoff/report",
        json={
            "shift_from": "day",
            "shift_to": "night",
            "line_id": "LINE-7",
            "operator": "smoke-test",
            "note": "ETCH-02 scratch 추세 확인 필요",
        },
    )
    assert handoff.status_code == 200, handoff.text
    assert "다음 근무자 체크리스트" in handoff.json()["markdown"]

    edited = client.put(
        f"/api/v1/handoff/{handoff.json()['id']}",
        json={
            "headline": "교대 전 ETCH-02 이슈 확인 필요",
            "operator_note": "자동 초안 수정 테스트",
        },
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["status"] == "draft"
    assert "자동 초안 수정 테스트" in edited.json()["markdown"]

    sent = client.post(
        f"/api/v1/handoff/{handoff.json()['id']}/send",
        json={"sender": "smoke-test", "message": "이대로 전달합니다."},
    )
    assert sent.status_code == 200, sent.text
    assert sent.json()["status"] == "sent"

    state = client.get("/api/v1/mlops/state")
    assert state.status_code == 200, state.text

    copilot = client.get("/api/v1/copilot/ops?line_id=LINE-7")
    assert copilot.status_code == 200, copilot.text
    assert copilot.json()["action_recommendations"]

    print(
        {
            "health": health.json()["status"],
            "inspection_id": payload["id"],
            "risk": payload["risk_level"],
            "drift_status": drift.json()["status"],
            "handoff_id": handoff.json()["id"],
            "handoff_status": sent.json()["status"],
            "copilot_actions": len(copilot.json()["action_recommendations"]),
            "models": len(state.json()["models"]),
        }
    )


if __name__ == "__main__":
    main()
