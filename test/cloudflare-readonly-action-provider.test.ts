import test from "node:test";
import assert from "node:assert/strict";
import { createReadonlyCloudflareProvider } from "../deploy/cloudflare-readonly-provider/worker.ts";
import { createExecutionBroker } from "../deploy/cloudflare-execution-broker/worker.ts";

const NOW = Date.parse("2026-10-08T12:00:00Z");
const env = { CLOUDFLARE_ACCOUNT_ID: "a".repeat(32), CLOUDFLARE_AUDIT_TOKEN: "secure-test-".repeat(5) };
const SCRIPT = "mahoraga-owner-gateway";
const version = "12345678-1234-1234-1234-123456789abc";
const deployment = "43215678-1234-1234-1234-123456789abc";
const deployedAt = "2026-10-08T11:45:00.000Z";
const evidence = { success: true, result: { deployments: [
  { id: deployment, created_on: deployedAt, versions: [{ version_id: version, percentage: 100 }] },
] } };
const deploymentResponse = () => Response.json(evidence);
const fakeApi = (input: RequestInfo | URL, init?: RequestInit) => {
  assert.equal(String(input), `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${SCRIPT}/deployments`);
  assert.equal(init?.method, "GET");
  assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${env.CLOUDFLARE_AUDIT_TOKEN}`);
  return Promise.resolve(deploymentResponse());
};
const lease = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1, kind: "universal-route-lease",
  routeLeaseId: "lease-0123456789abcdef", selectionReceiptId: "sel-0123456789abcdef",
  taskId: "task-read", chainId: "chain-read", workerId: "cloudflare-readonly-inspector",
  provider: "cloudflare", capability: "cloud.inspect", permissionClass: "read",
  authorityScopes: ["cloud:read"], expiresAt: new Date(NOW + 25_000).toISOString(), ...overrides,
});
const run = (provider: ReturnType<typeof createReadonlyCloudflareProvider>, value: unknown) => provider.fetch(new Request("https://private-provider/api/execute", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value),
}));
const payload = { lease: lease(), payload: { script: SCRIPT }, evidenceRefs: [] };

test("missing read-only account credential is never advertised as a routable action worker", async () => {
  let called = false;
  const provider = createReadonlyCloudflareProvider({}, { now: () => NOW, fetchImpl: async () => {
    called = true; return deploymentResponse();
  } });
  const response = await provider.fetch(new Request("https://private-provider/api/capabilities"));
  assert.deepEqual(await response.json(), { attestations: [] });
  assert.equal(called, false);
  assert.equal((await run(provider, payload)).status, 503);
});

test("fresh independent account API observation advertises only cloud.inspect read capability", async () => {
  const provider = createReadonlyCloudflareProvider(env, { now: () => NOW, fetchImpl: fakeApi });
  const response = await provider.fetch(new Request("https://private-provider/api/capabilities"));
  const body = await response.json() as { attestations: Array<Record<string, unknown>> };
  assert.equal(body.attestations.length, 1);
  const attestation = body.attestations[0]!;
  assert.equal(attestation.workerId, "cloudflare-readonly-inspector");
  assert.equal(attestation.provider, "cloudflare");
  assert.equal(attestation.expiresAt, new Date(NOW + 30_000).toISOString());
  const capabilities = attestation.capabilities as Array<Record<string, unknown>>;
  assert.deepEqual(capabilities.map(c => [c.capability, c.permissionClass, c.costClass]), [["cloud.inspect", "read", "deterministic"]]);
  assert.doesNotMatch(JSON.stringify(body), /secure-test|Bearer|CLOUDFLARE_AUDIT_TOKEN/);
});

test("invalid upstream permission, malformed proof or split deployment never advertises a route", async () => {
  for (const reply of [
    Response.json({ success: false, errors: [{ code: 10000, message: "secret" }] }, { status: 403 }),
    Response.json({ success: true, result: { deployments: [] } }),
    Response.json({ success: true, result: { deployments: [{ ...evidence.result.deployments[0], versions: [
      { version_id: version, percentage: 50 }, { version_id: "22345678-1234-1234-1234-123456789abc", percentage: 50 },
    ] }] } }),
  ]) {
    const provider = createReadonlyCloudflareProvider(env, { now: () => NOW, fetchImpl: async () => reply.clone() });
    const body = await (await provider.fetch(new Request("https://private-provider/api/capabilities"))).json();
    assert.deepEqual(body, { attestations: [] });
  }
});

test("read-only inspection emits bounded real deployment receipt and never leaks credentials", async () => {
  const provider = createReadonlyCloudflareProvider(env, { now: () => NOW, fetchImpl: fakeApi });
  const response = await run(provider, payload);
  assert.equal(response.status, 200);
  const body = await response.json() as { status: string; receipt: Record<string, unknown> };
  assert.equal(body.status, "complete");
  assert.deepEqual({
    deploymentId: body.receipt.deploymentId, versionId: body.receipt.versionId,
    trafficPercentage: body.receipt.trafficPercentage, readOnly: body.receipt.readOnly,
  }, { deploymentId: deployment, versionId: version, trafficPercentage: 100, readOnly: true });
  assert.doesNotMatch(JSON.stringify(body), /secure-test|Bearer|PRIVATE_KEY|CLOUDFLARE_AUDIT_TOKEN/);
});

test("deployment chronology is enforced before provider attestation and execution", async () => {
  const cases = [
    { label: "within five-second clock skew", createdOn: new Date(NOW + 5_000).toISOString(), allowed: true },
    { label: "beyond five-second clock skew", createdOn: new Date(NOW + 5_001).toISOString(), allowed: false },
    { label: "ten seconds in the future", createdOn: new Date(NOW + 10_000).toISOString(), allowed: false },
    { label: "malformed deployment time", createdOn: "not-a-date", allowed: false },
  ];
  for (const { label, createdOn, allowed } of cases) {
    const provider = createReadonlyCloudflareProvider(env, {
      now: () => NOW,
      fetchImpl: async () => Response.json({ success: true, result: { deployments: [
        { ...evidence.result.deployments[0], created_on: createdOn },
      ] } }),
    });
    const advertised = (await (await provider.fetch(new Request("https://private-provider/api/capabilities"))).json())
      as { attestations: Array<Record<string, unknown>> };
    assert.equal(advertised.attestations.length, allowed ? 1 : 0, label + " attestation");
    const execution = await run(provider, payload);
    assert.equal(execution.status, allowed ? 200 : 503, label + " execution");
    if (allowed) {
      const result = await execution.json() as { receipt: Record<string, unknown> };
      assert.equal(result.receipt.observedAt, new Date(NOW).toISOString());
      assert.equal(result.receipt.deployedAt, createdOn);
    }
  }
});

test("write, expired, future, wrong worker, widened scope, invalid target and extra fields fail closed", async () => {
  let calls = 0;
  const provider = createReadonlyCloudflareProvider(env, { now: () => NOW, fetchImpl: async () => {
    calls++; return deploymentResponse();
  } });
  const invalid = [
    { ...payload, lease: lease({ permissionClass: "write" }) },
    { ...payload, lease: lease({ expiresAt: new Date(NOW - 1).toISOString() }) },
    { ...payload, lease: lease({ expiresAt: new Date(NOW + 61_000).toISOString() }) },
    { ...payload, lease: lease({ workerId: "foreign" }) },
    { ...payload, lease: lease({ authorityScopes: ["cloud:*"] }) },
    { ...payload, lease: lease({ provider: "github" }) },
    { ...payload, lease: lease({ routeLeaseId: "faked" }) },
    { ...payload, payload: { script: "non-mahoraga-script" } },
    { ...payload, payload: { script: SCRIPT, endpoint: "DELETE /accounts" } },
    { ...payload, evidenceRefs: ["secret:access_token"] },
  ];
  for (const item of invalid) assert.ok([400, 403].includes((await run(provider, item)).status));
  assert.equal(calls, 0);
});

test("broker routes a real cloud.inspect read through service binding and returns execution receipts", async () => {
  const bound = createReadonlyCloudflareProvider(env, { now: () => NOW, fetchImpl: fakeApi });
  const broker = createExecutionBroker({ CLOUD_PROVIDER: bound }, () => NOW);
  const advertised = await (await broker.fetch(new Request("https://broker/api/capabilities"))).json() as { routes: Array<Record<string, unknown>> };
  assert.deepEqual(advertised.routes.map(x => x.capability), ["cloud.inspect"]);
  const execute = await broker.fetch(new Request("https://broker/api/execute", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ request: {
      schemaVersion: 1, taskId: "task-read", chainId: "chain-read",
      requiredCapability: "cloud.inspect", requestedPermission: "read", dataClass: "enterprise",
      authorityScopes: ["cloud:read"], costPreference: "zero-credit-first",
      constraints: { requireZeroCredit: true }, evidenceRefs: [], maxHops: 2,
    }, payload: { script: SCRIPT } }),
  }));
  assert.equal(execute.status, 200);
  const result = await execute.json() as { status: string; receipts: Array<Record<string, unknown>> };
  assert.equal(result.status, "complete");
  assert.equal(result.receipts.length, 2);
  assert.doesNotMatch(JSON.stringify(result), /secure-test|Bearer|PRIVATE_KEY/);
});
