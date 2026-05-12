from __future__ import annotations

import random
from datetime import datetime, timezone

from app.services.config import DRIFT_THRESHOLD
from app.services.schemas import DriftRequest, RetrainRequest
from app.services.storage import (
    current_models,
    insert_alert,
    insert_drift_event,
    insert_model,
    insert_retraining_job,
    metrics,
    promote_model,
    rollback_model,
    utc_now,
)


def simulate_drift(request: DriftRequest) -> dict[str, object]:
    ranges = {
        "normal": (0.05, 0.18),
        "mild": (0.20, 0.36),
        "strong": (0.38, 0.62),
    }
    low, high = ranges[request.intensity]
    score = round(random.uniform(low, high), 3)
    drifted = score > DRIFT_THRESHOLD
    event_id = f"DRIFT-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
    action = "Airflow retraining DAG queued" if drifted else "No action"
    event = {
        "id": event_id,
        "line_id": request.line_id,
        "drift_score": score,
        "status": "detected" if drifted else "normal",
        "action_taken": action,
        "created_at": utc_now(),
    }
    insert_drift_event(event)
    if drifted:
        insert_alert("warning", "sns/slack", f"{request.line_id} Drift Score {score} 감지")
        job = simulate_retraining(RetrainRequest(trigger_type="drift"))
        event["retraining_job"] = job
    return event


def simulate_retraining(request: RetrainRequest) -> dict[str, object]:
    version = f"wg-local-v{datetime.now(timezone.utc).strftime('%m%d%H%M')}"
    f1_score = round(random.uniform(0.858, 0.902), 3)
    latency = random.randint(72, 96)
    job = {
        "id": f"TRAIN-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
        "trigger_type": request.trigger_type,
        "status": "completed",
        "candidate_version": version,
        "f1_score": f1_score,
        "created_at": utc_now(),
    }
    insert_retraining_job(job)
    insert_model(version, "Staging", f1_score, latency)
    insert_alert("info", "sns/slack", f"신규 모델 {version} Staging 등록 완료 (F1={f1_score})")
    return job


def promote_latest(version: str | None = None) -> dict[str, object]:
    models = current_models()
    target = version
    if target is None:
        staging = [m for m in models if m["stage"] == "Staging"]
        if not staging:
            job = simulate_retraining(RetrainRequest(trigger_type="manual"))
            target = str(job["candidate_version"])
        else:
            target = str(staging[0]["version"])
    promoted = promote_model(target)
    insert_alert("info", "sns/slack", f"{target} Production 승급 완료")
    return promoted


def rollback(reason: str) -> dict[str, object]:
    return rollback_model(reason)


def pipeline_state() -> dict[str, object]:
    data = metrics()
    return {
        "models": current_models(),
        "latest_drift_event": data["latest_drift_event"],
        "recent_retraining_jobs": data["recent_retraining_jobs"],
        "recent_alerts": data["recent_alerts"],
    }
