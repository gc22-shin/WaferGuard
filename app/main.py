from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.services.config import OUTPUT_DIR, ensure_runtime_dirs
from app.services.automation import automation_status, run_automation_tick
from app.services.copilot import ops_copilot_summary
from app.services.data_registry import metrology_threshold_basis, proxy_dataset_manifest
from app.services.demo import seed_demo_data
from app.services.evaluation import wm811k_evaluation_report
from app.services.handoff import generate_handoff_report, get_latest_handoff_report
from app.services.mlops import pipeline_state, promote_latest, rollback, simulate_drift, simulate_retraining
from app.services.pipeline import run_inspection
from app.services.rag_eval import rag_evaluation_set
from app.services.schemas import (
    AutomationTickRequest,
    DemoSeedRequest,
    DriftRequest,
    HandoffReportRequest,
    InspectRequest,
    PromoteRequest,
    RetrainRequest,
    ReviewRequest,
    RollbackRequest,
)
from app.services.storage import (
    get_inspection,
    init_db,
    insert_alert,
    list_inspections,
    list_pending_approvals,
    metrics,
    record_review,
    resolve_approval,
)

ensure_runtime_dirs()
init_db()

app = FastAPI(
    title="WaferGuard Agent Simulation API",
    version="0.1.0",
    description="Local MVP for simulated wafer/process anomaly response with Agent decisions, RAG evidence, action cards, and handoff reports.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
    ],
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/outputs", StaticFiles(directory=OUTPUT_DIR), name="outputs")


@app.get("/health")
def health() -> dict[str, object]:
    return {"status": "ok", "service": "waferguard-api"}


@app.post("/api/v1/inspect")
def inspect(request: InspectRequest) -> dict[str, object]:
    return run_inspection(request)


@app.get("/api/v1/inspections")
def inspections(limit: int = 20) -> list[dict[str, object]]:
    return list_inspections(limit=limit)


