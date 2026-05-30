"""
Luxia Cloud API client for WaferGuard.

Functions
---------
chat_with_tools(messages, tools, image_urls) -> dict
    OpenAI-style response dict with choices[0].message.
    Uses GPT-4o-mini via Luxia OpenAI passthrough endpoint.

embed(texts) -> list[list[float]]
    Returns 1024-d vectors via /luxia/v1/embedding.

rerank(query, documents, top_k) -> list[dict]
    Returns [{index, relevance_score}, ...] via /luxia/v1/rerank.

All functions degrade gracefully when LUXIA_API_KEY is unset:
- chat_with_tools returns a stubbed response.
- embed returns zero vectors.
- rerank returns documents in original order.
"""
from __future__ import annotations

import logging
import os
from typing import Any

import requests

logger = logging.getLogger(__name__)

BASE_URL = "https://bridge.luxiacloud.com"
_CHAT_PATH = "/llm/openai/chat/completions/gpt-4o-mini/create"
_EMBED_PATH = "/luxia/v1/embedding"
_RERANK_PATH = "/luxia/v1/rerank"
_TIMEOUT = 30  # seconds


def _api_key() -> str | None:
    key = os.environ.get("LUXIA_API_KEY", "").strip()
    return key if key else None


def _headers() -> dict[str, str]:
    key = _api_key()
    if not key:
        return {}
    return {"apikey": key, "Content-Type": "application/json"}


# ---------------------------------------------------------------------------
# chat_with_tools
# ---------------------------------------------------------------------------

def chat_with_tools(
    messages: list[dict],
    tools: list[dict] | None = None,
    image_urls: list[str] | None = None,
) -> dict:
    """Call GPT-4o-mini via Luxia gateway.

    Parameters
    ----------
    messages:
        OpenAI-style message list (role/content dicts).
    tools:
        Optional list of OpenAI function-call tool schemas.
    image_urls:
        Optional list of image URLs to attach as multimodal content
        to the last user message.

    Returns
    -------
    dict
        OpenAI-style response with ``choices[0].message`` key.
        If LUXIA_API_KEY is absent, returns a stubbed response.
    """
    key = _api_key()
    if not key:
        logger.warning(
            "LUXIA_API_KEY is not set; returning stubbed chat response. "
            "Set the env var to enable real LLM calls."
        )
        return _stub_chat_response()

    # Inject image_urls as multimodal content into last user message
    msgs = [dict(m) for m in messages]
    if image_urls:
        last_user_idx = None
        for i in range(len(msgs) - 1, -1, -1):
            if msgs[i].get("role") == "user":
                last_user_idx = i
                break
        if last_user_idx is not None:
            original_content = msgs[last_user_idx].get("content", "")
            content_parts: list[dict] = []
            if original_content:
                content_parts.append({"type": "text", "text": str(original_content)})
            for url in image_urls:
                content_parts.append({"type": "image_url", "image_url": {"url": url}})
            msgs[last_user_idx]["content"] = content_parts

    payload: dict[str, Any] = {
        "messages": msgs,
        "temperature": 0,
        "max_tokens": 1024,
    }
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"

    try:
        resp = requests.post(
            BASE_URL + _CHAT_PATH,
            headers=_headers(),
            json=payload,
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:  # noqa: BLE001
        logger.error("Luxia chat_with_tools failed: %s", exc)
        return _stub_chat_response(error=str(exc))


def _stub_chat_response(error: str | None = None) -> dict:
    content = (
        "LUXIA_API_KEY 미설정 — Agent 스텁 응답입니다. "
        "환경 변수를 설정하면 실제 GPT-4o-mini 판단이 활성화됩니다."
    )
    if error:
        content = f"[LLM 오류: {error}] {content}"
    return {
        "id": "stub-0",
        "object": "chat.completion",
        "choices": [
            {
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": content,
                    "tool_calls": None,
                },
                "finish_reason": "stop",
            }
        ],
        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    }


# ---------------------------------------------------------------------------
# embed
# ---------------------------------------------------------------------------

def embed(texts: list[str]) -> list[list[float]]:
    """Embed texts using Luxia /luxia/v1/embedding (1024-d).

    Returns zero vectors if LUXIA_API_KEY is unset or an error occurs.
    """
    if not texts:
        return []

    key = _api_key()
    if not key:
        logger.warning("LUXIA_API_KEY is not set; returning zero embeddings.")
        return [[0.0] * 1024 for _ in texts]

    try:
        resp = requests.post(
            BASE_URL + _EMBED_PATH,
            headers=_headers(),
            json={"inputs": texts},
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
        # Response shape: {"data": [{"embedding": [...]}]}
        embeddings = [item["embedding"] for item in data["data"]]
        return embeddings
    except Exception as exc:  # noqa: BLE001
        logger.error("Luxia embed failed: %s", exc)
        return [[0.0] * 1024 for _ in texts]


# ---------------------------------------------------------------------------
# rerank
# ---------------------------------------------------------------------------

def rerank(query: str, documents: list[str], top_k: int = 3) -> list[dict]:
    """Rerank documents using Luxia /luxia/v1/rerank.

    Returns
    -------
    list[dict]
        Each dict has ``index`` (int) and ``relevance_score`` (float).
        Falls back to identity order if LUXIA_API_KEY is unset or error occurs.
    """
    if not documents:
        return []

    key = _api_key()
    if not key:
        logger.warning("LUXIA_API_KEY is not set; returning identity rerank order.")
        return [
            {"index": i, "relevance_score": 1.0 - i * 0.01}
            for i in range(min(top_k, len(documents)))
        ]

    try:
        resp = requests.post(
            BASE_URL + _RERANK_PATH,
            headers=_headers(),
            json={
                "model": "luxia-rerank-2501",
                "query": query,
                "documents": documents,
                "top_k": top_k,
            },
            timeout=_TIMEOUT,
        )
        resp.raise_for_status()
        data = resp.json()
        # Response shape: {"results": [{"index": int, "relevance_score": float}]}
        results = data.get("results", [])
        return [{"index": r["index"], "relevance_score": r["relevance_score"]} for r in results]
    except Exception as exc:  # noqa: BLE001
        logger.error("Luxia rerank failed: %s", exc)
        return [
            {"index": i, "relevance_score": 1.0 - i * 0.01}
            for i in range(min(top_k, len(documents)))
        ]
