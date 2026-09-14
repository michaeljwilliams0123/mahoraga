import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("mounted work surfaces describe lease-expiry aggregates truthfully", () => {
  const operations = readFileSync(join(root, "components/workspace/operations-view.tsx"), "utf8");
  const work = readFileSync(join(root, "components/workspace/work-view.tsx"), "utf8");
  const legacyCockpit = readFileSync(join(root, "components/cockpit/CommandCockpit.tsx"), "utf8");

  assert.match(operations, /active \{snapshot\.tasks\.active\}.*includes queued retries/);
  assert.match(operations, /waiting \{snapshot\.tasks\.waiting\}/);
  assert.doesNotMatch(operations, /queued\/retry \{snapshot\.tasks\.waiting\}/);
  assert.match(operations, /lease-expired exhausted is not claimable/);

  assert.match(work, /tasks in motion; includes queued retries/);
  assert.match(work, /waiting or waiting for user input/);
  assert.match(work, /terminal; lease-expired exhausted is not claimable/);
  assert.doesNotMatch(work, /queued retry remaining, not exhausted/);

  assert.doesNotMatch(legacyCockpit, /TASK LEASES/);
});
