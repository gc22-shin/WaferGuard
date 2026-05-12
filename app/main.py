from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.services.config import OUTPUT_DIR, ensure_runtime_dirs
from app.services.mlops import pipeline_state, promote_latest, rollback, simulate_drift, simulate_retraining
from app.services.pipeline import run_inspection
from app.services.schemas import (
    DriftRequest,
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


@app.get("/api/v1/metrics")
def service_metrics() -> dict[str, object]:
    return metrics()


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
