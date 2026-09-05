import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createLoopbackGenerateInvoke, loopbackGenerateUrls } from "../src/local-reasoner-loopback-invoke.mjs";
import { listTransientResults } from "../src/local-reasoner-channel.mjs";
import { runUnattendedCreditFreeCycle } from "../src/unattended-credit-free-cycle.mjs";

const DIGEST = "ab".repeat(32);
const NOW = new Date("2026-09-05T14:00:00.000Z");

test("loopback invoke holds when the probe is not verified", async () => {
  const invoke = createLoopbackGenerateInvoke({ probe: { verified: false } });
  const held = await invoke({ worldDigest: DIGEST });
  assert.equal(held.status, "hold");
  assert.equal(held.reason, "local-reasoner-not-ready");
  assert.equal(held.creditCost, 0);
  assert.equal(held.paidFallback, false);
});

test("loopback invoke refuses cloud-tagged probes without a paid fallback", async () => {
  const invoke = createLoopbackGenerateInvoke({ probe: { verified: true, cloudTagged: true } });
  const refused = await invoke({ worldDigest: DIGEST });
  assert.equal(refused.status, "refused");
  assert.equal(refused.reason, "ollama-cloud-not-credit-free");
  assert.equal(JSON.stringify(refused).includes("prompt"), false);
});

test("loopback invoke hashes discarded body and never returns content keys", async () => {
  const urls = loopbackGenerateUrls();
  const body = new TextEncoder().encode("ephemeral-bytes-never-persisted");
  const invoke = createLoopbackGenerateInvoke({
    probe: {
      verified: true,
      providerHealth: { ollama: { availability: "healthy", modelCount: 1 }, lmStudio: { availability: "unavailable", modelCount: 0 } },
    },
    fetchImpl: async (url, init = {}) => {
      assert.match(String(url), /^http:\/\/127\.0\.0\.1/);
      if (String(url) === urls.ollamaTags) {
        return { ok: true, json: async () => ({ models: [{ name: "qwen2.5:7b" }] }) };
      }
      assert.equal(String(url), urls.ollamaGenerate);
      assert.equal(init.method, "POST");
      const payload = JSON.parse(init.body);
      assert.equal(payload.prompt.startsWith("method:credit-free-protocol digest:"), true);
      assert.equal(payload.stream, false);
      return { ok: true, arrayBuffer: async () => body };
    },
  });
  const produced = await invoke({ worldDigest: DIGEST });
  assert.equal(produced.status, "ok");
  assert.equal(produced.reason, "loopback-generate-verified");
  assert.equal(produced.resultSha256, crypto.createHash("sha256").update(body).digest("hex"));
  assert.equal("prompt" in produced, false);
  assert.equal("response" in produced, false);
  assert.equal("content" in produced, false);
  assert.equal("messages" in produced, false);
  assert.equal(JSON.stringify(produced).includes("qwen"), false);
  assert.equal(JSON.stringify(produced).includes("ephemeral"), false);
});

test("cloud-named catalog models refuse instead of becoming a recovery path", async () => {
  const invoke = createLoopbackGenerateInvoke({
    probe: { verified: true, providerHealth: { ollama: { availability: "healthy", modelCount: 1 } } },
    fetchImpl: async () => ({ ok: true, json: async () => ({ models: [{ name: "llama3-cloud" }] }) }),
  });
  const refused = await invoke({ worldDigest: DIGEST });
  assert.equal(refused.status, "refused");
  assert.equal(refused.reason, "ollama-cloud-not-credit-free");
});

test("unreachable loopback holds and still compounds the slow loop", async () => {
  const invoke = createLoopbackGenerateInvoke({
    probe: { verified: true, providerHealth: { ollama: { availability: "healthy", modelCount: 1 } } },
    fetchImpl: async () => {
      throw Object.assign(new Error("connection-unavailable"), { name: "TypeError" });
    },
  });
  const cycle = await Promise.resolve(runUnattendedCreditFreeCycle({
    now: NOW,
    requiresGeneration: true,
    localReasonerReady: true,
    probe: { verified: true, providerHealth: { ollama: { availability: "healthy", modelCount: 1 } } },
    invoke,
    message: "Update the Mahoraga interface",
  }));
  assert.equal(cycle.generation.status, "hold");
  assert.equal(cycle.generation.reason, "loopback-generate-unavailable");
  assert.ok(cycle.improvement.foundryPlanCount >= 1);
  assert.equal(cycle.creditCost, 0);
  assert.equal(cycle.paidFallback, false);
});

test("verified loopback invoke stores only status plus digest on the transient channel", async () => {
  const body = new TextEncoder().encode("ok");
  const invoke = createLoopbackGenerateInvoke({
    probe: { verified: true, providerHealth: { ollama: { availability: "healthy", modelCount: 1 } } },
    fetchImpl: async (url) => {
      if (String(url).includes("/api/tags")) {
        return { ok: true, json: async () => ({ models: [{ name: "phi3:mini" }] }) };
      }
      return { ok: true, arrayBuffer: async () => body };
    },
  });
  const cycle = await Promise.resolve(runUnattendedCreditFreeCycle({
    now: NOW,
    requiresGeneration: true,
    localReasonerReady: true,
    probe: { verified: true, providerHealth: { ollama: { availability: "healthy", modelCount: 1 } } },
    invoke,
    message: "Update the Mahoraga interface",
  }));
  assert.equal(cycle.generation.status, "ok");
  const stored = listTransientResults(cycle.heartbeat.resultChannel, NOW);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].status, "ok");
  assert.equal(stored[0].resultSha256, cycle.generation.resultSha256);
  assert.equal("prompt" in stored[0], false);
  assert.equal(JSON.stringify(cycle).includes("phi3"), false);
});
