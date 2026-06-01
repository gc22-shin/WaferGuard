"""Extract a balanced subset of real WM-811K wafer maps from LSWMD.pkl.

Run once after downloading LSWMD.pkl. Produces:
- app/data/wm811k/<defect_type>/<idx>.npy  (raw int wafer maps, values in {0,1,2})
- app/data/wm811k/manifest.json            (list of records)
"""
from __future__ import annotations

import json
import pickle
import sys
from pathlib import Path

import numpy as np

PROJECT_ROOT = Path(__file__).resolve().parents[1]
PKL_PATH = PROJECT_ROOT / "LSWMD.pkl"
OUT_DIR = PROJECT_ROOT / "app" / "data" / "wm811k"

# WM-811K labels → app's canonical DEFECT_TYPES
LABEL_MAP = {
    "Center": "Center",
    "Donut": "Donut",
    "Edge-Loc": "Edge-Loc",
    "Edge-Ring": "Edge-Ring",
    "Loc": "Loc",
    "Random": "Random",
    "Scratch": "Scratch",
    "Near-full": "Near-full",
    "none": "None",
}
SAMPLES_PER_CLASS = 200


def _install_pickle_shim() -> None:
    """LSWMD.pkl was saved with pandas <0.20; alias old module path."""
    import pandas.core.indexes.base as _base
    import pandas.core.indexes.numeric as _num
    import pandas.core.indexes.range as _rng

    class _Shim:
        pass

    shim = _Shim()
    shim.base, shim.numeric, shim.range = _base, _num, _rng
    sys.modules.setdefault("pandas.indexes", shim)
    sys.modules.setdefault("pandas.indexes.base", _base)
    sys.modules.setdefault("pandas.indexes.numeric", _num)
    sys.modules.setdefault("pandas.indexes.range", _rng)


def _extract_label(value) -> str | None:
    if isinstance(value, np.ndarray) and value.size:
        return str(value.flatten()[0])
    return None


def main() -> None:
    if not PKL_PATH.exists():
        sys.exit(f"LSWMD.pkl not found at {PKL_PATH}. Download it first.")
    _install_pickle_shim()
    print(f"[INFO] loading {PKL_PATH} ...")
    with PKL_PATH.open("rb") as f:
        df = pickle.load(f, encoding="latin1")
    print(f"[INFO] loaded {len(df):,} wafers")
    df["_lbl"] = df["failureType"].apply(_extract_label)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = []
    rng = np.random.default_rng(seed=42)

    for src_label, canonical in LABEL_MAP.items():
        subset = df[df["_lbl"] == src_label]
        if subset.empty:
            print(f"[WARN] no rows for {src_label}; skipping")
            continue
        n = min(SAMPLES_PER_CLASS, len(subset))
        # Prefer wafers with reasonable resolution (>= 25 px on each axis)
        candidates = [
            idx for idx in subset.index
            if isinstance(subset.at[idx, "waferMap"], np.ndarray)
            and min(subset.at[idx, "waferMap"].shape) >= 25
        ]
        if len(candidates) < n:
            candidates = list(subset.index)
        chosen = rng.choice(candidates, size=n, replace=False)

        class_dir = OUT_DIR / canonical
        class_dir.mkdir(parents=True, exist_ok=True)
        for i, src_idx in enumerate(chosen):
            row = df.loc[src_idx]
            wm = np.asarray(row["waferMap"], dtype=np.uint8)
            npy_path = class_dir / f"{i:03d}.npy"
            np.save(npy_path, wm)
            lot_raw = row.get("lotName")
            if isinstance(lot_raw, np.ndarray) and lot_raw.size:
                lot = str(lot_raw.flatten()[0])
            elif lot_raw is not None:
                lot = str(lot_raw)
            else:
                lot = "LOT-UNKNOWN"
            wafer_idx_raw = row.get("waferIndex")
            try:
                if isinstance(wafer_idx_raw, np.ndarray) and wafer_idx_raw.size:
                    wafer_idx = int(np.asarray(wafer_idx_raw).flatten()[0])
                elif wafer_idx_raw is not None:
                    wafer_idx = int(float(wafer_idx_raw))
                else:
                    wafer_idx = 0
            except (TypeError, ValueError):
                wafer_idx = 0
            manifest.append(
                {
                    "id": f"WM811K-{canonical}-{i:03d}",
                    "defect_type": canonical,
                    "lot_name": lot,
                    "wafer_index": wafer_idx,
                    "shape": list(wm.shape),
                    "rel_path": str(npy_path.relative_to(OUT_DIR)),
                }
            )
        print(f"[OK]   {canonical:<10s} {n} wafers -> {class_dir}")

    manifest_path = OUT_DIR / "manifest.json"
    manifest_path.write_text(
        json.dumps({"samples_per_class": SAMPLES_PER_CLASS, "wafers": manifest}, ensure_ascii=False, indent=2)
    )
    print(f"[DONE] {len(manifest)} entries -> {manifest_path}")


if __name__ == "__main__":
    main()
