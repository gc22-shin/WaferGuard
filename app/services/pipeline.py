from __future__ import annotations

import hashlib
import random
from datetime import datetime, timezone

from app.services.config import IMAGE_DIR, MODEL_VERSION
from app.services.rag import search_cases
from app.services.reporting import build_report
from app.services.risk import compute_risk_score, risk_level
from app.services.schemas import InspectRequest
from app.services.storage import insert_alert, insert_inspection, production_model, utc_now
from app.services.synthetic_wafer import choose_defect, generate_images


def run_inspection(request: InspectRequest) -> dict[str, object]:
    defect_type = choose_defect(request.defect_hint)
    inspection_id = _inspection_id(request.wafer_id, defect_type)
    repeat_weight = _repeat_weight(request.line_id, defect_type)
    confidence = _confidence(defect_type)
    image_result = generate_images(
        inspection_id=inspection_id,
        defect_type=defect_type,
        output_dir=IMAGE_DIR,
    )
    cases = search_cases(defect_type, request.line_id)
    risk_score = compute_risk_score(
        defect_type=defect_type,
        confidence=confidence,
        hotspot_ratio=float(image_result["hotspot_ratio"]),
        repeat_weight=repeat_weight,
    )
    level = risk_level(risk_score)
    status = "review_required" if confidence < 0.70 or level == "High" else "auto_screened"
    model = production_model()
    model_version = str(model.get("version", MODEL_VERSION))
    report = build_report(
        wafer_id=request.wafer_id,
        line_id=request.line_id,
        equipment_id=request.equipment_id,
        defect_type=defect_type,
        confidence=confidence,
        risk_level=level,
        hotspot_ratio=float(image_result["hotspot_ratio"]),
        cases=cases,
    )

    record = {
        "id": inspection_id,
        "wafer_id": request.wafer_id,
        "line_id": request.line_id,
        "equipment_id": request.equipment_id,
        "defect_type": defect_type,
        "confidence": confidence,
        "risk_score": risk_score,
        "risk_level": level,
        "hotspot_ratio": image_result["hotspot_ratio"],
        "image_url": f"/outputs/images/{image_result['image_path'].name}",
        "heatmap_url": f"/outputs/images/{image_result['heatmap_path'].name}",
        "overlay_url": f"/outputs/images/{image_result['overlay_path'].name}",
        "report": report,
        "cases": cases,
        "model_version": model_version,
        "status": status,
        "created_at": utc_now(),
    }
    insert_inspection(record)
    if level == "High":
        insert_alert(
            "critical",
            "sns/slack",
            f"{request.line_id} {request.wafer_id}: {defect_type} High risk 감지",
        )
    return record


def _inspection_id(wafer_id: str, defect_type: str) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    digest = hashlib.sha1(f"{wafer_id}-{defect_type}-{random.random()}".encode()).hexdigest()[:6].upper()
    return f"INS-{stamp}-{digest}"


def _confidence(defect_type: str) -> float:
    ranges = {
        "None": (0.92, 0.98),
        "Near-full": (0.90, 0.97),
        "Scratch": (0.84, 0.95),
        "Random": (0.72, 0.90),
    }
    low, high = ranges.get(defect_type, (0.80, 0.96))
    return round(random.uniform(low, high), 3)


def _repeat_weight(line_id: str, defect_type: str) -> float:
    digest = hashlib.sha1(f"{line_id}-{defect_type}".encode()).hexdigest()
    return round(int(digest[:2], 16) / 255, 3)
