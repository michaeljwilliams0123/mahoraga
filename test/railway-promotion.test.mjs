import test from "node:test";
import assert from "node:assert/strict";
import { PROMOTION } from "../scripts/railway-exact-sha-promotion.mjs";

test("Railway promotion target is fixed to canonical production", () => {
  assert.equal(PROMOTION.repository, "michaeljwilliams0123/mahoraga");
  assert.equal(PROMOTION.ref, "refs/heads/main");
  assert.equal(PROMOTION.projectId, "e644391a-9698-4026-b5e1-a28e07cfaf82");
  assert.equal(PROMOTION.environmentId, "fb266d3a-7214-47d5-a1a4-d615df3f1e6c");
  assert.equal(PROMOTION.serviceId, "0498b161-a6b7-4750-8c54-8c99e0167fa7");
  assert.equal(PROMOTION.origin, "https://mahoraga-runtime-main-production.up.railway.app");
  assert.equal(PROMOTION.expectedShaVariable, "MAHORAGA_EXPECTED_GIT_SHA");
  assert.deepEqual(PROMOTION.requiredChecks, ["Verify (ubuntu-latest)", "Verify (windows-latest)"]);
  assert.equal(Object.isFrozen(PROMOTION), true);
  assert.equal(Object.isFrozen(PROMOTION.requiredChecks), true);
});
