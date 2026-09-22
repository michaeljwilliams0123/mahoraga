import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workerUrl = new URL("../deploy/cloudflare-execution-runtime/worker.ts", import.meta.url);
const wranglerUrl = new URL("../deploy/cloudflare-execution-runtime/wrangler.jsonc", import.meta.url);

test("Cloudflare execution runtime cannot synthesize SUCCESS by echoing the request payload", async () => {
  const source = await readFile(workerUrl, "utf8");
  assert.doesNotMatch(source, /executed:\s*true,[\s\S]{0,200}data:\s*payload/, "transport-only payload echo is not cognition");
  assert.match(source, /env\.AI\.run|this\.env\.AI\.run/, "assistant execution must invoke a provider binding");
  assert.match(source, /getProviderState\(ASSISTANT_PROVIDER_ID\)/, "provider admission must be checked from durable evidence before inference");
  assert.match(source, /encryptConversationContent/, "prompt and answer content must be vaulted rather than persisted in plaintext receipts");
});

test("Workers AI is explicitly bound and success is persisted only after provider execution", async () => {
  const [source, wrangler] = await Promise.all([readFile(workerUrl, "utf8"), readFile(wranglerUrl, "utf8")]);
  assert.match(wrangler, /"ai"\s*:\s*\{\s*"binding"\s*:\s*"AI"/, "Wrangler must bind Workers AI explicitly");
  const providerCall = source.indexOf("this.env.AI.run");
  const successReceipt = source.indexOf('status: "SUCCESS"');
  assert.ok(providerCall >= 0 && successReceipt > providerCall, "SUCCESS must occur only after provider execution");
});
