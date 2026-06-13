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

import base64
import logging
import os
import random
import threading
import time
from typing import Any
from urllib.parse import urlparse

import requests

from app.services.config import OUTPUT_DIR

logger = logging.getLogger(__name__)

BASE_URL = "https://bridge.luxiacloud.com"
_CHAT_PATH = "/llm/openai/chat/completions/gpt-4o-mini/create"
_EMBED_PATH = "/luxia/v1/embedding"
_RERANK_PATH = "/luxia/v1/rerank"
_TIMEOUT = 30  # seconds

# ---------------------------------------------------------------------------
# Rate-limit handling: retry + self-throttle (shared by all gateway calls)
# ---------------------------------------------------------------------------
# The gateway is rate-limited (free tier), and a single agent turn fires 4-5
# tool-loop calls; background inspection agents + 90s auto-monitoring + chat can
# overlap and burst past the limit -> 429. Without retry, one transient 429 drops
# straight to a stub answer. So: retry retryable statuses with exponential backoff
# (honoring Retry-After), and self-throttle below the limit with a min spacing
# between requests and a small concurrency cap. All env-tunable.
_RETRY_STATUSES = {429, 500, 502, 503, 504}
_MAX_RETRIES = int(os.environ.get("LUXIA_MAX_RETRIES", "4"))
_MIN_INTERVAL = float(os.environ.get("LUXIA_MIN_INTERVAL", "0.6"))  # seconds between request starts
_MAX_CONCURRENCY = max(1, int(os.environ.get("LUXIA_MAX_CONCURRENCY", "2")))
_MAX_BACKOFF = float(os.environ.get("LUXIA_MAX_BACKOFF", "12"))

_throttle_lock = threading.Lock()
_last_request_ts = 0.0
_concurrency = threading.Semaphore(_MAX_CONCURRENCY)


def _throttle() -> None:
    """Space out request starts so concurrent callers don't burst past the limit."""
    global _last_request_ts  # noqa: PLW0603
    with _throttle_lock:
        wait = _MIN_INTERVAL - (time.monotonic() - _last_request_ts)
        if wait > 0:
            time.sleep(wait)
        _last_request_ts = time.monotonic()


def _retry_delay(resp: requests.Response | None, attempt: int) -> float:
    """Honor Retry-After when present, else exponential backoff with jitter."""
    if resp is not None:
        ra = resp.headers.get("Retry-After")
        if ra:
            try:
                return min(float(ra), _MAX_BACKOFF)
            except ValueError:
                pass
    return min(_MAX_BACKOFF, (2 ** attempt) * 0.5) + random.uniform(0, 0.4)


def _post_json(path: str, payload: dict, timeout: int = _TIMEOUT) -> dict:
    """POST with self-throttle, concurrency cap, and retry on rate-limit/5xx.

    Raises on final failure; callers translate that into their graceful fallback.
    """
    last_error: Exception = RuntimeError("request not attempted")
    for attempt in range(_MAX_RETRIES + 1):
        _throttle()
        try:
            with _concurrency:
                resp = requests.post(BASE_URL + path, headers=_headers(), json=payload, timeout=timeout)
        except requests.RequestException as exc:
            last_error = exc
            if attempt < _MAX_RETRIES:
                time.sleep(_retry_delay(None, attempt))
                continue
            raise

        if resp.status_code in _RETRY_STATUSES and attempt < _MAX_RETRIES:
            delay = _retry_delay(resp, attempt)
            logger.warning(
                "Luxia %s -> HTTP %s; retrying in %.1fs (attempt %d/%d)",
                path, resp.status_code, delay, attempt + 1, _MAX_RETRIES,
            )
            time.sleep(delay)
            continue

        resp.raise_for_status()  # raises on a final non-retryable / exhausted status
        return resp.json()

    raise last_error


def _api_key() -> str | None:
    key = os.environ.get("LUXIA_API_KEY", "").strip()
    return key if key else None


def _headers() -> dict[str, str]:
    key = _api_key()
    if not key:
        return {}
    return {"apikey": key, "Content-Type": "application/json"}


