import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  DEFAULT_REDDIT_EVOLUTION_USER,
  createRedditEvolutionReceipt,
  normalizeRedditEvolutionSignal,
  normalizeRedditReference,
  planRedditEvolutionInput,
  verifyRedditEvolutionRequest,
} from "../src/reddit-evolution-intake.mjs";

const SECRET = "reddit-ingress-secret-for-mahoraga-tests-0001";
const NOW = Date.parse("2026-09-07T05:30:00.000Z");

function signed(body, timestamp = String(NOW)) {
  const signature = `sha256=${createHmac("sha256", SECRET).update(`${timestamp}.${body}`, "utf8").digest("hex")}`;
  return { "x-mahoraga-reddit-timestamp": timestamp, "x-mahoraga-reddit-signature": signature };
}

function payload(overrides = {}) {
  return {
    eventId: "devvit-signal-1",
    redditUser: DEFAULT_REDDIT_EVOLUTION_USER,
    signalKind: "codex-pattern",
    capturedAt: "2026-09-07T05:29:00.000Z",
    title: "Codex community signal",
    body: "A Reddit post describes a useful deterministic coding-agent pattern.",
    tags: ["codex", "agent-signal"],
    score: 7,
    commentCount: 3,
    upvoteRatio: 0.91,
    references: [
      "https://www.reddit.com/u/No-Demand-4839",
      "https://www.reddit.com/r/codex/s/74aRM1FUFD",
    ],
    ...overrides,
  };
}

test("reddit evolution intake verifies HMAC and returns a non-mutating plan", () => {
  const body = JSON.stringify(payload());
  const result = verifyRedditEvolutionRequest({ body, headers: signed(body), secret: SECRET, now: NOW });

  assert.equal(result.signal.account, "u/No-Demand-4839");
  assert.equal(result.signal.signalKind, "codex-pattern");
  assert.equal(result.signal.automation.executableInstruction, false);
  assert.equal(result.receipt.source, "reddit-devvit");
  assert.match(result.receipt.textSha256, /^[a-f0-9]{64}$/);
  assert.equal(result.plan.mutationAllowed, false);
  assert.equal(result.plan.codexReviewAllowed, false);
  assert.ok(result.plan.recommendedTasks.every((task) => task.mutation === false));
});

test("reddit evolution intake rejects account mismatch, bad signatures, and stale timestamps", () => {
  const body = JSON.stringify(payload());
  assert.throws(() => verifyRedditEvolutionRequest({ body, headers: signed(body), secret: "short", now: NOW }), /reddit-ingress-secret-invalid/);
  assert.throws(() => verifyRedditEvolutionRequest({ body, headers: signed(body).toString, secret: SECRET, now: NOW }), /reddit-timestamp-invalid/);
  assert.throws(() => verifyRedditEvolutionRequest({ body, headers: signed(body, String(NOW - 10 * 60 * 1000)), secret: SECRET, now: NOW }), /reddit-timestamp-out-of-window/);
  assert.throws(() => verifyRedditEvolutionRequest({ body: JSON.stringify(payload({ redditUser: "someone-else" })), headers: signed(JSON.stringify(payload({ redditUser: "someone-else" }))), secret: SECRET, now: NOW }), /reddit-account-mismatch/);
});

test("reddit reference normalization allows only Reddit HTTPS profile, subreddit, post, and share paths", () => {
  assert.deepEqual(normalizeRedditReference("https://reddit.com/r/codex/s/74aRM1FUFD").type, "share-link");
  assert.deepEqual(normalizeRedditReference("https://www.reddit.com/u/No-Demand-4839").type, "profile");
  assert.throws(() => normalizeRedditReference("http://www.reddit.com/r/codex"), /reddit-reference-invalid/);
  assert.throws(() => normalizeRedditReference("https://evil.example/r/codex"), /reddit-reference-invalid/);
  assert.throws(() => normalizeRedditReference("https://www.reddit.com/api/v1/access_token"), /reddit-reference-path-invalid/);
});

test("reddit signal receipts hash content and do not vend execution authority", () => {
  const signal = normalizeRedditEvolutionSignal(payload({ signalKind: "devvit-capability" }));
  const receipt = createRedditEvolutionReceipt(signal, { timestamp: String(NOW) });
  const plan = planRedditEvolutionInput(signal);

  assert.equal(Object.hasOwn(receipt, "body"), false);
  assert.equal(Object.hasOwn(receipt, "title"), false);
  assert.equal(plan.vendedAuthority, false);
  assert.equal(plan.objectiveSeed.evidence.referenceCount, 2);
});
