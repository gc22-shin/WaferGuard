"""
tools.py — WaferGuard Agent Tool implementations (Part 1-2).

Five callable tools + TOOL_REGISTRY + TOOL_SCHEMAS.
Falls back gracefully when LUXIA_API_KEY is missing or storage helpers
are not yet available (Agent A may still be adding them).
"""
from __future__ import annotations

import json
import logging
from typing import Callable

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Lazy imports — Agent A may not have committed these yet; degrade gracefully.
# ---------------------------------------------------------------------------

def _get_luxia_client():
    # luxia_client exposes module-level functions (chat_with_tools/embed/rerank),
    # so the module itself is the "client" object the tools call into.
    try:
        import app.services.luxia_client as luxia_client  # noqa: PLC0415
        return luxia_client
    except ImportError:
        return None


def _get_storage():
    try:
        import app.services.storage as _storage  # noqa: PLC0415
        return _storage
    except ImportError:
        return None


# ---------------------------------------------------------------------------
# Tool 1: search_similar_cases
# ---------------------------------------------------------------------------

def search_similar_cases(query: str, k: int = 3) -> list[dict]:
    """
    RAG search: embed query → cosine search in rag_documents → optional rerank → top-k.

    Falls back to the legacy rag.search_cases if LUXIA_API_KEY is absent or
    rag_documents table is empty.
    """
    storage = _get_storage()
    luxia = _get_luxia_client()

    # Try vector RAG path
    if luxia is not None and storage is not None:
        try:
            query_rag = getattr(storage, "query_rag", None)
            if query_rag is not None:
                vecs = luxia.embed([query])
                query_vec: list[float] = vecs[0] if vecs else []

                if query_vec:
                    raw_docs: list[dict] = query_rag(query_vec, k=20)

                    if raw_docs:
                        # Optional rerank
                        try:
                            rerank_result = luxia.rerank(
                                query,
                                [d["content"] for d in raw_docs],
                                top_k=k,
                            )
                            top_docs = [
                                {
                                    "content": raw_docs[r["index"]]["content"],
                                    "defect_type": raw_docs[r["index"]].get("defect_type", ""),
                                    "score": r.get("relevance_score", 0.0),
                                    "metadata": raw_docs[r["index"]].get("metadata", {}),
                                }
                                for r in rerank_result
                            ]
                        except Exception as exc:  # rerank optional
                            logger.debug("Rerank skipped: %s", exc)
                            top_docs = [
                                {
                                    "content": d["content"],
                                    "defect_type": d.get("defect_type", ""),
                                    "score": d.get("score", 0.0),
                                    "metadata": d.get("metadata", {}),
                                }
                                for d in raw_docs[:k]
                            ]
                        return top_docs
        except Exception as exc:
            logger.warning("search_similar_cases RAG path failed: %s — falling back to legacy", exc)

    # Fallback: legacy in-memory CASE_LIBRARY
    try:
        from app.services.rag import CASE_LIBRARY  # noqa: PLC0415

        # Try to infer defect_type from query (best-effort keyword match)
        defect_type = "Random"
        query_lower = query.lower()
        for dt in CASE_LIBRARY:
            if dt.lower() in query_lower:
                defect_type = dt
                break

        cases = CASE_LIBRARY.get(defect_type, CASE_LIBRARY.get("Random", []))
        results = []
        for case in cases[:k]:
            results.append(
                {
                    "content": f"{case.get('title', '')}: {case.get('summary', '')} / {case.get('action', '')}",
                    "defect_type": defect_type,
                    "score": 0.5,
                    "metadata": {"source": "case_library_fallback"},
                }
            )
        return results
    except Exception as exc:
        logger.error("search_similar_cases fallback also failed: %s", exc)
        return []


# ---------------------------------------------------------------------------
# Tool 2: inspect_image
# ---------------------------------------------------------------------------

def inspect_image(image_url: str, focus: str) -> dict:
    """
    Call luxia_client multimodal chat to inspect the wafer image.
    Returns {observation: str, focus: str}.
    Falls back to a stubbed observation on any failure.
    """
    luxia = _get_luxia_client()

    if luxia is not None:
        try:
            messages = [
                {
                    "role": "user",
                    "content": (
                        f"반도체 웨이퍼 이미지를 검사해주세요. 집중 분석 항목: {focus}. "
                        "결함 위치, 패턴, 심각도를 간략히 설명하세요."
                    ),
                }
            ]
            result = luxia.chat_with_tools(messages, image_urls=[image_url])
            # Accept either {content: ...} or {choices: [{message: {content:...}}]}
            observation = (
                result.get("content")
                or (
                    result.get("choices", [{}])[0]
                    .get("message", {})
                    .get("content", "")
                )
                or str(result)
            )
            return {"observation": observation, "focus": focus}
        except Exception as exc:
            logger.warning("inspect_image failed: %s — returning stub", exc)

    # Stub fallback
    return {
        "observation": (
            f"[시뮬레이션] {focus} 분석: 웨이퍼 이미지에서 결함 패턴이 감지됐습니다. "
            "실제 분석을 위해 LUXIA_API_KEY 설정이 필요합니다."
        ),
        "focus": focus,
    }


