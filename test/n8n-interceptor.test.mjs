import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

const modulePath = new URL("../src/relay/n8n-interceptor.mjs", import.meta.url);

async function loadModule() {
  assert.equal(existsSync(modulePath), true, "src/relay/n8n-interceptor.mjs must exist");
  return import(modulePath.href);
}

test("n8n HMAC validates exact raw payloads with timing-safe compatible signatures", async () => {
  const { signN8nPayload, verifyN8nSignature } = await loadModule();
  const secret = "s".repeat(48);
  const payload = Buffer.from('{"event":"ADMIN_CRITICAL","driftRisk":"ELEVATED"}');
  const signature = signN8nPayload(payload, secret);
  assert.match(signature, /^[a-f0-9]{64}$/);
  assert.equal(verifyN8nSignature(payload, signature, secret), true);
  assert.equal(verifyN8nSignature(Buffer.from("different"), signature, secret), false);
  assert.equal(verifyN8nSignature(payload, "zz-not-hex", secret), false);
});

test("n8n HMAC fails closed on weak or missing secrets", async () => {
  const { signN8nPayload, verifyN8nSignature } = await loadModule();
  assert.throws(() => signN8nPayload("payload", "short"), /n8n-secret-invalid/);
  assert.throws(() => signN8nPayload("payload", ""), /n8n-secret-invalid/);
  assert.throws(() => verifyN8nSignature("payload", "0".repeat(64), "short"), /n8n-secret-invalid/);
});