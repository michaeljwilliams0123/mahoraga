#!/usr/bin/env python3
"""Offline validator for the two-way feed contract.

Design-only, zero-credit, no network, no secrets. Validates the example
fixture against the inbound/outbound JSON Schemas and checks receipt
idempotency semantics. Intended to run in CI without invoking any model.
"""
import json
import sys
from pathlib import Path

try:
    from jsonschema import Draft7Validator
except ImportError:
    print("jsonschema not installed; run: pip install jsonschema")
    sys.exit(2)

ROOT = Path(__file__).resolve().parents[1]


def load(p):
    return json.loads((ROOT / p).read_text(encoding="utf-8"))


def accept_receipt_once(seen, task_id):
    """Return True only for the first receipt observed for a task id."""
    if task_id in seen:
        return False
    seen.add(task_id)
    return True


def main():
    inbound_schema = load("schemas/inbound-dispatch.schema.json")
    outbound_schema = load("schemas/outbound-receipt.schema.json")
    example = load("examples/round-trip-example.json")

    failures = []

    # 1. Valid inbound passes.
    errs = list(Draft7Validator(inbound_schema).iter_errors(example["inbound_example"]))
    if errs:
        failures.append(f"inbound example failed: {[e.message for e in errs]}")

    # 2. Valid outbound passes.
    errs = list(Draft7Validator(outbound_schema).iter_errors(example["outbound_example"]))
    if errs:
        failures.append(f"outbound example failed: {[e.message for e in errs]}")

    # 3. Malformed inbound (broadened authority attempt) is rejected.
    bad = dict(example["inbound_example"])
    bad["codeReview"] = True  # must be false
    if not list(Draft7Validator(inbound_schema).iter_errors(bad)):
        failures.append("broadened inbound (codeReview=true) was NOT rejected")

    # 4. Receipt idempotency: first observation is accepted, duplicate is a no-op.
    seen = set()
    tid = example["outbound_example"]["taskId"]
    if not accept_receipt_once(seen, tid):
        failures.append("first receipt was incorrectly rejected")
    if accept_receipt_once(seen, tid):
        failures.append("duplicate taskId was incorrectly accepted")

    if failures:
        print("FAIL:")
        for f in failures:
            print(" -", f)
        sys.exit(1)

    print("OK: all contract validation checks passed (offline, zero-credit).")


if __name__ == "__main__":
    main()
