from __future__ import annotations

import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[1] / "data"


def proxy_dataset_manifest() -> dict[str, object]:
    manifest = _load_json(DATA_DIR / "proxy_dataset_manifest.json")
    local_dir = Path(__file__).resolve().parents[2] / str(manifest.get("local_proxy_dir", "data/proxy_images"))
    manifest["local_available"] = local_dir.exists() and any(local_dir.rglob("*.*"))
    manifest["local_path"] = str(local_dir)
    return manifest


def metrology_threshold_basis() -> dict[str, object]:
    return _load_json(DATA_DIR / "metrology_threshold_basis.json")


def _load_json(path: Path) -> dict[str, object]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)
