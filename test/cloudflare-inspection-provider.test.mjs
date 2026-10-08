import test from "node:test";
import assert from "node:assert/strict";
import { createCloudReadOnlyProvider } from "../deploy/cloudflare-inspection-provider/worker.ts";
import { createExecutionBroker } from "../deploy/cloudflare-execution-broker/worker.ts";
const SHA = "2f16b91e241952cc749e53fbe8398eb375729adb";
const NOW = Date.parse("2026-10-07T23:42:00.000Z");
const runtime = (sha = SHA, status = "ready") => ({
  async fetch() { return Response.json({ status, sha, durableState: "cloudflare-do-sqlite" }); },
});
const provider = (sha = SHA, env = {}) => createCloudReadOnlyProvider({
  MAHORAGA_EXECUTION_RUNTIME: runtime(sha), TARGET_SHA: SHA, ...env,
}, () => NOW);
const call = (p, path, method = "GET", body) => p.fetch(new Request("https://provider" + path, {
  method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
}));
test("read-only Cloudflare provider advertises one fresh scoped route only when exact-main ready", async () => {
  const p = provider();
  const response = await call(p, "/api/capabilities");
  assert.equal(response.status, 200);
  const att = await response.json();
  assert.equal(att.capabilities.length, 1);
  assert.equal(att.capabilities[0].capability, "cloud.inspect");
  assert.deepEqual(att.capabilities[0].authorityScopes, ["cloud:read"]);
  assert.equal(att.capabilities[0].permissionClass, "read");
  assert.equal(att.capabilities[0].zeroCreditEligible, true);
  assert.equal((await call(provider("a".repeat(40)), "/api/capabilities")).status, 503);
  assert.equal((await call(provider(SHA, { MAHORAGA_EXECUTION_RUNTIME: undefined }), "/api/capabilities")).status, 503);
});
test("broker executes real scoped cloud inspection and rejects write/execute escalation", async () => {
  const p = provider();
  const broker = createExecutionBroker({ CLOUD_PROVIDER: p }, () => NOW);
  const routes = await (await broker.fetch(new Request("https://broker/api/capabilities"))).json();
  assert.deepEqual(routes.routes.map(r => r.capability), ["cloud.inspect"]);
  const request = (capability = "cloud.inspect", requestedPermission = "read") => ({
    schemaVersion: 1, taskId: "inspect-cloud", chainId: "chain-inspect",
    requiredCapability: capability, requestedPermission, dataClass: "enterprise",
    authorityScopes: ["cloud:read"], costPreference: "zero-credit-first",
    maxHops: 1, constraints: { requireZeroCredit: true }, evidenceRefs: [],
  });
  const exec = async requestBody => await (await broker.fetch(new Request("https://broker/api/execute", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ request: requestBody, payload: {} }),
  }))).json();
  const result = await exec(request());
  assert.equal(result.status, "complete");
  assert.equal(result.receipts.at(-1).providerReceipt.runtimeSha, SHA);
  assert.equal(result.receipts.at(-1).providerReceipt.mutated, false);
  assert.equal((await exec(request("cloud.execute", "execute"))).error, "no-eligible-route");
  assert.equal((await exec(request("cloud.inspect", "write"))).error, "no-eligible-route");
  assert.equal((await call(p, "/api/execute", "POST", { lease: { kind: "universal-route-lease", permissionClass: "execute" } })).status, 403);
});
