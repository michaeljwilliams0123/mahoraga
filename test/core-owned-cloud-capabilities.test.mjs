import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { executeNativeCloudModel, executeZeroCreditAnswerModel } from "../src/native-cloud-model.mjs";
import { executeCloudBrowserNavigation } from "../src/cloud-browser-provider.mjs";
import { createCapabilityReceipt } from "../src/receipt-registry.mjs";

const read = (relative) => readFile(new URL(`../${relative}`, import.meta.url), "utf8");
const zeroCreditEvidence = (id = "codespaces-open-weight") => ({
  id,
  metered: false,
  priceUsd: 0,
  spendUsd: 0,
  billingState: "verified-zero",
  zeroDollarStopGuaranteed: true,
  ready: true,
  capabilityCanary: { fresh: true },
});

test("native cloud answer is fixed to GPT-5.6 Sol through the Vercel AI Gateway", async () => {
  let observed;
  const result = await executeNativeCloudModel({
    task: { requestedOutcome: "Why does it rain?", messages: [{ role: "user", content: "Why does it rain?" }] },
    env: { AI_GATEWAY_API_KEY: "test-gateway-key" },
    fetchImpl: async (url, init) => {
      observed = { url, init, body: JSON.parse(init.body) };
      return new Response(JSON.stringify({ choices: [{ message: { content: "Rain forms when condensed droplets grow heavy enough to fall." } }], usage: { prompt_tokens: 44, completion_tokens: 18 } }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  assert.equal(observed.url, "https://ai-gateway.vercel.sh/v1/chat/completions");
  assert.equal(observed.body.model, "openai/gpt-5.6-sol");
  assert.equal(observed.body.stream, false);
  assert.equal(observed.body.providerOptions, undefined);
  assert.equal(result.verified, true);
  assert.match(result.answer, /condensed droplets/);
  assert.equal(result.providerHealth.provider, "vercel-ai-gateway");
  assert.equal(result.providerHealth.model, "openai/gpt-5.6-sol");
  assert.equal(JSON.stringify(result).includes("test-gateway-key"), false);
  const receipt = createCapabilityReceipt("assistant.respond", result);
  assert.equal("answer" in receipt.details.outputEvidence, false);
});

test("native cloud answer fails closed without credential and ignores caller provider fields", async () => {
  let called = false;
  const result = await executeNativeCloudModel({ task: { requestedOutcome: "Explain rain.", model: "attacker/model", endpoint: "https://evil.example/v1/chat/completions", providerOptions: { gateway: { order: ["attacker"] } } }, env: {}, fetchImpl: async () => { called = true; throw new Error("should-not-run"); } });
  assert.equal(called, false);
  assert.equal(result.verified, false);
  assert.equal(result.providerHealth.availability, "unavailable");
  assert.equal(result.providerHealth.reasonCode, "ai-gateway-credential-unavailable");
});

test("zero-credit answer requires canonical allow plus complete fresh zero-dollar evidence", async () => {
  for (const input of [
    { authorityDecision: { decision: "hold" }, providerDecision: { status: "selected", providerId: "codespaces-open-weight", costClass: "cloud-open-weight" }, providerEvidence: zeroCreditEvidence() },
    { authorityDecision: { decision: "allow" }, providerDecision: { status: "selected", providerId: "codespaces-open-weight", costClass: "cloud-open-weight" }, providerEvidence: { ...zeroCreditEvidence(), metered: true } },
    { authorityDecision: { decision: "allow" }, providerDecision: { status: "selected", providerId: "codespaces-open-weight", costClass: "cloud-open-weight" }, providerEvidence: { ...zeroCreditEvidence(), spendUsd: 0.01 } },
    { authorityDecision: { decision: "allow" }, providerDecision: { status: "selected", providerId: "codespaces-open-weight", costClass: "cloud-open-weight" }, providerEvidence: { ...zeroCreditEvidence(), capabilityCanary: { fresh: false } } },
  ]) {
    let calls = 0;
    const result = await executeZeroCreditAnswerModel({ task: { requestedOutcome: "Explain rain." }, ...input, env: { MAHORAGA_ZERO_CREDIT_MODEL_URL: "https://zero.example/v1/chat/completions", MAHORAGA_ZERO_CREDIT_MODEL_ID: "open-weight-test" }, fetchImpl: async () => { calls += 1; throw new Error("should-not-run"); } });
    assert.equal(calls, 0);
    assert.equal(result.verified, false);
  }
});

test("zero-credit answer performs exactly one admitted model call without exposing server configuration", async () => {
  let calls = 0;
  let observed;
  const result = await executeZeroCreditAnswerModel({
    task: { id: "task-zero-1", correlationId: "corr-zero-1", requestedOutcome: "Explain rain." },
    authorityDecision: { decision: "allow" },
    providerDecision: { status: "selected", providerId: "codespaces-open-weight", costClass: "cloud-open-weight" },
    providerEvidence: zeroCreditEvidence(),
    env: { MAHORAGA_ZERO_CREDIT_MODEL_URL: "https://zero.example/v1/chat/completions", MAHORAGA_ZERO_CREDIT_MODEL_ID: "open-weight-test", MAHORAGA_ZERO_CREDIT_MODEL_TOKEN: "server-secret" },
    fetchImpl: async (url, init) => {
      calls += 1;
      observed = { url, body: JSON.parse(init.body) };
      return new Response(JSON.stringify({ choices: [{ message: { content: "Rain falls after atmospheric water condenses and droplets become heavy enough." } }] }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  assert.equal(calls, 1);
  assert.equal(observed.url, "https://zero.example/v1/chat/completions");
  assert.equal(observed.body.model, "open-weight-test");
  assert.equal(result.verified, true);
  assert.equal(result.externalProviderCalls, 1);
  assert.equal(result.providerDecision.providerId, "codespaces-open-weight");
  assert.equal(result.providerDecision.costClass, "cloud-open-weight");
  assert.match(result.answer, /Rain falls/);
  assert.equal(JSON.stringify(result).includes("server-secret"), false);
  assert.equal(JSON.stringify(result).includes("zero.example"), false);
});

test("cloud browser navigation accepts only the registered public YouTube target", async () => {
  const calls = [];
  const result = await executeCloudBrowserNavigation({ task: { targetId: "public.youtube", attendedAuthority: true }, env: { BROWSERBASE_API_KEY: "test-browser-key" }, fetchImpl: async (url, init = {}) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
    if (url.endsWith("/sessions") && init.method === "POST") return new Response(JSON.stringify({ id: "session-123" }), { status: 201 });
    if (url.includes("/sessions/session-123") && init.method === "POST") return new Response(JSON.stringify({ ok: true }), { status: 200 });
    if (url.endsWith("/sessions/session-123") && init.method === "DELETE") return new Response(null, { status: 204 });
    return new Response(JSON.stringify({ error: "unexpected" }), { status: 400 });
  } });
  assert.equal(result.verified, true);
  assert.equal(result.targetId, "public.youtube");
  assert.equal(result.targetHost, "www.youtube.com");
  assert.equal(JSON.stringify(result).includes("test-browser-key"), false);
  assert.equal(calls.some((call) => JSON.stringify(call.body).includes("evil.example")), false);
});

test("cloud browser refuses arbitrary destinations and unattended navigation before network", async () => {
  for (const task of [{ targetId: "https://evil.example", attendedAuthority: true }, { targetId: "public.youtube", attendedAuthority: false }]) {
    let called = false;
    const result = await executeCloudBrowserNavigation({ task, env: { BROWSERBASE_API_KEY: "test-browser-key" }, fetchImpl: async () => { called = true; throw new Error("should-not-run"); } });
    assert.equal(called, false);
    assert.equal(result.verified, false);
  }
});

test("worker process and normalized manifest expose cloud providers only as core-routed capabilities", async () => {
  const [workerProcess, configSource] = await Promise.all([read("src/worker-process.mjs"), read("src/config.mjs")]);
  assert.match(workerProcess, /native-cloud-model/);
  assert.match(workerProcess, /cloud-browser/);
  assert.doesNotMatch(workerProcess, /process\.env\.(?:MODEL|PROVIDER|ENDPOINT)/);
  assert.match(configSource, /native-cloud-model|cloud-browser/);
});
