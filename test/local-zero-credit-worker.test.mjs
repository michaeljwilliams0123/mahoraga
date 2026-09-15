import test from "node:test";
import assert from "node:assert/strict";
import { fork } from "node:child_process";

const ZERO_ENV = Object.freeze({
  MAHORAGA_ZERO_CREDIT_MODEL_URL: "http://127.0.0.1:11434/v1/chat/completions",
  MAHORAGA_ZERO_CREDIT_MODEL_ID: "qwen3:8b",
  MAHORAGA_ZERO_CREDIT_METERED: "false",
  MAHORAGA_ZERO_CREDIT_PRICE_USD: "0",
  MAHORAGA_ZERO_CREDIT_SPEND_USD: "0",
  MAHORAGA_ZERO_CREDIT_BILLING_STATE: "verified-zero",
  MAHORAGA_ZERO_CREDIT_ZERO_DOLLAR_STOP_GUARANTEED: "true",
});

test("local zero-credit worker reports local provider readiness instead of licensed Codex", async (t) => {
  const child = fork(new URL("../src/worker-process.mjs", import.meta.url), ["local-open-weight"], {
    stdio: ["ignore", "ignore", "ignore", "ipc"],
    env: { ...process.env, ...ZERO_ENV },
  });
  t.after(() => { if (child.connected) child.send({ type: "shutdown" }); else child.kill(); });
  const readiness = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("local-zero-credit-readiness-timeout")), 8000);
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`local-zero-credit-worker-exit-${code}`)); });
    child.on("message", (message) => {
      if (message?.type !== "provider.readiness") return;
      clearTimeout(timer);
      resolve(message);
    });
  });
  assert.equal(readiness.workerId, "local-open-weight");
  assert.equal(readiness.capability, "assistant.health");
  assert.equal(readiness.errorCode ?? null, null);
  assert.equal(readiness.receipt?.outcome, "succeeded");
  assert.equal(readiness.receipt?.details?.providerEvidence?.provider, "local-open-weight");
  assert.equal(readiness.receipt?.details?.providerEvidence?.zeroCreditVerified, true);
});
