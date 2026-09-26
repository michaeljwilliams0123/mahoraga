import assert from "node:assert/strict";
import test from "node:test";

import {
  ASSISTANT_MODEL_ID,
  ASSISTANT_PROVIDER_ID,
  MAX_PROVIDER_INPUT_BYTES,
  invokeZeroCreditProvider,
  providerGapReasonFromError,
  providerInputWithinLimit,
  type ZeroCreditProviderConfig,
} from "../deploy/cloudflare-execution-runtime/provider-invoker.ts";

const config: ZeroCreditProviderConfig = {
  origin: "https://zero-credit.example/",
  token: "z".repeat(64),
  accountIdHash: "a".repeat(64),
  targetSha: "b".repeat(40),
};

const providerEnvelope = (answer: string) => ({
  providerId: ASSISTANT_PROVIDER_ID,
  modelId: ASSISTANT_MODEL_ID,
  targetSha: config.targetSha,
  accountIdHash: config.accountIdHash,
  billingBoundary: "daily-free-allocation-budget",
  freeAllocationNeurons: 10_000,
  dailyBudgetNeurons: 9_000,
  answer,
});

test("provider input limit is enforced in UTF-8 bytes", () => {
  assert.equal(providerInputWithinLimit("a".repeat(MAX_PROVIDER_INPUT_BYTES)), true);
  assert.equal(providerInputWithinLimit("a".repeat(MAX_PROVIDER_INPUT_BYTES + 1)), false);
  assert.equal(providerInputWithinLimit("😀".repeat(MAX_PROVIDER_INPUT_BYTES / 4)), true);
  assert.equal(providerInputWithinLimit("😀".repeat(MAX_PROVIDER_INPUT_BYTES / 4 + 1)), false);
});

test("provider quota exhaustion is a typed provider gap", async () => {
  const fetchImpl: typeof fetch = async () => Response.json({ error: "daily-free-budget-exhausted" }, { status: 429 });
  await assert.rejects(
    invokeZeroCreditProvider(config, ASSISTANT_MODEL_ID, { messages: [{ role: "user", content: "hello" }] }, fetchImpl),
    (error: unknown) => providerGapReasonFromError(error) === "provider-free-quota-exhausted",
  );
});

test("ordinary provider failures do not masquerade as quota exhaustion", async () => {
  const fetchImpl: typeof fetch = async () => Response.json({ error: "upstream-failed" }, { status: 502 });
  await assert.rejects(
    invokeZeroCreditProvider(config, ASSISTANT_MODEL_ID, { messages: [{ role: "user", content: "hello" }] }, fetchImpl),
    (error: unknown) => error instanceof Error
      && error.message === "cognition-provider-failed"
      && providerGapReasonFromError(error) === null,
  );
});

test("assistant inference is grounded as Mahoraga with live capability truth and receipt-gated claims", async () => {
  let observedBody: Record<string, unknown> | null = null;
  const fetchImpl: typeof fetch = async (_input, init) => {
    observedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    return Response.json(providerEnvelope("I am Mahoraga."));
  };

  await invokeZeroCreditProvider(config, ASSISTANT_MODEL_ID, {
    messages: [{ role: "user", content: "What can you do right now?" }],
    runtimeContext: {
      capabilities: {
        "assistant.respond": "routable",
        "repository.inspect": "unavailable",
        "browser.execute": "unavailable",
        "image.generate": "unavailable",
        "memory.write": "unavailable",
      },
      receipts: [],
      connectionState: "connected",
    },
  } as never, fetchImpl);

  const messages = (observedBody?.messages ?? []) as Array<{ role?: string; content?: string }>;
  assert.equal(messages[0]?.role, "system");
  assert.match(messages[0]?.content ?? "", /You are Mahoraga/i);
  assert.match(messages[0]?.content ?? "", /provider.*implementation detail/i);
  assert.match(messages[0]?.content ?? "", /repository\.inspect=unavailable/i);
  assert.match(messages[0]?.content ?? "", /image\.generate=unavailable/i);
  assert.match(messages[0]?.content ?? "", /connectionState=connected/i);
  assert.match(messages[0]?.content ?? "", /verified receipt/i);
  assert.equal(messages.at(-1)?.content, "What can you do right now?");
});

test("provider identity cannot replace Mahoraga identity in the grounding contract", async () => {
  let systemMessage = "";
  const fetchImpl: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { messages?: Array<{ role?: string; content?: string }> };
    systemMessage = body.messages?.find((message) => message.role === "system")?.content ?? "";
    return Response.json(providerEnvelope("I am GLM, trained by Z.ai."));
  };

  await invokeZeroCreditProvider(config, ASSISTANT_MODEL_ID, {
    messages: [{ role: "user", content: "What is your name?" }],
    runtimeContext: { capabilities: { "assistant.respond": "routable" }, receipts: [], connectionState: "connected" },
  } as never, fetchImpl);

  assert.match(systemMessage, /identity is Mahoraga/i);
  assert.match(systemMessage, /do not identify yourself as GLM|do not present.*provider/i);
});

test("raw text_to_image action envelopes are intercepted and fail closed when image generation is unavailable", async () => {
  const rawAction = JSON.stringify({
    action: "text_to_image",
    detail: JSON.stringify({ prompt: "Mahoraga from JJK", aspect_ratio: "ar_9_16" }),
  });
  const fetchImpl: typeof fetch = async () => Response.json(providerEnvelope(rawAction));

  const result = await invokeZeroCreditProvider(config, ASSISTANT_MODEL_ID, {
    messages: [{ role: "user", content: "create an image of Mahoraga from JJK" }],
    runtimeContext: {
      capabilities: { "assistant.respond": "routable", "image.generate": "unavailable" },
      receipts: [],
      connectionState: "connected",
    },
  } as never, fetchImpl) as { response?: string; action?: { type?: string; status?: string } };

  assert.equal(result.action?.type, "text_to_image");
  assert.equal(result.action?.status, "unavailable");
  assert.match(result.response ?? "", /image generation is not currently connected/i);
  assert.doesNotMatch(result.response ?? "", /"action"\s*:\s*"text_to_image"/);
});
