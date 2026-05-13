from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.services.config import OUTPUT_DIR, ensure_runtime_dirs
from app.services.copilot import ops_copilot_summary
from app.services.demo import seed_demo_data
from app.services.handoff import edit_handoff_report, generate_handoff_report, get_latest_handoff_report, send_handoff_report
from app.services.mlops import pipeline_state, promote_latest, rollback, simulate_drift, simulate_retraining
from app.services.pipeline import run_inspection
from app.services.schemas import (
    DemoSeedRequest,
    DriftRequest,
    HandoffEditRequest,
    HandoffReportRequest,
    HandoffSendRequest,
    InspectRequest,
    PromoteRequest,
    RetrainRequest,
    ReviewRequest,
    RollbackRequest,
)
from app.services.storage import (
    get_inspection,
    init_db,
    list_inspections,
    metrics,
    record_review,
)

ensure_runtime_dirs()
init_db()

app = FastAPI(
    title="WaferGuard MLOps API",
    version="0.1.0",
    description="Local MVP for wafer defect classification, XAI, RAG reporting, and MLOps simulations.",
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


@app.get("/api/v1/handoff/latest")
def latest_handoff() -> dict[str, object]:
    report = get_latest_handoff_report()
    if report is None:
        raise HTTPException(status_code=404, detail="No handoff report yet")
    return report


@app.post("/api/v1/handoff/report")
def handoff_report(request: HandoffReportRequest) -> dict[str, object]:
    return generate_handoff_report(request)


@app.put("/api/v1/handoff/{report_id}")
def update_handoff_report(report_id: str, request: HandoffEditRequest) -> dict[str, object]:
    report = edit_handoff_report(report_id, request)
    if report is None:
        raise HTTPException(status_code=404, detail="Handoff report not found")
    return report


@app.post("/api/v1/handoff/{report_id}/send")
def confirm_handoff_report(report_id: str, request: HandoffSendRequest) -> dict[str, object]:
    report = send_handoff_report(report_id, request)
    if report is None:
        raise HTTPException(status_code=404, detail="Handoff report not found")
    return report


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
