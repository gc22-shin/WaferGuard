"""File storage abstraction — local disk or S3, chosen by IMAGE_BACKEND.

The DB stores a canonical **object key** (e.g. ``images/INS-xxx_wafer.png`` or
``reports/INS-xxx.csv``), never a presigned URL (those expire). At read time the
key is converted to something the browser can fetch:

- local mode → ``/outputs/<key>`` (served by FastAPI StaticFiles, same as before)
- s3 mode    → a short-lived presigned URL

This keeps both modes working with the same DB rows and the same frontend code.
"""
from __future__ import annotations

import io
import os

from app.services.config import OUTPUT_DIR


def _backend() -> str:
    return os.environ.get("IMAGE_BACKEND", "local").lower()


def _bucket() -> str:
    return os.environ["S3_BUCKET"]


def _norm(key: str) -> str:
    """Normalize a stored value into a canonical key.

    Tolerates legacy values like ``/outputs/images/x.png`` so old DB rows keep
    resolving after the migration.
    """
    if not key:
        return key
    k = key.lstrip("/")
    if k.startswith("outputs/"):
        k = k[len("outputs/"):]
    return k


def save_image(img, key: str) -> str:
    """Persist a PIL image at ``key``. Returns the canonical key."""
    key = _norm(key)
    if _backend() == "s3":
        from app.services import aws  # noqa: PLC0415

        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        aws.s3().upload_fileobj(buf, _bucket(), key)
    else:
        path = OUTPUT_DIR / key
        path.parent.mkdir(parents=True, exist_ok=True)
        img.save(path)
    return key


def put_bytes(key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
    """Persist raw bytes (e.g. a CSV/PDF report) at ``key``. Returns the key."""
    key = _norm(key)
    if _backend() == "s3":
        from app.services import aws  # noqa: PLC0415

        aws.s3().put_object(Bucket=_bucket(), Key=key, Body=data, ContentType=content_type)
    else:
        path = OUTPUT_DIR / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    return key


def read_bytes(key: str) -> bytes | None:
    """Read an object's bytes. Returns None if it cannot be resolved."""
    key = _norm(key)
    if _backend() == "s3":
        from app.services import aws  # noqa: PLC0415

        try:
            obj = aws.s3().get_object(Bucket=_bucket(), Key=key)
            return obj["Body"].read()
        except Exception:  # noqa: BLE001
            return None
    path = OUTPUT_DIR / key
    return path.read_bytes() if path.is_file() else None


def presign(key: str, expires: int = 3600) -> str:
    """Turn a stored key into a browser-fetchable URL for the current backend."""
    if not key:
        return key
    canonical = _norm(key)
    if _backend() == "s3":
        from app.services import aws  # noqa: PLC0415

        return aws.s3().generate_presigned_url(
            "get_object",
            Params={"Bucket": _bucket(), "Key": canonical},
            ExpiresIn=expires,
        )
    return f"/outputs/{canonical}"