# ---------------------------------------------------------------------------
# Tool 3: enqueue_for_review
# ---------------------------------------------------------------------------

def enqueue_for_review(inspection_id: str, reason: str) -> dict:
    """
    Mark inspection as pending review in storage.
    Calls storage.record_review(inspection_id, 'pending', reviewer='agent', note=reason).
    """
    storage = _get_storage()
    if storage is not None:
        try:
            record_review = getattr(storage, "record_review", None)
            if record_review is not None:
                record_review(inspection_id, "pending", "agent", reason)
        except Exception as exc:
            logger.warning("enqueue_for_review storage call failed: %s", exc)

    return {"ok": True, "inspection_id": inspection_id, "reason": reason}


# ---------------------------------------------------------------------------
# Tool 4: trigger_critical_alert
# ---------------------------------------------------------------------------

def trigger_critical_alert(inspection_id: str, message: str) -> dict:
    """
    Insert a pending approval record for a critical alert.
    Requires human approval before the alert fires.
    """
    storage = _get_storage()
    approval_id: str | None = None

    if storage is not None:
        try:
            insert_pending_approval = getattr(storage, "insert_pending_approval", None)
            if insert_pending_approval is not None:
                approval_id = insert_pending_approval(
                    inspection_id=inspection_id,
                    tool_name="trigger_critical_alert",
                    payload={"message": message},
                    reason=message,
                )
        except Exception as exc:
            logger.warning("trigger_critical_alert storage call failed: %s", exc)

    return {
        "ok": True,
        "approval_id": approval_id,
        "inspection_id": inspection_id,
        "status": "pending",
    }


# ---------------------------------------------------------------------------
# Tool 5: recommend_retrain  (autonomy-aware)
# ---------------------------------------------------------------------------

def execute_retrain_decision(reason: str, mode: str = "approval") -> dict:
    """Carry out a retraining recommendation according to the agent's autonomy mode.

    mode:
      - "auto"     : execute the retraining immediately (no human gate).
      - "approval" : register a pending approval; a human must approve to execute.
      - "notify"   : send a notification only — no execution, no approval queue.
    """
    storage = _get_storage()

    if mode == "auto":
        # Fully autonomous: run the retraining simulation right away.
        try:
            from app.services.mlops import simulate_retraining  # noqa: PLC0415
            from app.services.schemas import RetrainRequest  # noqa: PLC0415

            job = simulate_retraining(RetrainRequest(trigger_type="drift"))
            if storage is not None:
                insert_alert = getattr(storage, "insert_alert", None)
                if insert_alert is not None:
                    insert_alert("warning", "sns/slack", f"[자동 실행] MLOps 에이전트 재학습 트리거: {reason}")
            return {
                "ok": True,
                "mode": "auto",
                "executed": True,
                "candidate_version": job.get("candidate_version"),
                "f1_score": job.get("f1_score"),
                "message": "재학습이 자동 실행되어 신규 모델이 Staging에 등록되었습니다.",
            }
        except Exception as exc:  # noqa: BLE001
            logger.warning("auto retrain execution failed: %s", exc)
            return {"ok": False, "mode": "auto", "executed": False, "error": str(exc)}

    if mode == "notify":
        notified = False
        if storage is not None:
            try:
                insert_alert = getattr(storage, "insert_alert", None)
                if insert_alert is not None:
                    insert_alert("info", "sns/slack", f"[알림] 재학습 권고(실행 안 함): {reason}")
                    notified = True
            except Exception as exc:  # noqa: BLE001
                logger.warning("notify retrain failed: %s", exc)
        return {
            "ok": True,
            "mode": "notify",
            "executed": False,
            "notified": notified,
            "message": "재학습 권고 알림만 발송했습니다. 실행은 담당자 판단에 맡깁니다.",
        }

    # default: approval-gated
    approval_id: str | None = None
    if storage is not None:
        try:
            insert_pending_approval = getattr(storage, "insert_pending_approval", None)
            if insert_pending_approval is not None:
                approval_id = insert_pending_approval(
                    # fleet-level recommendation has no single inspection; the
                    # pending_approvals.inspection_id column is NOT NULL, so use a
                    # sentinel rather than None (which silently failed the insert).
                    inspection_id="FLEET",
                    tool_name="recommend_retrain",
                    payload={"reason": reason, "mode": "approval"},
                    reason=reason,
                )
        except Exception as exc:
            logger.warning("recommend_retrain storage call failed: %s", exc)
    return {"ok": True, "mode": "approval", "approval_id": approval_id, "status": "pending"}


