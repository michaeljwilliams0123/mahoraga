"""Create or reuse the Mahoraga Dataverse queue inside the confirmed solution."""

import os
import sys
import time

sys.path.insert(0, os.path.join(os.getcwd(), "scripts"))
from auth import get_client


def required(name):
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing confirmed setting: {name}")
    return value


def first(result):
    rows = list(result)
    return rows[0] if rows else None


def main():
    prefix = required("PUBLISHER_PREFIX").lower()
    publisher_name = required("PUBLISHER_UNIQUE_NAME")
    solution_name = required("SOLUTION_NAME")
    if not prefix.isalpha() or not 2 <= len(prefix) <= 8 or prefix == "new":
        raise SystemExit("PUBLISHER_PREFIX must be 2-8 letters and cannot be 'new'.")

    client = get_client("dv-solution")
    publisher = first(client.records.list(
        "publisher",
        filter=f"uniquename eq '{publisher_name}'",
        select=["publisherid", "uniquename", "customizationprefix"],
        top=1,
    ))
    if publisher and publisher["customizationprefix"] != prefix:
        raise SystemExit("Existing publisher prefix does not match the confirmed prefix.")
    if not publisher:
        publisher_id = client.records.create("publisher", {
            "uniquename": publisher_name,
            "friendlyname": "Mahoraga",
            "customizationprefix": prefix,
            "description": "Publisher for the authenticated Mahoraga production control plane.",
        })
    else:
        publisher_id = publisher["publisherid"]

    solution = first(client.records.list(
        "solution", filter=f"uniquename eq '{solution_name}'",
        select=["solutionid", "uniquename"], top=1,
    ))
    if not solution:
        solution_id = client.records.create("solution", {
            "uniquename": solution_name,
            "friendlyname": "Mahoraga Platform",
            "version": "1.0.0.0",
            "publisherid@odata.bind": f"/publishers({publisher_id})",
        })
    else:
        solution_id = solution["solutionid"]

    schema = f"{prefix}_MahoragaTask"
    logical = schema.lower()
    existing = client.tables.get(logical)
    if not existing:
        client.tables.create(
            schema,
            {
                f"{prefix}_CorrelationKey": "string",
                f"{prefix}_TaskType": "string",
                f"{prefix}_RequestedOutcome": "string",
                f"{prefix}_Capability": "string",
                f"{prefix}_DataClass": "string",
                f"{prefix}_RequestedMode": "string",
                f"{prefix}_ExecutionPlane": "string",
                f"{prefix}_State": "string",
                f"{prefix}_Priority": "string",
                f"{prefix}_RelayId": "string",
                f"{prefix}_LocalTaskKey": "string",
                f"{prefix}_Attempt": "int",
                f"{prefix}_MaximumAttempts": "int",
                f"{prefix}_LeaseExpiresAt": "datetime",
                f"{prefix}_ResultSummary": "string",
                f"{prefix}_Verifier": "string",
                f"{prefix}_ErrorCode": "string",
            },
            solution=solution_name,
            primary_column=f"{prefix}_Name",
            display_name="Mahoraga Task",
        )
        time.sleep(15)

    keys = list(client.tables.get_alternate_keys(logical))
    key_name = f"{prefix}_MahoragaTask_CorrelationKey"
    if not any(item.schema_name.lower() == key_name.lower() for item in keys):
        client.tables.create_alternate_key(
            logical, key_name, [f"{prefix}_correlationkey"],
            display_name="Mahoraga Task Correlation Key",
        )

    print({
        "solutionId": solution_id,
        "solution": solution_name,
        "publisherId": publisher_id,
        "prefix": prefix,
        "tableSchemaName": schema,
        "tableLogicalName": logical,
        "status": "created-or-reused",
    })


if __name__ == "__main__":
    main()
