import { createHash } from "node:crypto";
import { createRelayBroker } from "../relay/core.mjs";
import {
  acceptPairingOffer,
  createPairingOffer,
  deriveRelaySession,
  openFrame,
  sealFrame,
} from "./relay-client.mjs";

const SYNTHETIC_PROMPT = "Verify system health and return an interaction receipt.";

export async function runCommunicationSimulation({ ownerIdentity, allowedOrigin, now = () => Date.now() } = {}) {
  const localSocket = captureSocket();
  const remoteSocket = captureSocket();
  const broker = createRelayBroker({ ownerIdentity, allowedOrigin, now });
  const remoteOrigin = Array.isArray(allowedOrigin) ? allowedOrigin[0] : allowedOrigin;
  const local = await createPairingOffer({ now, ttlMs: 300_000 });
  const remote = await acceptPairingOffer(local.publicOffer, { now: () => Number(now()) + 1 });
  const runtimeSession = await deriveRelaySession(local.privateKey, remote.publicKey, local.context);
  const uiSession = await deriveRelaySession(remote.privateKey, local.publicKey, remote.context);

  broker.pairLocal({
    owner: ownerIdentity,
    deviceId: "simulated-windows",
    pairingId: local.context.pairingId,
    code: local.context.code,
    devicePublicKey: local.publicKey,
    socket: localSocket,
  });
  const ownerBound = await rejectsCode(() => broker.pairRemote({
    owner: "unauthorized@example.com", origin: remoteOrigin,
    pairingId: local.context.pairingId, code: local.context.code, devicePublicKey: remote.publicKey,
  }), "relay-owner-required");
  const originBound = await rejectsCode(() => broker.pairRemote({
    owner: ownerIdentity, origin: "https://unauthorized.example",
    pairingId: local.context.pairingId, code: local.context.code, devicePublicKey: remote.publicKey,
  }), "relay-origin-required");

  const paired = await broker.pairRemote({
    owner: ownerIdentity, origin: remoteOrigin,
    pairingId: local.context.pairingId, code: local.context.code,
    devicePublicKey: remote.publicKey, socket: remoteSocket,
  });
  runtimeSession.sessionId = paired.sessionId;
  uiSession.sessionId = paired.sessionId;

  const correlationId = `sim-${createHash("sha256").update(SYNTHETIC_PROMPT).digest("hex").slice(0, 16)}`;
  const request = { type: "chat", correlationId, classification: "synthetic", content: SYNTHETIC_PROMPT };
  const requestFrame = await sealFrame(uiSession, request, { direction: "ui-to-runtime" });
  const requestForward = broker.forward({ owner: ownerIdentity, origin: remoteOrigin, sessionId: uiSession.sessionId, from: "remote", frame: requestFrame });
  const deliveredRequest = localSocket.messages.at(-1)?.frame;
  const openedRequest = await openFrame(runtimeSession, deliveredRequest);

  const receipt = Object.freeze({
    type: "simulation-receipt", correlationId: openedRequest.correlationId,
    status: "accepted", capability: "assistant.respond", mechanism: "owner-paired-relay",
    externalProviderCalls: 0,
  });
  const responseFrame = await sealFrame(runtimeSession, receipt, { direction: "runtime-to-ui" });
  const responseForward = broker.forward({ owner: ownerIdentity, sessionId: runtimeSession.sessionId, from: "local", frame: responseFrame });
  const deliveredResponse = remoteSocket.messages.at(-1)?.frame;
  const openedReceipt = await openFrame(uiSession, deliveredResponse);
  const replayRejected = await rejectsCode(() => openFrame(runtimeSession, requestFrame), "relay-counter-replay");
  const noPlaintextInFrames = !JSON.stringify([requestFrame, responseFrame]).includes(SYNTHETIC_PROMPT);
  const encryptedRoundTrip = requestForward.delivered === true
    && responseForward.delivered === true
    && openedReceipt.correlationId === correlationId;
  const assertions = Object.freeze({ ownerBound, originBound, encryptedRoundTrip, replayRejected, noPlaintextInFrames });

  return Object.freeze({
    ok: Object.values(assertions).every(Boolean),
    protocol: "owner-paired-relay",
    correlationId,
    externalProviderCalls: 0,
    receipt: openedReceipt,
    assertions,
  });
}

function captureSocket() {
  return { messages: [], send(value) { this.messages.push(JSON.parse(value)); }, close() {} };
}

async function rejectsCode(operation, code) {
  try { await operation(); return false; }
  catch (error) { return error?.code === code || error?.message === code; }
}
