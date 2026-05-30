"""
build_rag_index.py — One-shot RAG corpus indexing script.

Reads app/data/rag_corpus.json, calls luxia_client.embed in batches of 16,
and writes each document to storage via storage.upsert_rag_document.

Safe to run twice (upsert semantics).

Usage:
    conda run -n waferguard python scripts/build_rag_index.py

Environment:
    LUXIA_API_KEY — if missing, zero-vector embeddings are written so that
    query_rag still returns rows (cosine scores won't be meaningful, but the
    smoke test path still works).
"""
from __future__ import annotations

import json
import math
import os
import sys
from pathlib import Path

# Resolve project root so imports work regardless of cwd
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

CORPUS_PATH = PROJECT_ROOT / "app" / "data" / "rag_corpus.json"
BATCH_SIZE = 16
EMBEDDING_DIM = 1024  # Luxia embedding dimension


def load_corpus() -> list[dict]:
    with CORPUS_PATH.open(encoding="utf-8") as f:
        return json.load(f)


def get_luxia_client():
    try:
        from app.services.luxia_client import luxia_client  # noqa: PLC0415
        return luxia_client
    except (ImportError, AttributeError, Exception) as exc:
        print(f"[WARN] Could not import luxia_client: {exc}")
        return None


def get_storage():
    try:
        import app.services.storage as storage  # noqa: PLC0415
        return storage
    except ImportError as exc:
        print(f"[ERROR] Could not import storage: {exc}")
        sys.exit(1)


def zero_vector(dim: int = EMBEDDING_DIM) -> list[float]:
    return [0.0] * dim


def embed_batch(luxia, texts: list[str]) -> list[list[float]]:
    """Embed a batch of texts; return list of float vectors."""
    try:
        return luxia.embed(texts)
    except Exception as exc:
        print(f"  [WARN] Embed call failed: {exc} — using zero vectors for this batch")
        return [zero_vector() for _ in texts]


def main() -> None:
    api_key = os.environ.get("LUXIA_API_KEY", "")
    if not api_key:
        print("[WARN] LUXIA_API_KEY is not set. Zero-vector embeddings will be used.")
        print("       Cosine similarity scores will not be meaningful, but rows will exist.")

    corpus = load_corpus()
    print(f"[INFO] Loaded {len(corpus)} documents from {CORPUS_PATH}")

    luxia = get_luxia_client() if api_key else None
    storage = get_storage()

    upsert_rag_document = getattr(storage, "upsert_rag_document", None)
    if upsert_rag_document is None:
        print(
            "[WARN] storage.upsert_rag_document not found — Agent A may not have "
            "committed storage extensions yet. Initialising DB and exiting."
        )
        try:
            storage.init_db()
        except Exception as exc:
            print(f"[WARN] init_db: {exc}")
        print("[INFO] Re-run this script after Agent A's storage PR is merged.")
        return

    # Initialise DB (idempotent)
    try:
        storage.init_db()
    except Exception as exc:
        print(f"[WARN] init_db: {exc}")

    num_batches = math.ceil(len(corpus) / BATCH_SIZE)
    total_written = 0

    for batch_idx in range(num_batches):
        start = batch_idx * BATCH_SIZE
        end = min(start + BATCH_SIZE, len(corpus))
        batch = corpus[start:end]

        texts = [doc["content"] for doc in batch]
        print(f"[{batch_idx + 1}/{num_batches}] Embedding docs {start + 1}–{end} ...", end=" ")

        if luxia is not None:
            embeddings = embed_batch(luxia, texts)
        else:
            embeddings = [zero_vector() for _ in texts]

        print(f"dim={len(embeddings[0]) if embeddings else 0}")

        for doc, embedding in zip(batch, embeddings, strict=False):
            try:
                upsert_rag_document(
                    doc_id=doc["id"],
                    content=doc["content"],
                    defect_type=doc.get("defect_type", ""),
                    embedding=embedding,
                    metadata=doc.get("metadata", {}),
                )
                total_written += 1
            except Exception as exc:
                print(f"  [ERROR] upsert failed for doc {doc['id']}: {exc}")

    print(f"[INFO] Done. {total_written}/{len(corpus)} documents written to rag_documents table.")


if __name__ == "__main__":
    main()
