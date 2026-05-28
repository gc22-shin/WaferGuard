from __future__ import annotations

import math
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

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
    rng = np.random.default_rng(seed or random.randint(1, 999_999))
    wafer, defect_mask = _create_wafer(defect_type, rng)
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
    }


def _create_wafer(defect_type: str, rng: np.random.Generator) -> tuple[Image.Image, np.ndarray]:
    size = 224
    center = size // 2
    radius = 99

    yy, xx = np.mgrid[:size, :size]
    dist = np.sqrt((xx - center) ** 2 + (yy - center) ** 2)
    wafer_mask = dist <= radius
    base = np.full((size, size), 22, dtype=np.uint8)
    wafer = np.full((size, size), 178, dtype=np.float32)
    wafer += rng.normal(0, 7, (size, size))
    wafer[~wafer_mask] = base[~wafer_mask]

    defect_mask = np.zeros((size, size), dtype=bool)

    if defect_type == "Center":
        defect_mask = dist < 30
    elif defect_type == "Donut":
        defect_mask = (dist > 33) & (dist < 55)
    elif defect_type == "Edge-Loc":
        defect_mask = (dist > 76) & (dist < 99) & (xx > center + 12) & (yy < center + 50)
    elif defect_type == "Edge-Ring":
        defect_mask = (dist > 78) & (dist < 99)
    elif defect_type == "Loc":
        cx, cy = center - 35, center + 20
        defect_mask = ((xx - cx) ** 2 / 24**2 + (yy - cy) ** 2 / 15**2) < 1
    elif defect_type == "Random":
        points = rng.choice(np.flatnonzero(wafer_mask), size=950, replace=False)
        defect_mask.flat[points] = True
        defect_mask = _dilate(defect_mask, rounds=1)
    elif defect_type == "Scratch":
        defect_mask = _scratch_mask(size, center, rng) & wafer_mask
        defect_mask = _dilate(defect_mask, rounds=2)
    elif defect_type == "Near-full":
        defect_mask = (dist < 91) & (rng.random((size, size)) > 0.28)
    elif defect_type == "None":
        defect_mask = np.zeros((size, size), dtype=bool)

    wafer[defect_mask] = rng.normal(62, 9, defect_mask.sum())
    wafer = np.clip(wafer, 0, 255).astype(np.uint8)

    rgb = np.zeros((size, size, 3), dtype=np.uint8)
    rgb[..., 0] = wafer
    rgb[..., 1] = wafer
    rgb[..., 2] = wafer
    rgb[~wafer_mask] = np.array([12, 18, 24], dtype=np.uint8)
    outline = Image.fromarray(rgb, mode="RGB")
    draw = ImageDraw.Draw(outline)
    draw.ellipse(
        (center - radius, center - radius, center + radius, center + radius),
        outline=(88, 110, 126),
        width=2,
    )
    return outline.filter(ImageFilter.SMOOTH), defect_mask


def _scratch_mask(size: int, center: int, rng: np.random.Generator) -> np.ndarray:
    mask = np.zeros((size, size), dtype=bool)
    angle = rng.uniform(-0.55, 0.55)
    length = rng.integers(120, 175)
    x0 = center - int(math.cos(angle) * length / 2)
    y0 = center - int(math.sin(angle) * length / 2) + rng.integers(-35, 35)
    x1 = center + int(math.cos(angle) * length / 2)
    y1 = center + int(math.sin(angle) * length / 2) + rng.integers(-35, 35)
    image = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(image)
    draw.line((x0, y0, x1, y1), fill=255, width=int(rng.integers(3, 6)))
    return np.asarray(image) > 0


def _dilate(mask: np.ndarray, rounds: int) -> np.ndarray:
    current = mask.copy()
    for _ in range(rounds):
        padded = np.pad(current, 1, mode="constant")
        current = (
            padded[1:-1, 1:-1]
            | padded[:-2, 1:-1]
            | padded[2:, 1:-1]
            | padded[1:-1, :-2]
            | padded[1:-1, 2:]
            | padded[:-2, :-2]
            | padded[:-2, 2:]
            | padded[2:, :-2]
            | padded[2:, 2:]
        )
    return current


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

    rgba = np.zeros((size, size, 4), dtype=np.uint8)
    rgba[..., 0] = heat
    rgba[..., 1] = np.clip(heat * 0.45, 0, 255).astype(np.uint8)
    rgba[..., 2] = np.clip(255 - heat, 0, 255).astype(np.uint8)
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
