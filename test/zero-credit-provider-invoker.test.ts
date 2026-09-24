import assert from "node:assert/strict";
import test from "node:test";

import {
  ASSISTANT_MODEL_ID,
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
  billingAttestation: "test-only",
};

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
