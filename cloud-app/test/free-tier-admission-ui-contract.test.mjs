import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { projectFreeTierAdmission } from "../lib/free-tier-admission.ts";

const cloudAppRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const status = readFileSync(join(cloudAppRoot, "components/workspace/quota-admission-status.tsx"), "utf8");
const workspace = readFileSync(join(cloudAppRoot, "components/workspace.tsx"), "utf8");
const now = Date.parse("2026-09-13T02:00:00.000Z");
const route = (quotaAttestation, routingReason = null) => [{ billingClass: "free-tier-zero", quotaAttestation, routingReason }];
const fresh = { status: "available", observedAt: "2026-09-13T01:55:00.000Z", expiresAt: "2026-09-13T02:25:00.000Z" };

test("free-tier admission reports available evidence", () => {
  const value = projectFreeTierAdmission(route(fresh), now);
  assert.equal(value?.state, "available");
  assert.equal(value?.held, false);
  assert.equal(value?.label, "Free tier available");
});

test("free-tier admission fails closed for missing, expired, and exhausted evidence", () => {
  assert.equal(projectFreeTierAdmission(route(null), now)?.state, "missing");
  assert.equal(projectFreeTierAdmission(route({ status: "available", observedAt: "2026-09-13T01:00:00.000Z", expiresAt: "2026-09-13T01:30:00.000Z" }), now)?.state, "expired");
  assert.equal(projectFreeTierAdmission(route({ status: "exhausted", observedAt: "2026-09-13T01:55:00.000Z", expiresAt: "2026-09-13T02:25:00.000Z" }), now)?.state, "exhausted");
});

test("billing hold is sourced from the actual routing task, not capability readiness", () => {
  const taskHeld = projectFreeTierAdmission(route(fresh), now, "billing-not-zero-credit");
  assert.equal(taskHeld?.state, "available");
  assert.equal(taskHeld?.held, true);
  assert.equal(taskHeld?.holdReason, "billing-not-zero-credit");

  const readinessOnly = projectFreeTierAdmission(route(fresh, "billing-not-zero-credit"), now, null);
  assert.equal(readinessOnly?.held, false);
  assert.equal(readinessOnly?.holdReason, null);
});

test("workspace recomputes quota state at evidence expiry and derives holds from task errors", () => {
  assert.match(status, /Cost route/);
  assert.match(status, /Routing held to protect zero-cost execution/);
  assert.match(workspace, /QuotaAdmissionStatus/);
  assert.match(workspace, /projectFreeTierAdmission/);
  assert.match(workspace, /runtimeBillingHoldReason/);
  assert.match(workspace, /errorCode\s*===\s*["']billing-not-zero-credit["']/);
  assert.match(workspace, /setTimeout/);
  assert.match(workspace, /expiresAt/);
  assert.match(workspace, /setAdmissionNow/);
});
