import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runtimeWorkerUrl = new URL("../deploy/cloudflare-execution-runtime/worker.ts", import.meta.url);
const runtimeWranglerUrl = new URL("../deploy/cloudflare-execution-runtime/wrangler.jsonc", import.meta.url);
const providerWranglerUrl = new URL("../deploy/cloudflare-zero-credit-inference/wrangler.jsonc", import.meta.url);

test("Cloudflare execution runtime cannot synthesize SUCCESS or call paid-account Workers AI", async () => {
  const source = await readFile(runtimeWorkerUrl, "utf8");
  assert.doesNotMatch(source, /executed:\s*true,[\s\S]{0,200}data:\s*payload/, "transport-only payload echo is not cognition");
  assert.doesNotMatch(source, /env\.AI\.run|this\.env\.AI\.run|invokeWorkersAi/, "paid execution runtime must not own a Workers AI binding");
  assert.match(source, /invokeZeroCreditProvider\(this\.providerConfig\(\)/, "assistant execution must invoke the isolated hard-zero provider");
  assert.match(source, /getProviderState\(ASSISTANT_PROVIDER_ID\)/, "provider admission must be checked from durable evidence before inference");
  assert.match(source, /encryptConversationContent/, "prompt and answer content must be vaulted rather than persisted in plaintext receipts");
});

test("Workers AI is bound only to isolated Free-account inference and SUCCESS follows provider execution", async () => {
  const [source, runtimeWrangler, providerWrangler] = await Promise.all([
    readFile(runtimeWorkerUrl, "utf8"),
    readFile(runtimeWranglerUrl, "utf8"),
    readFile(providerWranglerUrl, "utf8"),
  ]);
  assert.doesNotMatch(runtimeWrangler, /"ai"\s*:/, "paid execution runtime must not bind Workers AI");
  assert.match(providerWrangler, /"ai"\s*:\s*\{\s*"binding"\s*:\s*"AI"/, "isolated provider must bind Workers AI explicitly");
  const providerCall = source.indexOf("invokeZeroCreditProvider(this.providerConfig()");
  const success = source.indexOf('status: "SUCCESS"', providerCall);
  assert.ok(providerCall >= 0 && success > providerCall, "durable SUCCESS must follow isolated provider invocation");
});
