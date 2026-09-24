import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("paid-account execution runtime cannot invoke Workers AI directly", async () => {
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
  assert.match(config, /\"0 \* \* \* \*\"/);
});

test("Workers AI binding exists only on the isolated hard-zero inference worker", async () => {
  const [providerWorker, providerConfig] = await Promise.all([
    read("deploy/cloudflare-zero-credit-inference/worker.ts"),
    read("deploy/cloudflare-zero-credit-inference/wrangler.jsonc"),
  ]);
  assert.match(providerConfig, /\"name\"\s*:\s*\"mahoraga-zero-credit-inference\"/);
  assert.match(providerConfig, /\"ai\"\s*:\s*\{\s*\"binding\"\s*:\s*\"AI\"/);
  assert.match(providerWorker, /accountClass: ACCOUNT_CLASS/);
  assert.match(providerWorker, /zeroDollarStopGuaranteed: true/);
  assert.match(providerWorker, /authorization/);
  assert.doesNotMatch(providerWorker, /Railway|railway|licensed-approved|metered-cloud/);
});
