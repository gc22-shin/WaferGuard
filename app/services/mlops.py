from __future__ import annotations

import random
import re
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
    event_id = f"DRIFT-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}"
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
        # Record + alert only. Drift no longer auto-mints a model on every tick —
        # retraining is a deliberate, approval-gated decision (one at a time), so
        # the registry stops ballooning. The MLOps agent / operator decides.
        insert_alert("warning", "sns/slack", f"{request.line_id} Drift Score {score} 감지 — 재학습 검토 필요")
    return event


def _next_candidate_version() -> str:
    """Next plausible semver candidate, derived from the current Production model.

    e.g. Production wafer-defectnet-v2.3.1 → candidate wafer-defectnet-v2.4.0-rc1
    (rc index bumps if a candidate for that minor already exists).
    """
    base = "wafer-defectnet"
    models = current_models()
    major, minor = 2, 3
    prod = next((m for m in models if m.get("stage") == "Production"), None)
    if prod:
        mm = re.search(r"v(\d+)\.(\d+)", str(prod.get("version", "")))
        if mm:
            major, minor = int(mm.group(1)), int(mm.group(2))
    target = f"{base}-v{major}.{minor + 1}.0"
    existing = sum(1 for m in models if str(m.get("version", "")).startswith(target))
    return f"{target}-rc{existing + 1}"


def simulate_retraining(request: RetrainRequest) -> dict[str, object]:
    version = _next_candidate_version()
    f1_score = round(random.uniform(0.858, 0.902), 3)
    latency = random.randint(72, 96)
    job = {
        "id": f"TRAIN-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}",
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