def recommend_retrain(reason: str) -> dict:
    """Recommend model retraining (approval-gated by default).

    The MLOps agent injects an autonomy-mode-bound variant via
    ``execute_retrain_decision``; this default keeps approval semantics for the
    inspection agent and any direct callers.
    """
    return execute_retrain_decision(reason, mode="approval")


# ---------------------------------------------------------------------------
# Tool 6: get_equipment_history  (Gap 1 — let the Agent run its own playbook)
# ---------------------------------------------------------------------------

def get_equipment_history(equipment_id: str, defect_type: str | None = None, hours: float = 24.0) -> dict:
    """Same-equipment recent inspection history / recurrence.

    Answers "ETCH-02에서 Scratch가 24시간 내 몇 번?" directly from the DB instead
    of telling a human to check. Returns counts, defect breakdown, recurrence flag.
    """
    storage = _get_storage()
    if storage is None:
        return {"error": "storage unavailable"}
    try:
        fn = getattr(storage, "equipment_history", None)
        if fn is None:
            return {"error": "equipment_history not available"}
        return fn(equipment_id, defect_type=defect_type, hours=hours)
    except Exception as exc:  # noqa: BLE001
        logger.warning("get_equipment_history failed: %s", exc)
        return {"error": str(exc)}


# ---------------------------------------------------------------------------
# Tool 7: get_metrology_trend  (one-off spike vs sustained drift)
# ---------------------------------------------------------------------------

def get_metrology_trend(equipment_id: str, metric: str = "overlay_nm", hours: float = 72.0) -> dict:
    """CD/Overlay/thickness trend over time for one equipment.

    Distinguishes a single outlier from a sustained drift. Reads the inspections
    table's metrology series.
    """
    storage = _get_storage()
    if storage is None:
        return {"error": "storage unavailable"}
    try:
        fn = getattr(storage, "metrology_trend", None)
        if fn is None:
            return {"error": "metrology_trend not available"}
        return fn(equipment_id, metric=metric, hours=hours)
    except Exception as exc:  # noqa: BLE001
        logger.warning("get_metrology_trend failed: %s", exc)
        return {"error": str(exc)}


# ---------------------------------------------------------------------------
# Tool 8: get_mlops_state  (ground retrain recommendations in evidence)
# ---------------------------------------------------------------------------

def get_mlops_state() -> dict:
    """Current model performance + latest drift event + recent retraining jobs.

    Lets recommend_retrain cite real drift evidence instead of guessing.
    """
    try:
        from app.services.mlops import pipeline_state  # noqa: PLC0415
        state = pipeline_state()
        models = state.get("models", [])
        production = next((m for m in models if m.get("stage") == "Production"), None)
        return {
            "production_model": production,
            "model_count": len(models),
            "latest_drift_event": state.get("latest_drift_event"),
            "recent_retraining_jobs": (state.get("recent_retraining_jobs") or [])[:3],
        }
    except Exception as exc:  # noqa: BLE001
        logger.warning("get_mlops_state failed: %s", exc)
        return {"error": str(exc)}


# ---------------------------------------------------------------------------
# Tool 9: compare_with_past_wafer  (multimodal map-vs-map comparison)
# ---------------------------------------------------------------------------

