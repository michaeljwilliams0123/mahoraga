import test from "node:test";
import assert from "node:assert/strict";
import { generateLocalStructuredOutput, generateLocalEmbeddings } from "../src/local-ai-inference.ts";
// @ts-expect-error Existing governed JavaScript contract.
import { openTransientResultChannel, listTransientResults } from "../src/local-reasoner-channel.mjs";
// @ts-expect-error Existing governed JavaScript contract.
import { DEFAULT_MODEL_SUPPLY_CHAIN, modelInspectionReceiptSha256 } from "../src/model-supply-chain.mjs";

const now = new Date("2026-10-01T12:00:00.000Z"), digest = "d".repeat(64);
const metadata = { scannerId: "test-scan", artifactSha256: "a".repeat(64), artifactSizeBytes: 42, trustRemoteCode: false, pickleDetected: false, executableCodeDetected: false, inspectedAt: "2026-10-01T11:00:00.000Z", expiresAt: "2026-10-02T11:00:00.000Z" };
const policy = { ...DEFAULT_MODEL_SUPPLY_CHAIN, admissions: [{ id: "test-artifact", state: "admitted", source: { provider: "huggingface", repository: "owner/model", revision: "b".repeat(40), artifactPath: "model.gguf", trustRemoteCode: false }, artifact: { format: "gguf", sha256: metadata.artifactSha256, sizeBytes: 42 }, inspection: { ...metadata, receiptSha256: modelInspectionReceiptSha256(metadata) }, runtimeBindings: [{ provider: "ollama", digest, sizeBytes: 420 }] }] };
const schema = { type: "object", additionalProperties: false, required: ["summary"], properties: { summary: { type: "string", maxLength: 100 } } };
function fixture(body: unknown, model: Record<string, unknown> = {}) {
  const calls: Array<{ url: string; body?: Record<string, unknown> }> = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
    return Response.json(String(url).endsWith("/api/tags") ? { models: [{ name: "local-model", digest, size: 420, ...model }] } : body);
  }) as typeof fetch;
  return { calls, fetchImpl, channel: openTransientResultChannel({ now: now.getTime() }), modelSupplyChain: policy, now: () => now };
}
test("admitted local generation enforces schema and keeps raw content out of receipts", async () => {
  const f = fixture({ response: '{"summary":"private answer"}', done: true });
  const result = await generateLocalStructuredOutput({ prompt: "private input", schema }, f);
  assert.deepEqual(result.value, { summary: "private answer" });
  assert.deepEqual(f.calls[1]?.body?.format, schema);
  const receipts = JSON.stringify(listTransientResults(f.channel, now.getTime()));
  assert.doesNotMatch(receipts, /private input|private answer|summary/);
  assert.equal(result.receipt.creditCost, 0);
});
test("local embeddings normalize vectors and bind output to the admitted artifact", async () => {
  const f = fixture({ embeddings: [[3, 4]] });
  const result = await generateLocalEmbeddings({ texts: ["private memory"] }, f);
  assert.deepEqual(result.embeddings, [{ modelDigest: digest, vector: [0.6, 0.8] }]);
  assert.equal(f.calls[1]?.body?.truncate, false);
});
test("missing channel, unadmitted model and remote-backed catalog entries cannot invoke inference", async () => {
  const f = fixture({});
  await assert.rejects(generateLocalEmbeddings({ texts: ["hello"] }, { ...f, channel: null }), /transient-result-channel-required/);
  assert.equal(f.calls.length, 0);
  const remote = fixture({}, { remote_host: "https://cloud.example" });
  await assert.rejects(generateLocalEmbeddings({ texts: ["hello"] }, remote), /local-ai-remote-model-forbidden/);
  assert.equal(remote.calls.length, 1);
  const unadmitted = fixture({});
  await assert.rejects(generateLocalEmbeddings({ texts: ["hello"] }, { ...unadmitted, modelSupplyChain: DEFAULT_MODEL_SUPPLY_CHAIN }), /model-supply-chain-unadmitted/);
  assert.equal(unadmitted.calls.length, 1);
});
test("malformed generation and oversized responses fail before recording success", async () => {
  const f = fixture({ response: '{"summary":1}', done: true });
  await assert.rejects(generateLocalStructuredOutput({ prompt: "hello", schema }, f), /structured-output-mismatch/);
  assert.deepEqual(listTransientResults(f.channel, now.getTime()), []);
  const large = fixture({ response: "a".repeat(300_000) });
  await assert.rejects(generateLocalStructuredOutput({ prompt: "hello", schema }, large), /local-ai-response-too-large/);
});

test("inference deadlines and cancellation are bounded even when transport ignores abort", async () => {
  const f = fixture({});
  const fetchImpl = (() => new Promise<Response>(() => {})) as typeof fetch;
  await assert.rejects(generateLocalEmbeddings({ texts: ["hello"] }, { ...f, fetchImpl, timeoutMs: 100 }), /local-ai-timeout/);
  const controller = new AbortController();
  const pending = generateLocalEmbeddings({ texts: ["hello"] }, { ...f, fetchImpl, timeoutMs: 10_000, signal: controller.signal });
  controller.abort();
  const result = await Promise.race([pending.then(() => "accepted", error => String(error)), new Promise<string>(resolve => setTimeout(() => resolve("not-cancelled"), 100))]);
  assert.match(result, /local-ai-cancelled/);
});
