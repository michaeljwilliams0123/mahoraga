"""One outbound-only Mahoraga polling cycle against the Dataverse task ledger."""

import json
import os
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.getcwd(), "scripts"))
from auth import get_client

CONTROL_CENTER = "http://127.0.0.1:4782"
TERMINAL = {"completed", "failed", "cancelled", "waiting", "waiting_for_user"}


def request_json(method, route, body=None):
    payload = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        CONTROL_CENTER + route,
        data=payload,
        method=method,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=5) as response:
        return json.loads(response.read().decode("utf-8"))


def value(row, prefix, name):
    return row.get(f"{prefix}_{name}")


def main():
    prefix = os.environ.get("PUBLISHER_PREFIX", "").strip().lower()
    if not prefix:
        raise SystemExit("PUBLISHER_PREFIX is not configured.")
    table = f"{prefix}_mahoragatask"
    primary_id = f"{prefix}_mahoragataskid"
    relay = "primary-windows"
    client = get_client("dv-data")
    local_tasks = {item["id"]: item for item in request_json("GET", "/api/tasks")["tasks"]}

    running = list(client.records.list(
        table,
        filter=f"{prefix}_relayid eq '{relay}' and {prefix}_state eq 'Running'",
        select=[primary_id, f"{prefix}_localtaskkey"],
        top=25,
    ))
    completed = 0
    for row in running:
        local = local_tasks.get(value(row, prefix, "localtaskkey"))
        if not local or local["status"] not in TERMINAL:
            continue
        state = "Completed" if local["status"] == "completed" else "Failed"
        client.records.update(table, row[primary_id], {
            f"{prefix}_state": state,
            f"{prefix}_resultsummary": (local.get("resultSummary") or "")[:100],
            f"{prefix}_verifier": (local.get("verifier") or "")[:100],
            f"{prefix}_errorcode": (local.get("errorCode") or "")[:100],
        })
        completed += 1

    queued = list(client.records.list(
        table,
        filter=f"{prefix}_state eq 'Queued'",
        select=[
            primary_id, f"{prefix}_correlationkey", f"{prefix}_tasktype",
            f"{prefix}_requestedoutcome", f"{prefix}_capability", f"{prefix}_dataclass",
            f"{prefix}_requestedmode", f"{prefix}_executionplane", f"{prefix}_priority",
            f"{prefix}_attempt", f"{prefix}_maximumattempts",
        ],
        orderby=["createdon asc"], top=10,
    ))
    claimed = 0
    for row in queued:
        correlation = value(row, prefix, "correlationkey")
        maximum = value(row, prefix, "maximumattempts") or 3
        attempt = value(row, prefix, "attempt") or 0
        if attempt >= maximum:
            client.records.update(table, row[primary_id], {f"{prefix}_state": "Failed", f"{prefix}_errorcode": "attempts-exhausted"})
            continue
        lease = (datetime.now(timezone.utc) + timedelta(seconds=60)).isoformat()
        client.records.update(table, row[primary_id], {
            f"{prefix}_state": "Claimed", f"{prefix}_relayid": relay,
            f"{prefix}_attempt": attempt + 1, f"{prefix}_leaseexpiresat": lease,
        })
        local = request_json("POST", "/api/tasks", {
            "capability": value(row, prefix, "capability"),
            "dataClass": value(row, prefix, "dataclass") or "synthetic",
            "requestedMode": value(row, prefix, "requestedmode") or "hybrid",
            "idempotencyKey": correlation,
            "correlationId": correlation,
            "taskType": value(row, prefix, "tasktype") or "microsoft",
            "requestedOutcome": value(row, prefix, "requestedoutcome") or "Complete queued Mahoraga task",
            "executionPlane": value(row, prefix, "executionplane") or "local",
            "priority": (value(row, prefix, "priority") or "normal").lower(),
            "maximumAttempts": maximum,
        })["task"]
        client.records.update(table, row[primary_id], {
            f"{prefix}_state": "Running", f"{prefix}_localtaskkey": local["id"],
        })
        claimed += 1

    print(json.dumps({"verified": True, "claimed": claimed, "completed": completed, "relay": relay}))


if __name__ == "__main__":
    main()
