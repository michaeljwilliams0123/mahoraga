import test from "node:test";
import assert from "node:assert/strict";
import { acceptPairingOffer, createPairingOffer, deriveRelaySession, openFrame, sealFrame } from "../src/relay-client.mjs";

test("paired P-256 sessions exchange authenticated frames and reject replay", async () => {
  const local = await createPairingOffer({ now: () => 0, ttlMs: 300_000 });
  const remote = await acceptPairingOffer(local.publicOffer, { now: () => 1 });
  const sender = await deriveRelaySession(local.privateKey, remote.publicKey, local.context);
  const receiver = await deriveRelaySession(remote.privateKey, local.publicKey, remote.context);
  const frame = await sealFrame(sender, { type: "run", byteCount: 12 });
  assert.deepEqual(await openFrame(receiver, frame), { type: "run", byteCount: 12 });
  await assert.rejects(() => openFrame(receiver, frame), /relay-counter-replay/);
});

test("pairing expiry and ciphertext tampering fail closed", async () => {
  const local = await createPairingOffer({ now: () => 0, ttlMs: 300_000 });
  await assert.rejects(() => acceptPairingOffer(local.publicOffer, { now: () => 300_001 }), /relay-pairing-expired/);
  const remote = await acceptPairingOffer(local.publicOffer, { now: () => 1 });
  const sender = await deriveRelaySession(local.privateKey, remote.publicKey, local.context);
  const receiver = await deriveRelaySession(remote.privateKey, local.publicKey, remote.context);
  const frame = await sealFrame(sender, { type: "cancel", runId: "run-00000000-0000-4000-8000-000000000001" });
  const tampered = { ...frame, ciphertext: `${frame.ciphertext.slice(0, -2)}aa` };
  await assert.rejects(() => openFrame(receiver, tampered), /relay-frame-authentication-failed/);
});
