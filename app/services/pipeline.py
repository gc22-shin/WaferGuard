from __future__ import annotations

import hashlib
import logging
import random
from datetime import datetime, timezone

from app.services.config import IMAGE_DIR, MODEL_VERSION
from app.services.action_card import (
    build_action_card,
    build_metrology_context,
    build_process_context,
    evaluate_metrology_rules,
    has_critical_metrology_hit,
    metrology_risk_delta,
)
from app.services.rag import search_cases
from app.services.reporting import build_report
from app.services.risk import compute_risk_score, risk_level
from app.services.schemas import InspectRequest
from app.services.storage import insert_alert, insert_inspection, production_model, utc_now
from app.services.synthetic_wafer import choose_defect, generate_images

logger = logging.getLogger(__name__)


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
    process_context = build_process_context(request)
    metrology = build_metrology_context(request, float(image_result["hotspot_ratio"]))
    metrology_rule_hits = evaluate_metrology_rules(defect_type, process_context, metrology)
    risk_score = compute_risk_score(
        defect_type=defect_type,
        confidence=confidence,
        hotspot_ratio=float(image_result["hotspot_ratio"]),
        repeat_weight=repeat_weight,
        metrology_risk_delta=metrology_risk_delta(metrology_rule_hits),
    )
    level = risk_level(risk_score)
    status = (
        "review_required"
        if confidence < 0.70 or level == "High" or has_critical_metrology_hit(metrology_rule_hits)
        else "auto_screened"
    )
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
        process_context=process_context,
        metrology=metrology,
        metrology_rule_hits=metrology_rule_hits,
    )
    action_card = build_action_card(
        defect_type=defect_type,
        risk_level=level,
        confidence=confidence,
        process_context=process_context,
        metrology=metrology,
        cases=cases,
        metrology_rule_hits=metrology_rule_hits,
    )

    # Agent escalation: Low → rule-based only; Medium/High/review_required → Agent
    agent_result: dict | None = None
    needs_agent = level in ("Medium", "High") or status == "review_required"
    if needs_agent:
        evidence = {
            "inspection_id": inspection_id,
            "defect_type": defect_type,
            "risk_level": level,
            "risk_score": risk_score,
            "confidence": confidence,
            "metrology_rule_hits": metrology_rule_hits,
            "rag_cases": cases,
            "process_context": process_context,
            "metrology": metrology,
            "image_urls": [
                f"/outputs/images/{image_result['overlay_path'].name}",
                f"/outputs/images/{image_result['roi_path'].name}",
            ],
            "use_llm": request.use_llm,
        }
        try:
            from app.services.agent import run as agent_run  # noqa: PLC0415
            agent_result = agent_run(evidence)
        except Exception as exc:  # noqa: BLE001
            logger.error("Agent run failed for %s: %s", inspection_id, exc)
            agent_result = {
                "final_action": f"Agent 실행 오류: {exc}",
                "tool_calls": [],
                "trace_id": None,
                "agent_mode": "error",
            }

    record = {
        "id": inspection_id,
        "lot_id": request.lot_id,
        "wafer_id": request.wafer_id,
        "line_id": request.line_id,
        "equipment_id": request.equipment_id,
        "process_step": request.process_step,
        "recipe_id": request.recipe_id,
        "image_source": request.image_source,
        "proxy_dataset": request.proxy_dataset,
        "proxy_status": (
            f"WM-811K wafer map ({image_result['wafer_source']['wm811k_id']}, "
            f"lot={image_result['wafer_source']['lot_name']})"
        ),
        "defect_type": defect_type,
        "confidence": confidence,
        "risk_score": risk_score,
        "risk_level": level,
        "hotspot_ratio": image_result["hotspot_ratio"],
        "image_url": f"/outputs/images/{image_result['image_path'].name}",
        "heatmap_url": f"/outputs/images/{image_result['heatmap_path'].name}",
        "overlay_url": f"/outputs/images/{image_result['overlay_path'].name}",
        "roi_url": f"/outputs/images/{image_result['roi_path'].name}",
        "roi_bbox": image_result["roi_bbox"],
        "report": report,
        "cases": cases,
        "process_context": process_context,
        "metrology": metrology,
        "action_card": action_card,
        "model_version": model_version,
        "status": status,
        "created_at": utc_now(),
        # Agent fields (None for Low / rule-only cases)
        "agent_final_action": agent_result.get("final_action") if agent_result else None,
        "agent_tool_calls": agent_result.get("tool_calls") if agent_result else None,
        "agent_trace_id": agent_result.get("trace_id") if agent_result else None,
        "agent_mode": agent_result.get("agent_mode") if agent_result else "rule_only",
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
