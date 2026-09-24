import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("execution runtime cannot invoke Workers AI directly or self-renew billing proof", async () => {
  const [worker, config, bindings] = await Promise.all([
    read("deploy/cloudflare-execution-runtime/worker.ts"),
    read("deploy/cloudflare-execution-runtime/wrangler.jsonc"),
    read("deploy/cloudflare-execution-runtime/bindings.d.ts"),
  ]);
  assert.doesNotMatch(config, /\"ai\"\s*:/);
  assert.doesNotMatch(bindings, /\bAI\s*:/);
  assert.doesNotMatch(worker, /env\.AI|invokeWorkersAi/);
  assert.match(worker, /invokeZeroCreditProvider/);
  assert.match(worker, /\/api\/provider\/refresh/);
  assert.doesNotMatch(config, /\"crons\"\s*:/);
  assert.doesNotMatch(worker, /async scheduled\(/);
  assert.doesNotMatch(worker, /ZERO_CREDIT_BILLING_ATTESTATION/);
});

test("isolated Workers AI binding is bounded below Cloudflare's daily free allocation", async () => {
  const [providerWorker, providerConfig] = await Promise.all([
    read("deploy/cloudflare-zero-credit-inference/worker.ts"),
    read("deploy/cloudflare-zero-credit-inference/wrangler.jsonc"),
  ]);
  assert.match(providerConfig, /\"name\"\s*:\s*\"mahoraga-zero-credit-inference\"/);
  assert.match(providerConfig, /\"ai\"\s*:\s*\{\s*\"binding\"\s*:\s*\"AI\"/);
  assert.match(providerConfig, /\"BUDGET_DO\"/);
  assert.match(providerConfig, /\"new_sqlite_classes\"\s*:\s*\[\"ZeroCreditBudgetDO\"\]/);
  assert.match(providerWorker, /FREE_ALLOCATION_NEURONS = 10_000/);
  assert.match(providerWorker, /DAILY_BUDGET_NEURONS = 9_000/);
  assert.match(providerWorker, /INFER_RESERVATION_NEURONS = 128/);
  assert.match(providerWorker, /MAX_INPUT_BYTES = 8_000/);
  assert.match(providerWorker, /MAX_OUTPUT_TOKENS = 256/);
  assert.match(providerWorker, /storage\.transaction/);
  assert.match(providerWorker, /reserveBudget\(env, INFER_RESERVATION_NEURONS\)/);
  assert.match(providerWorker, /max_tokens: MAX_OUTPUT_TOKENS/);
  assert.match(providerWorker, /billingBoundary: BILLING_BOUNDARY/);
  assert.doesNotMatch(providerWorker, /standalone-free/);
  assert.doesNotMatch(providerWorker, /Railway|railway|licensed-approved|metered-cloud/);
});

test("GLM attestation canary accepts current chat-completion output and disables thinking", async () => {
  const providerWorker = await read("deploy/cloudflare-zero-credit-inference/worker.ts");
  assert.match(providerWorker, /record\?\.choices/);
  assert.match(providerWorker, /message\?\.content/);
  assert.match(providerWorker, /chat_template_kwargs:\s*\{\s*enable_thinking:\s*false\s*\}/);
  assert.match(providerWorker, /max_completion_tokens:\s*PROBE_MAX_OUTPUT_TOKENS/);
  assert.doesNotMatch(providerWorker, /reasoning_effort:\s*null/);
});
