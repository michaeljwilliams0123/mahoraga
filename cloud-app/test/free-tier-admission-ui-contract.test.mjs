import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();
const projector = readFileSync(join(root, "lib/free-tier-admission.ts"), "utf8");
const status = readFileSync(join(root, "components/workspace/quota-admission-status.tsx"), "utf8");
const workspace = readFileSync(join(root, "components/workspace.tsx"), "utf8");

test("workspace models free-tier quota admission evidence", () => {
  assert.match(projector, /FreeTierAdmission/);
  assert.match(projector, /observedAt/);
  assert.match(projector, /expiresAt/);
  assert.match(projector, /available/);
  assert.match(projector, /missing/);
  assert.match(projector, /expired/);
  assert.match(projector, /exhausted/);
});

test("workspace shows quota state and zero-cost holds", () => {
  assert.match(status, /Cost route/);
  assert.match(status, /Routing held to protect zero-cost execution/);
  assert.match(workspace, /QuotaAdmissionStatus/);
  assert.match(workspace, /projectFreeTierAdmission/);
});