def compare_with_past_wafer(current_image: str, past_image: str, focus: str = "결함 패턴 유사성") -> dict:
    """Put two wafer maps in front of the multimodal model and compare them.

    `current_image` = this inspection's overlay/ROI; `past_image` = a retrieved
    case image. Returns a comparison observation.
    """
    luxia = _get_luxia_client()
    if luxia is not None:
        try:
            messages = [
                {
                    "role": "user",
                    "content": (
                        "첫 번째는 현재 웨이퍼, 두 번째는 과거 사례 웨이퍼 이미지입니다. "
                        f"'{focus}' 관점에서 두 결함 패턴이 얼마나 유사한지, 같은 원인으로 볼 수 있는지 "
                        "2~4문장으로 비교 분석하세요."
                    ),
                }
            ]
            result = luxia.chat_with_tools(messages, image_urls=[current_image, past_image])
            observation = (
                result.get("content")
                or result.get("choices", [{}])[0].get("message", {}).get("content", "")
                or str(result)
            )
            return {"observation": observation, "focus": focus}
        except Exception as exc:  # noqa: BLE001
            logger.warning("compare_with_past_wafer failed: %s — returning stub", exc)
    return {
        "observation": (
            f"[시뮬레이션] {focus} 비교: 두 웨이퍼의 결함 분포를 직접 대조하려면 LUXIA_API_KEY가 필요합니다."
        ),
        "focus": focus,
    }


# ---------------------------------------------------------------------------
# Tool 10: save_case_to_knowledge  (Gap 3 — RAG learning loop)
# ---------------------------------------------------------------------------

def save_case_to_knowledge(
    title: str,
    summary: str,
    action: str,
    defect_type: str | None = None,
    metadata: dict | None = None,
) -> dict:
    """Embed an engineer-confirmed case and write it into rag_documents.

    This is what makes the RAG corpus learn from operation: every resolved case
    becomes retrievable evidence for future search_similar_cases calls.
    """
    storage = _get_storage()
    luxia = _get_luxia_client()
    if storage is None:
        return {"ok": False, "error": "storage unavailable"}

    content = f"{title}: {summary} / 조치: {action}"
    embedding: list[float] | None = None
    if luxia is not None:
        try:
            vecs = luxia.embed([content])
            embedding = vecs[0] if vecs else None
        except Exception as exc:  # noqa: BLE001
            logger.warning("save_case_to_knowledge embed failed: %s", exc)

    try:
        from datetime import datetime, timezone  # noqa: PLC0415
        doc_id = f"LEARNED-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')}"
        meta = {"source": "engineer_confirmed", "title": title, "action": action, **(metadata or {})}
        upsert = getattr(storage, "upsert_rag_document", None)
        if upsert is None:
            return {"ok": False, "error": "upsert_rag_document not available"}
        upsert(doc_id=doc_id, content=content, defect_type=defect_type, embedding=embedding, metadata=meta)
        return {"ok": True, "doc_id": doc_id, "embedded": embedding is not None, "content": content}
    except Exception as exc:  # noqa: BLE001
        logger.warning("save_case_to_knowledge write failed: %s", exc)
        return {"ok": False, "error": str(exc)}


# ---------------------------------------------------------------------------
# Registry + Schemas
# ---------------------------------------------------------------------------

TOOL_REGISTRY: dict[str, Callable] = {
    "search_similar_cases": search_similar_cases,
    "inspect_image": inspect_image,
    "enqueue_for_review": enqueue_for_review,
    "trigger_critical_alert": trigger_critical_alert,
    "recommend_retrain": recommend_retrain,
    "get_equipment_history": get_equipment_history,
    "get_metrology_trend": get_metrology_trend,
    "get_mlops_state": get_mlops_state,
    "compare_with_past_wafer": compare_with_past_wafer,
    "save_case_to_knowledge": save_case_to_knowledge,
}

