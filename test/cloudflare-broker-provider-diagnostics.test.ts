import test from "node:test";
import assert from "node:assert/strict";
import { createExecutionBroker, type BrokerEnv } from "../deploy/cloudflare-execution-broker/worker.ts";

const NOW = Date.parse("2026-10-10T18:00:00Z");
const capability = () => ({
  schemaVersion: 1, kind: "universal-worker-attestation",
  workerId: "cloudflare-readonly-inspector", provider: "cloudflare", locality: "cloudflare",
  observedAt: new Date(NOW - 1_000).toISOString(), expiresAt: new Date(NOW + 30_000).toISOString(),
  capabilities: [{
    capability: "cloud.inspect", permissionClass: "read", healthy: true, zeroCreditEligible: true,
    costClass: "deterministic", dataClassesAllowed: ["synthetic", "personal", "enterprise"],
    authorityScopes: ["cloud:read"],
  }],
});
const inspect = async (env: BrokerEnv) => {
  const response = await createExecutionBroker(env, () => NOW).fetch(new Request("https://private-broker/api/capabilities"));
  assert.equal(response.status, 200);
  return response.json();
};
const bound = (reply: unknown) => ({ fetch: async () => Response.json(reply) });

test("unbound broker reports no providers without implying any routable capability", async () => {
  const reply = await inspect({});
  assert.deepEqual(reply.routes, []);
  assert.deepEqual(reply.providerReadiness, {
    state: "unbound", reasonCode: "no-provider-service-bindings",
    boundProviders: [], acceptedAttestations: 0, routableCapabilities: 0,
  });
});

test("bound provider without independent proof reports unavailable instead of silently appearing healthy", async () => {
  const reply = await inspect({ CLOUD_PROVIDER: bound({ attestations: [] }) });
  assert.deepEqual(reply.routes, []);
  assert.deepEqual(reply.providerReadiness, {
    state: "unverified", reasonCode: "provider-proof-unavailable",
    boundProviders: ["CLOUD_PROVIDER"], acceptedAttestations: 0, routableCapabilities: 0,
  });
});

test("accepted but unhealthy provider cannot be shown as admitted", async () => {
  const attestation = capability();
  attestation.capabilities[0]!.healthy = false;
  const reply = await inspect({ CLOUD_PROVIDER: bound({ attestations: [attestation] }) });
  assert.deepEqual(reply.routes, []);
  assert.deepEqual(reply.providerReadiness, {
    state: "unavailable", reasonCode: "provider-capability-unhealthy",
    boundProviders: ["CLOUD_PROVIDER"], acceptedAttestations: 1, routableCapabilities: 0,
  });
});

test("legacy compatibility broker alone is not an executable provider binding", async () => {
  const reply = await inspect({ CONNECTOR_CAPABILITY_BROKER: bound({
    schemaVersion: 1, kind: "connector-capability-attestation",
    observedAt: new Date(NOW - 1_000).toISOString(), expiresAt: new Date(NOW + 30_000).toISOString(),
    grants: [{ capability: "cloud.inspect", provider: "cloudflare", permissionClass: "read",
      zeroCreditEligible: true, healthy: true }],
  }) });
  assert.deepEqual(reply.routes, []);
  assert.deepEqual(reply.providerReadiness, {
    state: "unbound", reasonCode: "no-provider-service-bindings",
    boundProviders: [], acceptedAttestations: 0, routableCapabilities: 0,
  });
});

test("duplicate worker attestations cannot imply an eligible executable route", async () => {
  const reply = await inspect({ CLOUD_PROVIDER: bound({ attestations: [capability(), capability()] }) });
  assert.deepEqual(reply.routes, []);
  assert.deepEqual(reply.providerReadiness, {
    state: "unavailable", reasonCode: "provider-identity-ambiguous",
    boundProviders: ["CLOUD_PROVIDER"], acceptedAttestations: 2, routableCapabilities: 0,
  });
});

test("adapted legacy attestations exceeding universal freshness limit are not counted", async () => {
  const reply = await inspect({
    CLOUD_PROVIDER: bound({ attestations: [] }),
    CONNECTOR_CAPABILITY_BROKER: bound({
      schemaVersion: 1, kind: "connector-capability-attestation",
      observedAt: new Date(NOW - 1_000).toISOString(),
      expiresAt: new Date(NOW + 10 * 60_000).toISOString(),
      grants: [{ capability: "cloud.inspect", provider: "cloudflare", permissionClass: "read",
        zeroCreditEligible: true, healthy: true }],
    }),
  });
  assert.deepEqual(reply.routes, []);
  assert.deepEqual(reply.providerReadiness, {
    state: "unverified", reasonCode: "provider-proof-unavailable",
    boundProviders: ["CLOUD_PROVIDER"], acceptedAttestations: 0, routableCapabilities: 0,
  });
});

test("accepted read-only provider proof reports one eligible live route and no authority escalation", async () => {
  const reply = await inspect({ CLOUD_PROVIDER: bound({ attestations: [capability()] }) });
  assert.deepEqual(reply.routes.map((x: { capability: string; permissionClass: string }) => [x.capability, x.permissionClass]), [["cloud.inspect", "read"]]);
  assert.deepEqual(reply.providerReadiness, {
    state: "admitted", reasonCode: null,
    boundProviders: ["CLOUD_PROVIDER"], acceptedAttestations: 1, routableCapabilities: 1,
  });
});
