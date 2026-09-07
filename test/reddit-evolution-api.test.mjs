import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { startRedditEvolutionApiServer } from "../src/reddit-evolution-api.mjs";
import { DEFAULT_REDDIT_EVOLUTION_USER } from "../src/reddit-evolution-intake.mjs";

const SECRET = "reddit-api-secret-for-mahoraga-tests-0001";
const NOW = Date.parse("2026-09-07T05:30:00.000Z");

function payload(overrides = {}) {
  return {
    eventId: "reddit-api-signal-1",
    redditUser: DEFAULT_REDDIT_EVOLUTION_USER,
    signalKind: "devvit-capability",
    capturedAt: "2026-09-07T05:29:00.000Z",
    title: "Devvit API signal",
    body: "A Devvit signal should become a receipt, not executable authority.",
    references: ["https://www.reddit.com/r/codex/s/74aRM1FUFD"],
    ...overrides,
  };
}

function signed(body, timestamp = String(NOW)) {
  return {
    "content-type": "application/json",
    "x-mahoraga-reddit-timestamp": timestamp,
    "x-mahoraga-reddit-signature": `sha256=${createHmac("sha256", SECRET).update(`${timestamp}.${body}`, "utf8").digest("hex")}`,
  };
}

test("reddit evolution API accepts signed signals as non-mutating receipts", async () => {
  const runtime = await startRedditEvolutionApiServer({ secret: SECRET, now: () => NOW });
  try {
    const baseUrl = `http://127.0.0.1:${runtime.address.port}`;
    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);

    const body = JSON.stringify(payload());
    const response = await fetch(`${baseUrl}/api/intake/reddit/evolution-signal`, { method: "POST", headers: signed(body), body });
    assert.equal(response.status, 202);
    const result = await response.json();
    assert.equal(result.signal.account, "u/No-Demand-4839");
    assert.equal(result.receipt.source, "reddit-devvit");
    assert.equal(result.plan.mutationAllowed, false);
    assert.equal(result.plan.vendedAuthority, false);
  } finally {
    await runtime.close();
  }
});

test("reddit evolution API rejects unsigned or incorrectly signed requests", async () => {
  const runtime = await startRedditEvolutionApiServer({ secret: SECRET, now: () => NOW });
  try {
    const baseUrl = `http://127.0.0.1:${runtime.address.port}`;
    const body = JSON.stringify(payload());
    const response = await fetch(`${baseUrl}/api/intake/reddit/evolution-signal`, { method: "POST", headers: { ...signed(body), "x-mahoraga-reddit-signature": `sha256=${"0".repeat(64)}` }, body });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, "reddit-signature-invalid");
  } finally {
    await runtime.close();
  }
});