TOOL_SCHEMAS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "search_similar_cases",
            "description": (
                "RAG 검색으로 유사 결함 사례를 찾는다. "
                "query를 임베딩해 rag_documents에서 코사인 유사도 검색 후 rerank하여 top-k를 반환한다."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "검색할 결함 상황 설명 (예: 'Edge-Ring 결함, EBR 압력 이상')",
                    },
                    "k": {
                        "type": "integer",
                        "description": "반환할 유사 사례 수 (기본값: 3)",
                        "default": 3,
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "inspect_image",
            "description": (
                "웨이퍼 이미지를 멀티모달 LLM으로 분석한다. "
                "Grad-CAM overlay나 ROI crop 이미지 URL과 집중 분석 항목을 입력하면 관찰 결과를 반환한다."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "image_url": {
                        "type": "string",
                        "description": "분석할 이미지의 URL (wafer map, heatmap overlay, ROI crop 등)",
                    },
                    "focus": {
                        "type": "string",
                        "description": "집중 분석 항목 (예: '엣지 링 패턴', '중심부 결함 밀도', 'Grad-CAM 집중 영역')",
                    },
                },
                "required": ["image_url", "focus"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "enqueue_for_review",
            "description": (
                "검사 항목을 엔지니어 검토 큐에 등록한다. "
                "AI 판정 신뢰도가 낮거나 추가 확인이 필요한 경우 사용한다."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "inspection_id": {
                        "type": "string",
                        "description": "검토 큐에 등록할 검사 ID",
                    },
                    "reason": {
                        "type": "string",
                        "description": "검토 큐 등록 이유 (예: '신뢰도 0.65 미만', 'Edge-Ring critical class')",
                    },
                },
                "required": ["inspection_id", "reason"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "trigger_critical_alert",
            "description": (
                "High-risk 결함에 대해 긴급 알림을 발송한다. "
                "엔지니어 승인 후 실제 알림이 전송되는 pending approval 방식으로 처리된다."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "inspection_id": {
                        "type": "string",
                        "description": "알림을 발송할 검사 ID",
                    },
                    "message": {
                        "type": "string",
                        "description": "알림 메시지 (결함 유형, 위험도, 권고 조치 포함)",
                    },
                },
                "required": ["inspection_id", "message"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "recommend_retrain",
            "description": (
                "모델 재학습을 권고한다. "
                "drift 감지 또는 반복 오판 패턴 발생 시 엔지니어 승인 대기 상태로 재학습 요청을 등록한다. "
                "권고 전에 가능하면 get_mlops_state로 drift 증거를 먼저 확인한다."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "reason": {
                        "type": "string",
                        "description": "재학습 권고 이유 (예: 'Scratch recall 하락', 'drift score 0.72 초과')",
                    },
                },
                "required": ["reason"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_equipment_history",
            "description": (
                "같은 설비의 최근 검사 이력과 동일 결함 반복 여부를 DB에서 조회한다. "
                "'이 설비에서 같은 결함이 최근에도 났는지', '반복성 결함인지' 판단할 때 사용한다. "
                "예: ETCH-02에서 Scratch가 24시간 내 5회 → 반복성, 설비 점검 우선."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "equipment_id": {"type": "string", "description": "조회할 설비 ID (예: ETCH-02)"},
                    "defect_type": {"type": "string", "description": "반복 여부를 셀 결함 유형 (선택)"},
                    "hours": {"type": "number", "description": "조회 기간(시간), 기본 24", "default": 24},
                },
                "required": ["equipment_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_metrology_trend",
            "description": (
                "특정 설비의 계측값(CD/Overlay/두께/거칠기 등) 시계열 추세를 조회한다. "
                "이번 건만 튄 건지, 계속 밀리는(drift) 건지 구분할 때 사용한다."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "equipment_id": {"type": "string", "description": "조회할 설비 ID"},
                    "metric": {
                        "type": "string",
                        "description": "지표명",
                        "enum": ["cd_nm", "overlay_nm", "film_thickness_nm", "roughness_nm", "defect_count", "yield_proxy"],
                        "default": "overlay_nm",
                    },
                    "hours": {"type": "number", "description": "조회 기간(시간), 기본 72", "default": 72},
                },
                "required": ["equipment_id", "metric"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_mlops_state",
            "description": (
                "현재 운영 모델 성능, 최신 drift 이벤트, 최근 재학습 이력을 조회한다. "
                "재학습을 권고하기 전에 drift 증거를 확인할 때 사용한다."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "compare_with_past_wafer",
            "description": (
                "현재 웨이퍼 이미지와 과거 사례 웨이퍼 이미지를 멀티모달로 직접 비교한다. "
                "두 결함 패턴이 같은 원인으로 볼 수 있는지 시각적으로 대조할 때 사용한다."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "current_image": {"type": "string", "description": "현재 검사의 이미지 URL (overlay/ROI)"},
                    "past_image": {"type": "string", "description": "비교할 과거 사례 이미지 URL"},
                    "focus": {"type": "string", "description": "비교 집중 항목", "default": "결함 패턴 유사성"},
                },
                "required": ["current_image", "past_image"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "save_case_to_knowledge",
            "description": (
                "엔지니어가 확인한 결함 대응 사례를 임베딩해 RAG 지식베이스(rag_documents)에 저장한다. "
                "조치가 검증된 케이스를 기록하면 이후 search_similar_cases에서 검색되어 RAG가 학습된다."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "사례 제목"},
                    "summary": {"type": "string", "description": "상황 요약"},
                    "action": {"type": "string", "description": "취한 조치 / 권장 조치"},
                    "defect_type": {"type": "string", "description": "결함 유형 (선택)"},
                },
                "required": ["title", "summary", "action"],
            },
        },
    },
]
