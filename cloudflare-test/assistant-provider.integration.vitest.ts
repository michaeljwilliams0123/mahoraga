import { describe, expect, it, vi } from "vitest";

import { createOpenAICompatibleZeroCreditProvider } from "../deploy/cloudflare-execution-runtime/zero-credit-provider";

const baseEnv = {
  MAHORAGA_ZERO_CREDIT_MODEL_URL: "https://zero.example/v1/chat/completions",
  MAHORAGA_ZERO_CREDIT_MODEL_ID: "open-weight-test",
  MAHORAGA_ZERO_CREDIT_MODEL_TOKEN: "server-secret",
  MAHORAGA_ZERO_CREDIT_PROVIDER_ID: "codespaces-open-weight",
  MAHORAGA_ZERO_CREDIT_METERED: "false",
  MAHORAGA_ZERO_CREDIT_PRICE_USD: "0",
  MAHORAGA_ZERO_CREDIT_SPEND_USD: "0",
  MAHORAGA_ZERO_CREDIT_BILLING_STATE: "verified-zero",
  MAHORAGA_ZERO_CREDIT_ZERO_DOLLAR_STOP_GUARANTEED: "true",
};

describe("Cloudflare zero-credit assistant provider", () => {
  it("admits and executes one OpenAI-compatible turn only with hard-zero evidence", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body));
      expect(request.model).toBe("open-weight-test");
      expect(request.stream).toBe(false);
      expect(request.messages).toEqual([{ role: "user", content: "hello Mahoraga" }]);
      return new Response(JSON.stringify({
        choices: [{ message: { content: "Hello from the zero-credit provider." } }],
        usage: { prompt_tokens: 4, completion_tokens: 7 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const now = 1_790_058_600_000;
    const provider = createOpenAICompatibleZeroCreditProvider(baseEnv, { fetchImpl, now: () => now });
    const probe = await provider.probe();
    expect(probe).toMatchObject({
      providerId: "codespaces-open-weight",
      available: true,
      costClass: "cloud-open-weight",
      metered: false,
      priceUsd: 0,
      spendUsd: 0,
      billingState: "verified-zero",
      zeroDollarStopGuaranteed: true,
      verifiedAt: now,
    });
    expect(probe.canaryExpiresAt).toBeGreaterThan(now);

    const result = await provider.executeAssistantTurn({
      conversationId: "conv-1",
      turnId: "turn-1",
      message: "hello Mahoraga",
    });
    expect(result.answer).toBe("Hello from the zero-credit provider.");
    expect(result.providerId).toBe("codespaces-open-weight");
    expect(result.admissionMode).toBe("zero-codex");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("fails closed before network execution when zero-dollar evidence is incomplete", async () => {
    const fetchImpl = vi.fn(async () => new Response("should-not-run", { status: 500 }));
    const provider = createOpenAICompatibleZeroCreditProvider({
      ...baseEnv,
      MAHORAGA_ZERO_CREDIT_BILLING_STATE: "unknown",
    }, { fetchImpl, now: () => 1_790_058_600_000 });
    const probe = await provider.probe();
    expect(probe.available).toBe(false);
    expect(probe.reasonCode).toBe("provider-zero-credit-unverified");
    await expect(provider.executeAssistantTurn({ conversationId: "conv-1", turnId: "turn-1", message: "hello" }))
      .rejects.toThrow("provider-zero-credit-unverified");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
