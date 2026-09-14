import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const source = stripTypeScriptTypes(
  readFileSync(new URL("../lib/interaction-readiness.ts", import.meta.url), "utf8"),
  { mode: "strip" },
);
const { projectZeroCreditAdmission } = await import(`data:text/javascript,${encodeURIComponent(source)}`);

test("zero-credit admission allows only a verified routable zero-credit answer route", () => {
  assert.deepEqual(projectZeroCreditAdmission([{
    capability: "assistant.respond", enabled: true, routable: true,
    provider: "codespaces-open-weight", costClass: "cloud-open-weight", billingClass: "verified-zero",
    lastVerifiedAt: "2026-09-14T22:00:00.000Z",
  }]), {
    state: "allow", provider: "codespaces-open-weight", costClass: "cloud-open-weight",
    billingClass: "verified-zero", reason: "verified-zero-credit-route", lastVerifiedAt: "2026-09-14T22:00:00.000Z",
  });
});

test("zero-credit admission holds an unroutable zero-credit route with its canonical reason", () => {
  const result = projectZeroCreditAdmission([{
    capability: "assistant.respond", enabled: true, routable: false,
    provider: "codespaces-open-weight", costClass: "cloud-open-weight",
    providerReasonCode: "zero-credit-model-configuration-missing",
  }]);
  assert.equal(result.state, "hold");
  assert.equal(result.reason, "zero-credit-model-configuration-missing");
  assert.equal(result.lastVerifiedAt, null);
});

test("zero-credit admission denies paid answer routes and never treats unrelated routes as evidence", () => {
  assert.equal(projectZeroCreditAdmission([{
    capability: "assistant.respond", enabled: true, routable: true,
    provider: "licensed", costClass: "licensed-cloud", billingClass: "licensed",
  }]).state, "deny");
  assert.deepEqual(projectZeroCreditAdmission([{
    capability: "system.health", enabled: true, routable: true, costClass: "deterministic",
  }]), {
    state: "hold", provider: "unknown", costClass: "unknown", billingClass: "unknown",
    reason: "route-unavailable", lastVerifiedAt: null,
  });
});
