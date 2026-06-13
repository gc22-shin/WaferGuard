"""Real WM-811K wafer-map sampler.

Loads the curated subset produced by `scripts/build_wm811k_subset.py` and
serves random wafer maps per defect type. Wafer maps are 2D uint8 arrays
with values in {0: background, 1: normal die, 2: defect die}.
"""
from __future__ import annotations

import json
import random
import threading
from pathlib import Path

import numpy as np

DATA_DIR = Path(__file__).resolve().parents[1] / "data" / "wm811k"
MANIFEST_PATH = DATA_DIR / "manifest.json"

_lock = threading.Lock()
_index: dict[str, list[dict]] | None = None


def _load_index() -> dict[str, list[dict]]:
    global _index
    if _index is not None:
        return _index
    with _lock:
        if _index is not None:
            return _index
        if not MANIFEST_PATH.exists():
            _index = {}
            return _index
        raw = json.loads(MANIFEST_PATH.read_text())
        bucket: dict[str, list[dict]] = {}
        for entry in raw.get("wafers", []):
            bucket.setdefault(entry["defect_type"], []).append(entry)
        _index = bucket
    return _index


def is_available(defect_type: str | None = None) -> bool:
    index = _load_index()
    if not index:
        return False
    if defect_type is None:
        return True
    return bool(index.get(defect_type))


def sample_wafer(defect_type: str) -> dict | None:
    """Return a random WM-811K record matching defect_type, or None.

    Record keys: `wafer_map` (np.ndarray uint8), `id`, `lot_name`,
    `wafer_index`, `defect_type`.
    """
    index = _load_index()
    candidates = index.get(defect_type) or []
    if not candidates:
        return None
    entry = random.choice(candidates)
    npy_path = DATA_DIR / entry["rel_path"]
    if not npy_path.exists():
        return None
    wafer_map = np.load(npy_path)
    return {
        "wafer_map": wafer_map,
        "id": entry["id"],
        "lot_name": entry["lot_name"],
        "wafer_index": entry["wafer_index"],
        "defect_type": entry["defect_type"],
    }


def available_defect_types() -> list[str]:
    return list(_load_index().keys())
