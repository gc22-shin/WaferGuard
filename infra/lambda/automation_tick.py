"""AWS Lambda handler — triggers one WaferGuard automation tick on a schedule.

Wired to EventBridge (e.g. rate(1 hour)). It makes a single HTTP POST to the
EC2-hosted FastAPI endpoint ``/api/v1/automation/tick``, which runs a simulated
inspection + drift check + conditional handoff. All request fields default
server-side, so an empty JSON body is sufficient.

Uses only the Python standard library (urllib) — no dependencies to package.

Config (Lambda environment variables):
    EC2_BASE   Base URL of the app, e.g. http://<ELASTIC_IP>:8000  (required)

Recommended Lambda settings: runtime Python 3.12, timeout 60s, default
execution role (CloudWatch Logs only — it just calls the EC2 over HTTP).
"""
from __future__ import annotations

import json
import os
from urllib import error, request

EC2_BASE = os.environ.get("EC2_BASE", "").rstrip("/")
TICK_PATH = "/api/v1/automation/tick"


def lambda_handler(event, context):  # noqa: ANN001, ARG001
    if not EC2_BASE:
        return {"statusCode": 500, "body": "EC2_BASE env var is not set"}

    payload = json.dumps({}).encode("utf-8")  # all AutomationTickRequest fields default
    req = request.Request(
        f"{EC2_BASE}{TICK_PATH}",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=55) as resp:
            body = resp.read(500).decode("utf-8", "ignore")
            return {"statusCode": resp.status, "body": body}
    except error.HTTPError as exc:
        return {"statusCode": exc.code, "body": exc.read(500).decode("utf-8", "ignore")}
    except Exception as exc:  # noqa: BLE001
        return {"statusCode": 502, "body": f"request failed: {exc}"}
