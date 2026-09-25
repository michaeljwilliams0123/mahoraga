import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("provider admission reports operational failure classes instead of a single opaque probe error", async () => {
  const source = await read("deploy/cloudflare-execution-runtime/provider-admission.ts");
  for (const reason of [
    "provider-authentication-failed",
    "provider-target-mismatch",
    "provider-model-response-invalid",
    "provider-model-unavailable",
    "provider-endpoint-unreachable",
  ]) assert.match(source, new RegExp(reason));
  assert.match(source, /probeResponse/);
  assert.match(source, /billing/);
  assert.match(source, /authentication/);
  assert.match(source, /routing/);
  assert.match(source, /dns/);
  assert.match(source, /modelAvailability/);
  assert.match(source, /gateway/);
  assert.match(source, /policy/);
});

test("runtime exposes one fail-closed operational attestation truth surface", async () => {
  const worker = await read("deploy/cloudflare-execution-runtime/worker.ts");
  assert.match(worker, /\/api\/runtime\/attestation/);
  assert.match(worker, /kind:\s*"mahoraga-runtime-attestation"/);
  assert.match(worker, /commit:\s*this\.env\.TARGET_SHA/);
  assert.match(worker, /durableState:\s*DURABLE_STATE/);
  assert.match(worker, /executionAuthority:\s*"cloudflare"/);
  assert.match(worker, /railwayObserved:\s*false/);
  assert.match(worker, /fallbackObserved:\s*false/);
  assert.match(worker, /ready:/);
});

test("exact-main workflow waits for live runtime convergence before provider admission refresh", async () => {
  const workflow = await read(".github/workflows/cloudflare-execution-runtime.yml");
  const deploy = workflow.indexOf("Deploy exact verified execution runtime");
  const convergence = workflow.indexOf("Wait for exact runtime convergence");
  const refresh = workflow.indexOf("Refresh hard-zero provider admission");
  assert.ok(deploy >= 0 && convergence > deploy && refresh > convergence);
  assert.match(workflow, /\/api\/live/);
  assert.match(workflow, /VERIFIED_SHA/);
});

test("canonical acceptance emits one cutover packet with uniqueness continuity and Cloudflare-only route proof", async () => {
  const acceptance = await read("scripts/cloudflare-production-acceptance.ts");
  for (const section of ["Commit", "Provider", "Deployment", "Execution", "Receipt", "Continuity", "Route"]) {
    assert.match(acceptance, new RegExp(`${section}:`));
  }
  assert.match(acceptance, /submissions:/);
  assert.match(acceptance, /logicalRequests:\s*1/);
  assert.match(acceptance, /committedExecutions:\s*1/);
  assert.match(acceptance, /railwayObserved:\s*false/);
  assert.match(acceptance, /fallbackObserved:\s*false/);
  assert.match(acceptance, /executionAuthority:\s*"cloudflare"/);
  assert.match(acceptance, /idempotent:\s*true/);
});
