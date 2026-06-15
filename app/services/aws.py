"""Lazy boto3 client factory — single place that knows the AWS region.

Clients are created on first use and cached. boto3 is imported lazily so the
app runs locally (IMAGE_BACKEND=local, STORAGE_BACKEND=sqlite, no AWS) without
boto3 credentials configured. On EC2 the attached IAM role (or LabRole) supplies
credentials automatically.
"""
from __future__ import annotations

import functools
import os


def region() -> str:
    explicit = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION")
    if explicit:
        return explicit
    # Fall back to boto3's own resolution (config files / EC2 instance metadata)
    # so the bucket's real region is used even if no env var is set.
    try:
        import boto3  # noqa: PLC0415

        resolved = boto3.session.Session().region_name
        if resolved:
            return resolved
    except Exception:  # noqa: BLE001
        pass
    return "us-east-1"


@functools.lru_cache(maxsize=None)
def s3_region() -> str:
    """The bucket's *actual* region, auto-detected via get_bucket_location.

    Presigned URLs must be signed for, and hosted on, the bucket's real region or
    S3 returns SignatureDoesNotMatch + 307. Detecting it directly removes any
    dependence on AWS_REGION being set correctly.
    """
    bucket = os.environ.get("S3_BUCKET")
    if not bucket:
        return region()
    try:
        import boto3  # noqa: PLC0415

        probe = boto3.client("s3", region_name=region())
        loc = probe.get_bucket_location(Bucket=bucket).get("LocationConstraint")
        return loc or "us-east-1"  # us-east-1 reports None
    except Exception:  # noqa: BLE001
        return region()


@functools.lru_cache(maxsize=None)
def _client(service: str):
    import boto3  # noqa: PLC0415 — lazy so local dev needs no boto3 creds

    if service == "s3":
        # Use the bucket's real region with an explicit regional endpoint + SigV4
        # + virtual-hosted addressing, so the presigned URL's host matches the
        # signing region (otherwise: global s3.amazonaws.com host → 307 +
        # SignatureDoesNotMatch for non-us-east-1 buckets).
        from botocore.config import Config  # noqa: PLC0415

        reg = s3_region()
        return boto3.client(
            "s3",
            region_name=reg,
            endpoint_url=f"https://s3.{reg}.amazonaws.com",
            config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}),
        )
    return boto3.client(service, region_name=region())


def s3():
    return _client("s3")


def sns():
    return _client("sns")


def secretsmanager():
    return _client("secretsmanager")
