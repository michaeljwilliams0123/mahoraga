import assert from "node:assert/strict";
import test from "node:test";
import { admissionRenewalDue, createAdmissionRenewer, LAZY_RENEWAL_THRESHOLD_MS, FAILURE_COOLDOWN_MS } from "../deploy/cloudflare-owner-gateway/admission-renewal.ts";
import { capabilityEventStream } from "../deploy/cloudflare-owner-gateway/capability-events.ts";
import worker from "../deploy/cloudflare-owner-gateway/worker.mjs";

const NOW = 1_800_000_000_000;
const attestation = (canaryExpiresAt, overrides = {}) => ({
  status: "ready",
  provider: { providerId: "cloudflare-workers-ai", admitted: true, zeroCreditEligible: true, verifiedAt: NOW - 1000, canaryExpiresAt, ...overrides },
});

function harness({ expiresIn, refreshStatus = 200, secrets = true } = {}) {
  const calls = [];
  const logs = [];
  let expiry = NOW + expiresIn;
  let clock = NOW;
  const binding = {
    async fetch(request) {
      const url = new URL(request.url);
      calls.push({ path: url.pathname, method: request.method, token: request.headers.get("x-provider-refresh-token") });
      if (url.pathname === "/api/runtime/attestation") return Response.json(attestation(expiry), { status: 200 });
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (refreshStatus !== 200) return Response.json({ zeroCreditEligible: false, reasonCode: "provider-authentication-failed" }, { status: refreshStatus });
      expiry = NOW + 90 * 60_000;
      return Response.json({ zeroCreditEligible: true, canaryExpiresAt: expiry, verifiedAt: NOW });
    },
  };
  const fetchImpl = async (url) => Response.json(String(url).endsWith("/subscriptions") ? { success: true, result: [] } : { success: true, result: { default_usage_model: "standard" } });
  const env = {
    MAHORAGA_EXECUTION_RUNTIME: binding,
    ...(secrets ? { PROVIDER_REFRESH_SECRET: "refresh-secret-value", CLOUDFLARE_ACCOUNT_ID: "a".repeat(32), CLOUDFLARE_API_TOKEN: "api-token-value" } : {}),
  };
  const renewer = createAdmissionRenewer({ now: () => clock, fetchImpl, log: (record) => logs.push(record), random: () => 0 });
  return { calls, logs, env, renewer, advance: (ms) => { clock += ms; }, refreshCalls: () => calls.filter((call) => call.path === "/api/provider/refresh") };
}

test("renewal threshold requires an admitted, zero-credit, unexpired canary beyond the margin", () => {
  assert.equal(admissionRenewalDue(attestation(NOW + 10 * 60_000), NOW, LAZY_RENEWAL_THRESHOLD_MS), false);
  assert.equal(admissionRenewalDue(attestation(NOW + 4 * 60_000), NOW, LAZY_RENEWAL_THRESHOLD_MS), true);
  assert.equal(admissionRenewalDue(attestation(NOW + 10 * 60_000, { admitted: false }), NOW, LAZY_RENEWAL_THRESHOLD_MS), true);
  assert.equal(admissionRenewalDue(attestation(NOW + 10 * 60_000, { providerId: "other" }), NOW, LAZY_RENEWAL_THRESHOLD_MS), true);
  assert.equal(admissionRenewalDue(attestation(null), NOW, LAZY_RENEWAL_THRESHOLD_MS), true);
  assert.equal(admissionRenewalDue(null, NOW, LAZY_RENEWAL_THRESHOLD_MS), true);
});

test("fresh admission is skipped without any refresh call", async () => {
  const h = harness({ expiresIn: 60 * 60_000 });
  assert.equal((await h.renewer.renewIfDue(h.env, "lazy")).status, "skipped");
  assert.equal(h.refreshCalls().length, 0);
  assert.equal((await h.renewer.renewIfDue(h.env, "lazy")).status, "skipped");
  assert.equal(h.calls.length, 1, "known-fresh expiry is cached");
});

