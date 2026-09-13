import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { projectFreeTierAdmission } from "../lib/free-tier-admission.ts";

const root = process.cwd();
const status = readFileSync(join(root, "components/workspace/quota-admission-status.tsx"), "utf8");
const workspace = readFileSync(join(root, "components/workspace.tsx"), "utf8");
const now = Date.parse("2026-09-13T02:00:00.000Z");
const route = (quotaAttestation) => [{ billingClass: "free-tier-zero", quotaAttestation }];

test("free-tier admission reports available evidence", () => {
  const value = projectFreeTierAdmission(route({ status: "available", observedAt: "2026-09-13T01:55:00.000Z", expiresAt: "2026-09-13T02:25:00.000Z" }), now);
  assert.equal(value?.state, "available");
  assert.equal(value?.held, false);
  assert.equal(value?.label, "Free tier available");
});

test("free-tier admission fails closed for missing, expired, and exhausted evidence", () => {
  assert.equal(projectFreeTierAdmission(route(null), now)?.state, "missing");
  assert.equal(projectFreeTierAdmission(route({ status: "available", observedAt: "2026-09-13T01:00:00.000Z", expiresAt: "2026-09-13T01:30:00.000Z" }), now)?.state, "expired");
  assert.equal(projectFreeTierAdmission(route({ status: "exhausted", observedAt: "2026-09-13T01:55:00.000Z", expiresAt: "2026-09-13T02:25:00.000Z" }), now)?.state, "exhausted");
});

test("workspace shows quota state and zero-cost holds", () => {
  assert.match(status, /Cost route/);
  assert.match(status, /Routing held to protect zero-cost execution/);
  assert.match(workspace, /QuotaAdmissionStatus/);
  assert.match(workspace, /projectFreeTierAdmission/);
});