@app.get("/api/v1/inspect/{inspection_id}")
def inspection_detail(inspection_id: str) -> dict[str, object]:
    record = get_inspection(inspection_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Inspection not found")
    return record


@app.post("/api/v1/review/{inspection_id}")
def review(inspection_id: str, request: ReviewRequest) -> dict[str, object]:
    record = record_review(inspection_id, request.decision, request.reviewer, request.note)
    if record is None:
        raise HTTPException(status_code=404, detail="Inspection not found")
    return record


@app.post("/api/v1/demo/seed")
def demo_seed(request: DemoSeedRequest) -> dict[str, object]:
    return seed_demo_data(request)


@app.get("/api/v1/metrics")
def service_metrics() -> dict[str, object]:
    return metrics()


@app.get("/api/v1/evaluation/wm811k")
def wm811k_evaluation() -> dict[str, object]:
    return wm811k_evaluation_report()


@app.get("/api/v1/rag/evaluation")
def rag_evaluation() -> dict[str, object]:
    return rag_evaluation_set()


@app.get("/api/v1/automation/status")
def monitor_status(line_id: str = "LINE-7") -> dict[str, object]:
    return automation_status(line_id=line_id)


@app.post("/api/v1/automation/tick")
def monitor_tick(request: AutomationTickRequest) -> dict[str, object]:
    return run_automation_tick(request)


@app.get("/api/v1/proxy-datasets")
def proxy_datasets() -> dict[str, object]:
    return proxy_dataset_manifest()


@app.get("/api/v1/metrology/thresholds")
def metrology_thresholds() -> dict[str, object]:
    return metrology_threshold_basis()


@app.get("/api/v1/handoff/latest")
def latest_handoff() -> dict[str, object]:
    report = get_latest_handoff_report()
    if report is None:
        raise HTTPException(status_code=404, detail="No handoff report yet")
    return report


@app.post("/api/v1/handoff/report")
def handoff_report(request: HandoffReportRequest) -> dict[str, object]:
    return generate_handoff_report(request)


@app.get("/api/v1/copilot/ops")
def ops_copilot(line_id: str = "ALL") -> dict[str, object]:
    return ops_copilot_summary(line_id=line_id)


@app.get("/api/v1/mlops/state")
def mlops_state() -> dict[str, object]:
    return pipeline_state()


@app.post("/api/v1/mlops/drift")
def drift(request: DriftRequest) -> dict[str, object]:
    return simulate_drift(request)


@app.post("/api/v1/mlops/retrain")
def retrain(request: RetrainRequest) -> dict[str, object]:
    return simulate_retraining(request)


@app.post("/api/v1/models/promote")
def promote(request: PromoteRequest) -> dict[str, object]:
    return promote_latest(request.version)


@app.post("/api/v1/models/rollback")
def model_rollback(request: RollbackRequest) -> dict[str, object]:
    return rollback(request.reason)


# ---------------------------------------------------------------------------
# Pending Approvals (Part 1-3)
# ---------------------------------------------------------------------------


@app.get("/api/v1/pending-approvals")
def pending_approvals(status: str = "pending") -> list[dict[str, object]]:
    """List High-risk Tool requests awaiting human approval."""
    return list_pending_approvals(status=status)


@app.post("/api/v1/approvals/{approval_id}/approve")
def approve_action(approval_id: str) -> dict[str, object]:
    """Approve a pending High-risk Tool request and execute the underlying action."""
    row = resolve_approval(approval_id, "approved")
    if row is None:
        raise HTTPException(status_code=404, detail="Approval not found")

    tool_name = row.get("tool_name", "")
    payload = row.get("payload", {})

    # Execute the actual action post-approval
    if tool_name == "trigger_critical_alert":
        insert_alert(
            "critical",
            "sns/slack",
            payload.get("message", f"승인된 critical alert: {row.get('inspection_id')}"),
        )
    elif tool_name == "recommend_retrain":
        try:
            from app.services.mlops import simulate_retraining  # noqa: PLC0415
            from app.services.schemas import RetrainRequest as _RR  # noqa: PLC0415

            simulate_retraining(_RR(trigger_type="manual"))
        except Exception as exc:  # noqa: BLE001
            row["retraining_note"] = f"재학습 시뮬레이션 오류: {exc}"

    row["executed_action"] = tool_name
    return row


@app.post("/api/v1/approvals/{approval_id}/reject")
def reject_action(approval_id: str) -> dict[str, object]:
    """Reject a pending High-risk Tool request."""
    row = resolve_approval(approval_id, "rejected")
    if row is None:
        raise HTTPException(status_code=404, detail="Approval not found")
    return row


@app.post("/api/v1/inspect/{inspection_id}/re-agent")
def re_agent(inspection_id: str) -> dict[str, object]:
    """Manually trigger Agent re-analysis on any inspection in the review queue."""
    record = get_inspection(inspection_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Inspection not found")

    try:
        from app.services.agent import run as agent_run  # noqa: PLC0415

        evidence = {
            "inspection_id": inspection_id,
            "defect_type": record.get("defect_type"),
            "risk_level": record.get("risk_level"),
            "risk_score": record.get("risk_score"),
            "confidence": record.get("confidence"),
            "metrology_rule_hits": record.get("action_card", {}).get("metrology_rule_hits", []),
            "rag_cases": record.get("cases", []),
            "process_context": record.get("process_context", {}),
            "metrology": record.get("metrology", {}),
            "image_urls": [
                url for url in [record.get("overlay_url"), record.get("roi_url")] if url
            ],
        }
        agent_result = agent_run(evidence)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Agent re-run failed: {exc}") from exc

    return {
        "inspection_id": inspection_id,
        "agent_final_action": agent_result.get("final_action"),
        "agent_tool_calls": agent_result.get("tool_calls"),
        "agent_trace_id": agent_result.get("trace_id"),
        "agent_mode": agent_result.get("agent_mode"),
    }
