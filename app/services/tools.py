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
    try:
        from app.services.luxia_client import luxia_client  # noqa: PLC0415
        return luxia_client
    except (ImportError, AttributeError):
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
# Tool 5: recommend_retrain
# ---------------------------------------------------------------------------

def recommend_retrain(reason: str) -> dict:
    """
    Insert a pending approval record for a retraining recommendation.
    Requires human approval before retraining is triggered.
    """
    storage = _get_storage()
    approval_id: str | None = None

    if storage is not None:
        try:
            insert_pending_approval = getattr(storage, "insert_pending_approval", None)
            if insert_pending_approval is not None:
                approval_id = insert_pending_approval(
                    inspection_id=None,
                    tool_name="recommend_retrain",
                    payload={"reason": reason},
                    reason=reason,
                )
        except Exception as exc:
            logger.warning("recommend_retrain storage call failed: %s", exc)

    return {"ok": True, "approval_id": approval_id, "status": "pending"}


# ---------------------------------------------------------------------------
# Registry + Schemas
# ---------------------------------------------------------------------------

TOOL_REGISTRY: dict[str, Callable] = {
    "search_similar_cases": search_similar_cases,
    "inspect_image": inspect_image,
    "enqueue_for_review": enqueue_for_review,
    "trigger_critical_alert": trigger_critical_alert,
    "recommend_retrain": recommend_retrain,
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
                "drift 감지 또는 반복 오판 패턴 발생 시 엔지니어 승인 대기 상태로 재학습 요청을 등록한다."
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
]
