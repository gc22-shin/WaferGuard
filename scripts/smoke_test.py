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
            "lot_id": "LOT-SMOKE-042",
            "wafer_id": "WF-SMOKE-001",
            "line_id": "LINE-7",
            "equipment_id": "ETCH-02",
            "process_step": "Etch",
            "recipe_id": "RCP-SMOKE-ETCH",
            "image_source": "public_proxy",
            "proxy_dataset": "mvtec-ad",
            "defect_hint": "Scratch",
            "cd_nm": 31.8,
            "overlay_nm": 7.2,
            "film_thickness_nm": 91.2,
            "roughness_nm": 3.8,
            "defect_count": 240,
        },
    )
    assert inspection.status_code == 200, inspection.text
    payload = inspection.json()
    assert payload["defect_type"] == "Scratch"
    assert payload["overlay_url"].endswith("_overlay.png")
    assert payload["roi_url"].endswith("_roi.png")
    assert payload["image_source"] == "public_proxy"
    assert payload["proxy_status"].startswith("WM-811K wafer map")
    assert payload["action_card"]["defect_type"] == "Scratch"
    assert payload["process_context"]["process_step"] == "Etch"
    assert payload["metrology"]["cd_nm"] == 31.8
    assert payload["metrology"]["roughness_nm"] == 3.8
    assert payload["metrology"]["defect_count"] == 240
    assert payload["status"] == "review_required"
    assert payload["action_card"]["metrology_rule_hits"]
    assert payload["action_card"]["metrology_risk_delta"] > 0

    metrics = client.get("/api/v1/metrics")
    assert metrics.status_code == 200, metrics.text
    assert metrics.json()["total_inspections"] >= 1

    evaluation = client.get("/api/v1/evaluation/wm811k")
    assert evaluation.status_code == 200, evaluation.text
    eval_payload = evaluation.json()
    assert eval_payload["dataset"]["name"] == "WM-811K"
    assert len(eval_payload["confusion_matrix"]["labels"]) == 9
    assert eval_payload["summary"]["critical_missed_as_normal"] > 0
    assert "fixture" in eval_payload["dataset"]["mode"]

    rag_eval = client.get("/api/v1/rag/evaluation")
    assert rag_eval.status_code == 200, rag_eval.text
    assert rag_eval.json()["summary"]["question_count"] >= 10

    proxy_datasets = client.get("/api/v1/proxy-datasets")
    assert proxy_datasets.status_code == 200, proxy_datasets.text
    assert "반도체 fab 이미지로 표현하면 안 됩니다" in proxy_datasets.json()["source_boundary"]

    thresholds = client.get("/api/v1/metrology/thresholds")
    assert thresholds.status_code == 200, thresholds.text
    assert thresholds.json()["fields"]

    drift = client.post("/api/v1/mlops/drift", json={"intensity": "strong", "line_id": "LINE-7"})
    assert drift.status_code == 200, drift.text

    demo = client.post(
        "/api/v1/demo/seed",
        json={"line_id": "LINE-SMOKE", "reviewer": "smoke-test", "include_reviews": True},
    )
    assert demo.status_code == 200, demo.text
    assert demo.json()["created_count"] == 9
    assert demo.json()["reviewed_count"] == 9

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

    scheduled_a = client.post(
        "/api/v1/handoff/report",
        json={
            "shift_from": "day",
            "shift_to": "night",
            "line_id": "LINE-SMOKE",
            "operator": "smoke-test",
            "note": "자동 초안 중복 방지 테스트",
            "scheduled_for": "23:59",
            "reuse_existing": True,
        },
    )
    assert scheduled_a.status_code == 200, scheduled_a.text
    scheduled_b = client.post(
        "/api/v1/handoff/report",
        json={
            "shift_from": "day",
            "shift_to": "night",
            "line_id": "LINE-SMOKE",
            "operator": "smoke-test",
            "note": "자동 초안 중복 방지 테스트",
            "scheduled_for": "23:59",
            "reuse_existing": True,
        },
    )
    assert scheduled_b.status_code == 200, scheduled_b.text
    assert scheduled_b.json()["id"] == scheduled_a.json()["id"]
    assert scheduled_b.json().get("reused_existing") is True

    state = client.get("/api/v1/mlops/state")
    assert state.status_code == 200, state.text

    copilot = client.get("/api/v1/copilot/ops?line_id=LINE-7")
    assert copilot.status_code == 200, copilot.text
    assert copilot.json()["action_recommendations"]

    # Verify new endpoints
    approvals = client.get("/api/v1/pending-approvals")
    assert approvals.status_code == 200, approvals.text

    db_overview = client.get("/api/v1/db/overview")
    assert db_overview.status_code == 200, db_overview.text
    assert any(t["name"] == "inspections" for t in db_overview.json()["tables"])

    db_rows = client.get("/api/v1/db/tables/inspections?limit=5")
    assert db_rows.status_code == 200, db_rows.text
    assert db_rows.json()["total"] >= 1
    assert client.get("/api/v1/db/tables/not_a_table").status_code == 404

    print(
        {
            "health": health.json()["status"],
            "inspection_id": payload["id"],
            "risk": payload["risk_level"],
            "agent_mode": payload.get("agent_mode", "n/a"),
            "metrology_rule_hits": len(payload["action_card"]["metrology_rule_hits"]),
            "roi": payload["roi_url"],
            "wm811k_macro_f1": eval_payload["summary"]["macro_f1"],
            "rag_eval_questions": rag_eval.json()["summary"]["question_count"],
            "drift_status": drift.json()["status"],
            "demo_created": demo.json()["created_count"],
            "handoff_id": handoff.json()["id"],
            "pending_approvals": len(approvals.json()),
            "copilot_actions": len(copilot.json()["action_recommendations"]),
            "models": len(state.json()["models"]),
            "db_tables": len(db_overview.json()["tables"]),
        }
    )


if __name__ == "__main__":
    main()