test("near-expiry lazy renewal is single-flight across concurrent requests and authenticated by the internal secret", async () => {
  const h = harness({ expiresIn: 2 * 60_000 });
  const outcomes = await Promise.all(Array.from({ length: 8 }, () => h.renewer.renewIfDue(h.env, "lazy")));
  assert.ok(outcomes.every((outcome) => outcome.status === "renewed"));
  assert.equal(h.refreshCalls().length, 1);
  assert.equal(h.refreshCalls()[0].token, "refresh-secret-value");
  assert.equal(h.renewer.metrics().coalesced, 7);
  assert.equal(h.renewer.metrics().triggered.lazy, 1);
  assert.equal((await h.renewer.renewIfDue(h.env, "lazy")).status, "skipped");
  assert.equal(h.refreshCalls().length, 1);
  const serialized = JSON.stringify(h.logs);
  assert.match(serialized, /admission-renewal-triggered/);
  assert.match(serialized, /admission-renewal-succeeded/);
  assert.doesNotMatch(serialized, /refresh-secret-value|api-token-value/);
});

test("failed renewal is held in a bounded cooldown and logged without secrets", async () => {
  const h = harness({ expiresIn: 60_000, refreshStatus: 503 });
  const first = await h.renewer.renewIfDue(h.env, "scheduled");
  assert.deepEqual(first, { status: "failed", reason: "provider-authentication-failed" });
  assert.equal((await h.renewer.renewIfDue(h.env, "lazy")).status, "cooldown");
  assert.equal(h.refreshCalls().length, 1);
  h.advance(FAILURE_COOLDOWN_MS * 2 + 1);
  assert.equal((await h.renewer.renewIfDue(h.env, "scheduled")).status, "failed");
  assert.equal(h.refreshCalls().length, 2);
  assert.equal(h.renewer.metrics().failed, 2);
  assert.doesNotMatch(JSON.stringify(h.logs), /refresh-secret-value|api-token-value/);
});

test("missing renewal credentials or runtime binding never attempts a refresh", async () => {
  const h = harness({ expiresIn: 60_000, secrets: false });
  assert.equal((await h.renewer.renewIfDue(h.env, "scheduled")).status, "unconfigured");
  assert.equal(h.refreshCalls().length, 0);
  assert.equal((await h.renewer.renewIfDue({}, "scheduled")).status, "unconfigured");
  assert.equal((await h.renewer.renewIfDue(undefined, "lazy")).status, "unconfigured");
});

test("the gateway worker exposes a scheduled handler that renews in the background", async () => {
  assert.equal(typeof worker.scheduled, "function");
  const pending = [];
  await worker.scheduled({ cron: "* * * * *" }, {}, { waitUntil: (promise) => pending.push(promise) });
  assert.equal(pending.length, 1);
  assert.equal((await pending[0]).status, "unconfigured");
});

test("capability event stream emits snapshot, change, heartbeat, and a bounded reconnect", async () => {
  let clock = NOW; let n = 0;
  const snapshots = [[{ capability: "assistant.respond", routable: false }], [{ capability: "assistant.respond", routable: false }], [{ capability: "assistant.respond", routable: true }]];
  const stream = capabilityEventStream({
    load: async () => ({ capabilities: snapshots[Math.min(n++, 2)] }),
    now: () => clock, sleep: async (ms) => { clock += ms; }, tickMs: 10_000, maxLifetimeMs: 30_000, log: () => {},
  });
  const text = await new Response(stream).text();
  const events = [...text.matchAll(/event: (\w+)/g)].map((match) => match[1]);
  assert.deepEqual(events, ["capabilities", "heartbeat", "capabilities", "heartbeat", "reconnect"]);
  assert.match(text, /^retry: \d+/);
});

test("capability event stream stops when the client aborts and logs the disconnect", async () => {
  const controller = new AbortController(); const logs = [];
  const stream = capabilityEventStream({ load: async () => ({ capabilities: [] }), signal: controller.signal, tickMs: 60_000, log: (record) => logs.push(record.event) });
  const reader = stream.getReader();
  await reader.read(); await reader.read();
  controller.abort();
  assert.equal((await reader.read()).done, true);
  assert.deepEqual(logs, ["sse-connect", "sse-disconnect"]);
});

test("gateway cron trigger runs every minute and the required sovereign cycle workflow is untouched", async () => {
  const { readFile } = await import("node:fs/promises");
  const [wrangler, sovereign, renewal] = await Promise.all([
    readFile(new URL("../deploy/cloudflare-owner-gateway/wrangler.toml", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/sovereign-eight-hour-cycle.yml", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/cloudflare-provider-renewal.yml", import.meta.url), "utf8"),
  ]);
  assert.match(wrangler, /\[triggers\]\s*\ncrons = \["\* \* \* \* \*"\]/);
  assert.match(wrangler, /binding = "MAHORAGA_EXECUTION_RUNTIME"/);
  assert.match(sovereign, /schedule:/);
  assert.doesNotMatch(renewal, /schedule:/);
});
