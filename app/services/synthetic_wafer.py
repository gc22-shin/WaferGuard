from __future__ import annotations

import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

from app.services import real_wafer
from app.services.schemas import DefectType

DEFECT_TYPES: list[str] = [
    "Center",
    "Donut",
    "Edge-Loc",
    "Edge-Ring",
    "Loc",
    "Random",
    "Scratch",
    "Near-full",
    "None",
]


def choose_defect(defect_hint: str) -> str:
    if defect_hint != "auto":
        return defect_hint
    return random.choices(
        DEFECT_TYPES,
        weights=[13, 8, 12, 14, 13, 7, 12, 5, 16],
        k=1,
    )[0]


def generate_images(
    inspection_id: str,
    defect_type: DefectType,
    output_dir: Path,
    seed: int | None = None,
) -> dict[str, object]:
    sample = real_wafer.sample_wafer(defect_type)
    if sample is None:
        raise RuntimeError(
            f"No WM-811K wafer available for defect_type={defect_type!r}. "
            "Run `python scripts/build_wm811k_subset.py` to populate app/data/wm811k/."
        )
    wafer, defect_mask = _render_real_wafer(sample["wafer_map"])
    source_meta: dict[str, object] = {
        "source": "wm811k",
        "wm811k_id": sample["id"],
        "lot_name": sample["lot_name"],
        "wafer_index": sample["wafer_index"],
    }

    heatmap = _create_heatmap(defect_mask)
    overlay = _create_overlay(wafer, heatmap)
    roi, roi_bbox = _create_roi(wafer, defect_mask)

    image_path = output_dir / f"{inspection_id}_wafer.png"
    heatmap_path = output_dir / f"{inspection_id}_heatmap.png"
    overlay_path = output_dir / f"{inspection_id}_overlay.png"
    roi_path = output_dir / f"{inspection_id}_roi.png"

    wafer.save(image_path)
    heatmap.save(heatmap_path)
    overlay.save(overlay_path)
    roi.save(roi_path)

    hotspot_ratio = float(defect_mask.mean())
    return {
        "image_path": image_path,
        "heatmap_path": heatmap_path,
        "overlay_path": overlay_path,
        "roi_path": roi_path,
        "roi_bbox": roi_bbox,
        "hotspot_ratio": round(hotspot_ratio, 4),
        "wafer_source": source_meta,
    }


def _render_real_wafer(wafer_map: np.ndarray) -> tuple[Image.Image, np.ndarray]:
    """Render a WM-811K integer wafer map (values 0/1/2) as a display image.

    Background pixels (0) are dark; normal die (1) is light gray; defect die
    (2) is highlighted blue. The returned mask marks defect dies (value 2).
    """
    target = 224
    src_h, src_w = wafer_map.shape
    scale = target / max(src_h, src_w)
    new_h, new_w = int(round(src_h * scale)), int(round(src_w * scale))
    # Nearest-neighbour upscale to preserve the discrete die grid.
    arr = Image.fromarray(wafer_map, mode="L").resize((new_w, new_h), Image.Resampling.NEAREST)
    upscaled = np.asarray(arr)

    rgb = np.zeros((new_h, new_w, 3), dtype=np.uint8)
    background = upscaled == 0
    normal = upscaled == 1
    defect = upscaled == 2
    rgb[background] = np.array([12, 18, 24], dtype=np.uint8)
    rgb[normal] = np.array([178, 178, 178], dtype=np.uint8)
    rgb[defect] = np.array([62, 138, 232], dtype=np.uint8)

    # Centre-pad to a square canvas so downstream code sees a fixed size.
    canvas = np.zeros((target, target, 3), dtype=np.uint8)
    canvas[:] = np.array([12, 18, 24], dtype=np.uint8)
    off_y = (target - new_h) // 2
    off_x = (target - new_w) // 2
    canvas[off_y:off_y + new_h, off_x:off_x + new_w] = rgb

    mask = np.zeros((target, target), dtype=bool)
    mask[off_y:off_y + new_h, off_x:off_x + new_w] = defect

    image = Image.fromarray(canvas, mode="RGB")
    return image, mask


def _create_heatmap(mask: np.ndarray) -> Image.Image:
    size = mask.shape[0]
    if not mask.any():
        heat = np.zeros((size, size), dtype=np.uint8)
    else:
        raw = Image.fromarray((mask.astype(np.uint8) * 255), mode="L").filter(
            ImageFilter.GaussianBlur(radius=8)
        )
        heat = np.asarray(raw).copy()
        if heat.max() > 0:
            heat = (heat.astype(np.float32) / heat.max() * 255).astype(np.uint8)

    # Cool blue (low activation) -> teal -> green (high activation); no red.
    rgba = np.zeros((size, size, 4), dtype=np.uint8)
    rgba[..., 0] = np.clip(heat * 0.12, 0, 255).astype(np.uint8)
    rgba[..., 1] = heat
    rgba[..., 2] = np.clip(255 - heat * 0.6, 0, 255).astype(np.uint8)
    rgba[..., 3] = np.clip(heat * 0.85, 0, 210).astype(np.uint8)
    return Image.fromarray(rgba, mode="RGBA")


def _create_overlay(wafer: Image.Image, heatmap: Image.Image) -> Image.Image:
    base = wafer.convert("RGBA")
    return Image.alpha_composite(base, heatmap).convert("RGB")


def _create_roi(wafer: Image.Image, mask: np.ndarray) -> tuple[Image.Image, list[int]]:
    if not mask.any():
        width, height = wafer.size
        pad = width // 5
        bbox = [pad, pad, width - pad, height - pad]
    else:
        ys, xs = np.where(mask)
        pad = 18
        x0 = max(0, int(xs.min()) - pad)
        y0 = max(0, int(ys.min()) - pad)
        x1 = min(mask.shape[1], int(xs.max()) + pad)
        y1 = min(mask.shape[0], int(ys.max()) + pad)
        bbox = [x0, y0, x1, y1]
    roi = wafer.crop(tuple(bbox)).resize((224, 224), Image.Resampling.BICUBIC)
    return roi, bbox
