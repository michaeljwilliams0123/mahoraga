import test from "node:test";
import assert from "node:assert/strict";
import { applyLocalReasonerGenerate, createLocalReasonerGenerate } from "../src/local-reasoner-generate.mjs";

const DIGEST = "a".repeat(64);

test("local generate holds when the reasoner is missing and never fabricates ok", () => {
  const generate = createLocalReasonerGenerate({ probe: { verified: false } });
  const held = generate({ worldDigest: DIGEST });
  assert.equal(held.status, "hold");
  assert.equal(held.reason, "local-reasoner-not-ready");
  assert.equal(held.resultSha256, DIGEST);
  assert.equal(held.creditCost, 0);
  assert.equal(held.paidFallback, false);
});

test("a live probe without an invoke callback holds instead of claiming generation", () => {
  const generate = createLocalReasonerGenerate({ probe: { verified: true } });
  const held = generate({ worldDigest: DIGEST });
  assert.equal(held.status, "hold");
  assert.equal(held.reason, "generation-invoke-required");
  assert.equal(JSON.stringify(held).includes("prompt"), false);
});

test("ollama cloud tags refuse instead of becoming a recovery path", () => {
  const generate = createLocalReasonerGenerate({ probe: { verified: true }, cloudTagged: true });
  const refused = generate({ worldDigest: DIGEST });
  assert.equal(refused.status, "refused");
  assert.equal(refused.reason, "ollama-cloud-not-credit-free");
  assert.equal(refused.paidFallback, false);
});

test("a real invoke may verify only after returning status plus digest with no content", () => {
  const generate = createLocalReasonerGenerate({
    probe: { verified: true },
    invoke: ({ worldDigest }) => ({ status: "ok", resultSha256: worldDigest }),
  });
  const verified = generate({ worldDigest: DIGEST });
  assert.equal(verified.status, "ok");
  assert.equal(verified.reason, "loopback-generate-verified");
  assert.throws(
    () => createLocalReasonerGenerate({
      probe: { verified: true },
      invoke: () => ({ status: "ok", resultSha256: DIGEST, prompt: "secret" }),
    })({ worldDigest: DIGEST }),
    /generation-content-forbidden/,
  );
});

test("applyLocalReasonerGenerate holds when no callback is supplied", () => {
  const held = applyLocalReasonerGenerate(null, { worldDigest: DIGEST });
  assert.equal(held.status, "hold");
  assert.equal(held.reason, "generation-callback-required");
});