def _to_data_uri(url: str) -> str | None:
    """Resolve an image reference into something OpenAI can actually see.

    The pipeline stores images as local paths (``/outputs/images/...``) served
    by the local FastAPI app — OpenAI's servers cannot download those, so they
    are inlined as base64 data URIs. Public http(s) URLs pass through as-is.
    Returns None when the file cannot be resolved (caller should skip it).
    """
    if url.startswith("data:"):
        return url
    parsed = urlparse(url)
    if parsed.scheme in ("http", "https") and parsed.hostname not in ("127.0.0.1", "localhost"):
        return url
    path = parsed.path if parsed.scheme else url
    if not path.startswith("/outputs/"):
        return None
    file_path = OUTPUT_DIR / path.removeprefix("/outputs/")
    if not file_path.is_file():
        logger.warning("Image not found for LLM call, skipping: %s", url)
        return None
    suffix = file_path.suffix.lstrip(".").lower() or "png"
    b64 = base64.b64encode(file_path.read_bytes()).decode("ascii")
    return f"data:image/{suffix};base64,{b64}"


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
                resolved = _to_data_uri(url)
                if resolved:
                    content_parts.append({"type": "image_url", "image_url": {"url": resolved}})
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
        return _post_json(_CHAT_PATH, payload)
    except Exception as exc:  # noqa: BLE001
        logger.error("Luxia chat_with_tools failed after retries: %s", exc)
        return _stub_chat_response(error=str(exc))


def _stub_chat_response(error: str | None = None) -> dict:
    if error:
        # The key is set but the call failed (after retries) — almost always a
        # transient rate limit (HTTP 429). Don't claim the key is missing.
        is_rate_limit = "429" in error or "Too Many Requests" in error
        if is_rate_limit:
            content = (
                "[LLM 일시 혼잡: 요청이 많아 잠시 제한됨(429)] "
                "자동 재시도 후에도 실패했습니다. 잠깐 기다렸다가 다시 시도하거나, "
                "자동 모니터링을 끄고 동시 요청을 줄여보세요."
            )
        else:
            content = (
                f"[LLM 호출 실패: {error}] 잠시 후 다시 시도해주세요. "
                "반복되면 네트워크와 LUXIA_API_KEY 설정을 확인하세요."
            )
    else:
        content = (
            "LUXIA_API_KEY 미설정 — Agent 스텁 응답입니다. "
            "환경 변수를 설정하면 실제 GPT-4o-mini 판단이 활성화됩니다."
        )
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
        data = _post_json(_EMBED_PATH, {"inputs": texts})
        # Response shape: {"data": [{"embedding": [...]}]}
        embeddings = [item["embedding"] for item in data["data"]]
        return embeddings
    except Exception as exc:  # noqa: BLE001
        logger.error("Luxia embed failed after retries: %s", exc)
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
        data = _post_json(_RERANK_PATH, {
            "model": "luxia-rerank-2501",
            "query": query,
            "documents": documents,
            "top_k": top_k,
        })
        # Expected: {"results": [{"index": int, "relevance_score": float}]}, but the
        # gateway sometimes uses alternate key names — tolerate them rather than failing.
        results = data.get("results") or data.get("data") or []
        normalized: list[dict] = []
        for i, r in enumerate(results):
            if not isinstance(r, dict):
                continue
            idx = r.get("index", r.get("document_index", r.get("corpus_id", i)))
            score = r.get("relevance_score", r.get("score", r.get("relevance", 1.0 - i * 0.01)))
            normalized.append({"index": int(idx), "relevance_score": float(score)})
        if not normalized:
            raise ValueError(f"unrecognized rerank response shape: {list(data)[:5]}")
        return normalized
    except Exception as exc:  # noqa: BLE001
        logger.error("Luxia rerank failed: %s", exc)
        return [
            {"index": i, "relevance_score": 1.0 - i * 0.01}
            for i in range(min(top_k, len(documents)))
        ]
