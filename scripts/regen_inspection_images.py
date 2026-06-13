"""Regenerate every inspection's wafer/heatmap/overlay/ROI image from real WM-811K data.

Walks `inspections` in outputs/waferguard.db, calls `generate_images` per record
(reusing the inspection_id so URLs stay valid), and updates `proxy_status`,
`hotspot_ratio`, and `roi_bbox_json` to reflect the new real-data render.
"""
from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.services.config import IMAGE_DIR  # noqa: E402
from app.services.synthetic_wafer import generate_images  # noqa: E402

DB_PATH = ROOT / "outputs" / "waferguard.db"


def main() -> None:
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    rows = con.execute("SELECT id, defect_type FROM inspections").fetchall()
    print(f"[INFO] regenerating images for {len(rows)} inspections")

    updates = []
    for i, row in enumerate(rows, 1):
        result = generate_images(
            inspection_id=row["id"],
            defect_type=row["defect_type"],
            output_dir=IMAGE_DIR,
        )
        src = result["wafer_source"]
        proxy_status = (
            f"WM-811K wafer map ({src['wm811k_id']}, lot={src['lot_name']})"
        )
        updates.append(
            (
                proxy_status,
                float(result["hotspot_ratio"]),
                json.dumps(result["roi_bbox"]),
                row["id"],
            )
        )
        if i % 50 == 0:
            print(f"  ... {i}/{len(rows)}")

    con.executemany(
        "UPDATE inspections SET proxy_status=?, hotspot_ratio=?, roi_bbox_json=? WHERE id=?",
        updates,
    )
    con.commit()
    con.close()
    print(f"[DONE] regenerated {len(rows)} inspections")


if __name__ == "__main__":
    main()
