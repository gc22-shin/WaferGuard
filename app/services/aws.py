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
    return (
        os.environ.get("AWS_REGION")
        or os.environ.get("AWS_DEFAULT_REGION")
        or "us-east-1"
    )


@functools.lru_cache(maxsize=None)
def _client(service: str):
    import boto3  # noqa: PLC0415 — lazy so local dev needs no boto3 creds

    return boto3.client(service, region_name=region())


def s3():
    return _client("s3")


def sns():
    return _client("sns")


def secretsmanager():
    return _client("secretsmanager")
