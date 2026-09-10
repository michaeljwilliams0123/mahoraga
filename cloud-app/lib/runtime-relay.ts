"use client";

import { clearRelaySession, loadRelaySession, saveRelaySession } from "./relay-session-store";

const RELAY_ORIGIN = "wss://mahoraga-relay.mahoraga-mjw0123.workers.dev/pair";
const PROTOCOL_VERSION = "1.0.0";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

type JsonObject = Record<string, unknown>;
type RelaySession = {
  sessionId: string;
  key: CryptoKey;
  sendCounter: number;
  receivedCounter: number;
};
type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};
type PairingOffer = {
  schemaVersion: 1;
  protocolVersion: "1.0.0";
  pairingId: string;
  code: string;
  expiresAt: string;
  devicePublicKey: JsonWebKey;
};

export type RuntimeCapability = {
  capability: string;
  routable: boolean;
  workerIds: string[];
};
export type RuntimeTask = {
  id: string;
  conversationId: string;
  status: string;
  errorCode?: string | null;
};
export type RuntimeMessage = {
  id: string;
  role: "assistant" | "system" | "user";
  content?: string | null;
  contentReference?: string | null;
  classification?: string | null;
};
export type RuntimeChatResult = {
  conversation: { id: string };
  task: RuntimeTask | null;
  objective: { id?: string } | null;
  decision: { mode?: string; execution?: string };
};

export type RuntimeOperationsSnapshot = {
  generatedAt: string;
  runtime: {
    version: string;
    productionBaseline: string;
    rollbackTarget: string;
    healthy?: boolean;
    tone?: string;
  };
  repository: { branch: string; headSha: string | null; cleanState: string };
  workers: Array<{ id: string; state: string; capabilities: string[]; tone?: string }>;
  tasks: { active: number; waiting: number; failed: number };
  objectives: { active: number; waiting: number };
  repairs: { activeIncidents: number; lastRepairState: string };
  verification: { state: string; exactHeadSha: string | null };
  update: { candidate: { id: string; state: string } | null; activationState: string; rollbackReady: boolean };
};

export type RuntimeOperationsActionInput = {
  actionId: "task.cancel" | "task.retry" | "repair.request" | "repository.verify" | "runtime.health-check";
  idempotencyKey: string;
  taskId?: string;
  incidentId?: string;
  confirmationToken?: string;
  confirm?: boolean;
};

export type RuntimeOperationsActionResult = {
  ok: boolean;
  confirmationRequired: boolean;
  confirmationToken?: string;
  actionId: string;
  receiptId: string;
  result: Record<string, unknown> | null;
};

export class RuntimeRelay {
  private socket: WebSocket | null = null;
  private session: RelaySession | null = null;
  private pending = new Map<string, PendingRequest>();
  private requestCounter = 0;
  private deviceId: string | null = null;
  private resumeCredential: string | null = null;
  private expiresAt: string | null = null;
  private pairing: { resolve: (value: JsonObject) => void; reject: (reason: Error) => void } | null = null;
  private revokeAcknowledgement: (() => void) | null = null;
  private cloudSession: { csrf: string } | null = null;

  get connected() {
    return this.cloudSession !== null || (this.socket?.readyState === WebSocket.OPEN && this.session !== null);
  }

  async attach() {
    const response = await fetch("/api/runtime/session", { credentials: "include", cache: "no-store" });
    if (!response.ok) return null;
    const value = await response.json() as JsonObject;
    if (value.authenticated !== true || typeof value.csrf !== "string") return null;
    this.cloudSession = { csrf: value.csrf };
    return { sessionId: "same-origin-cloud" };
  }

  async pair(encodedOffer: string) {
    await this.revoke();
    const offer = decodePairingOffer(encodedOffer);
    if (Date.parse(offer.expiresAt) <= Date.now()) throw relayError("relay-pairing-expired");
    const keys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    const peer = await crypto.subtle.importKey("jwk", offer.devicePublicKey, { name: "ECDH", namedCurve: "P-256" }, false, []);
    const shared = await crypto.subtle.deriveBits({ name: "ECDH", public: peer }, keys.privateKey, 256);
    const context = { code: offer.code, expiresAt: offer.expiresAt, pairingId: offer.pairingId, protocolVersion: offer.protocolVersion };
    this.session = await deriveSession(shared, context);
    const publicKey = await crypto.subtle.exportKey("jwk", keys.publicKey);
    const socket = new WebSocket(RELAY_ORIGIN);
    this.socket = socket;
    await waitForOpen(socket);
    socket.addEventListener("message", (event) => { void this.receive(event); });
    socket.addEventListener("close", () => this.rejectPending("relay-disconnected"));
    const result = await new Promise<JsonObject>((resolve, reject) => {
      const timer = setTimeout(() => { this.pairing = null; reject(relayError("relay-pairing-timeout")); }, 10_000);
      this.pairing = {
        resolve: (value) => { clearTimeout(timer); this.pairing = null; resolve(value); },
        reject: (reason) => { clearTimeout(timer); this.pairing = null; reject(reason); },
      };
      socket.send(JSON.stringify({ action: "pair-remote", pairingId: offer.pairingId, code: offer.code, devicePublicKey: publicKey }));
    });
    if (typeof result.sessionId !== "string" || !/^rls-[A-Za-z0-9_-]{32}$/.test(result.sessionId) || result.pairingId !== offer.pairingId || result.paired !== true) {
      throw relayError("relay-pairing-response-invalid");
    }
    if (typeof result.deviceId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{2,119}$/.test(result.deviceId)) throw relayError("relay-pairing-response-invalid");
    if (typeof result.resumeCredential !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(result.resumeCredential)) throw relayError("relay-pairing-response-invalid");
    if (typeof result.expiresAt !== "string" || !Number.isFinite(Date.parse(result.expiresAt)) || Date.parse(result.expiresAt) <= Date.now()) throw relayError("relay-pairing-response-invalid");
    this.session.sessionId = result.sessionId;
    this.deviceId = result.deviceId;
    this.resumeCredential = result.resumeCredential;
    this.expiresAt = result.expiresAt;
    await this.persistSession();
    return { sessionId: result.sessionId };
  }

  async resume() {
    const stored = await loadRelaySession();
    if (!stored) return null;
    this.disconnect();
    this.session = { sessionId: stored.sessionId, key: stored.key, sendCounter: stored.sendCounter, receivedCounter: stored.receivedCounter };
    this.deviceId = stored.deviceId;
    this.resumeCredential = stored.resumeCredential;
    this.expiresAt = stored.expiresAt;
    try {
      const socket = new WebSocket(RELAY_ORIGIN);
      this.socket = socket;
      await waitForOpen(socket);
      socket.addEventListener("message", (event) => { void this.receive(event); });
      socket.addEventListener("close", () => this.rejectPending("relay-disconnected"));
      const result = await new Promise<JsonObject>((resolve, reject) => {
        const timer = setTimeout(() => { this.pairing = null; reject(relayError("relay-pairing-timeout")); }, 10_000);
        this.pairing = {
          resolve: (value) => { clearTimeout(timer); this.pairing = null; resolve(value); },
          reject: (reason) => { clearTimeout(timer); this.pairing = null; reject(reason); },
        };
        socket.send(JSON.stringify({ action: "reattach-remote", deviceId: stored.deviceId, sessionId: stored.sessionId, resumeCredential: stored.resumeCredential }));
      });
      if (result.paired !== true || result.sessionId !== stored.sessionId || result.deviceId !== stored.deviceId) throw relayError("relay-session-reattach-invalid");
      socket.send(JSON.stringify({ action: "replay", sessionId: stored.sessionId, to: "remote", afterCounter: stored.receivedCounter }));
      return { sessionId: stored.sessionId };
    } catch {
      this.disconnect();
      await clearRelaySession();
      return null;
    }
  }

  async chat(input: JsonObject) {
    if (Array.isArray(input.attachmentIds) && input.attachmentIds.length > 0) throw relayError("relay-attachments-local-only");
    return this.call<RuntimeChatResult>("chat", { ...input, attachmentIds: [] });
  }
  async tasks(conversationId: string) {
    const value = await this.call<{ tasks?: RuntimeTask[] }>("tasks", { conversationId });
    return Array.isArray(value.tasks) ? value.tasks : [];
  }
  async messages(conversationId: string) {
    const value = await this.call<{ messages?: RuntimeMessage[] }>("messages", { conversationId });
    return Array.isArray(value.messages) ? value.messages : [];
  }
  async messageContent(message: RuntimeMessage, conversationId: string) {
    const value = await this.call<{ content?: string }>("message-content", {
      conversationId,
      messageId: message.id,
      contentReference: message.contentReference,
      classification: message.classification,
    });
    return typeof value.content === "string" ? value.content : "";
  }
  async taskAction(taskId: string, conversationId: string, action: "retry" | "cancel") {
    return this.call<{ task: RuntimeTask }>("task-action", { taskId, conversationId, action });
  }
  async capabilities() {
    const value = await this.call<{ capabilities?: RuntimeCapability[] }>("capabilities", {});
    return Array.isArray(value.capabilities) ? value.capabilities : [];
  }
  async operationsSnapshot() {
    return this.call<RuntimeOperationsSnapshot>("operations-snapshot", {});
  }
  async operationsAction(input: RuntimeOperationsActionInput) {
    return this.call<RuntimeOperationsActionResult>("operations-action", { ...input });
  }

  disconnect() {
    this.socket?.close(1000, "browser-disconnect");
    this.socket = null;
    this.session = null;
    this.deviceId = null;
    this.resumeCredential = null;
    this.expiresAt = null;
    this.pairing = null;
    this.revokeAcknowledgement = null;
    this.cloudSession = null;
    this.rejectPending("relay-disconnected");
  }

  async revoke() {
    if (this.cloudSession) { this.cloudSession = null; return; }
    const socket = this.socket;
    try {
      if (socket?.readyState === WebSocket.OPEN && this.deviceId) {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 1_500);
          this.revokeAcknowledgement = () => { clearTimeout(timer); resolve(); };
          socket.send(JSON.stringify({ action: "revoke-device", deviceId: this.deviceId }));
        });
      }
    } finally {
      socket?.close(1000, "owner-revoked");
      this.socket = null;
      this.session = null;
      this.deviceId = null;
      this.resumeCredential = null;
      this.expiresAt = null;
      this.pairing = null;
      this.revokeAcknowledgement = null;
      this.rejectPending("relay-revoked");
      await clearRelaySession();
    }
  }

  private async call<T>(type: string, payload: JsonObject) {
    if (this.cloudSession) {
      const response = await fetch("/api/runtime/action", {
        method: "POST", credentials: "include", cache: "no-store",
        headers: { "content-type": "application/json", "x-mahoraga-csrf": this.cloudSession.csrf,
          "x-mahoraga-request-nonce": crypto.randomUUID(), "x-mahoraga-request-timestamp": String(Date.now()) },
        body: JSON.stringify({ type, payload }),
      });
      const value = await response.json() as JsonObject;
      if (!response.ok) throw relayError(publicCode(value.error));
      return value as T;
    }
    if (!this.connected || !this.socket || !this.session) throw relayError("relay-not-paired");
    const requestId = `req-${++this.requestCounter}`;
    const frame = await sealFrame(this.session, { requestId, type, payload });
    await this.persistSession();
    const result = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(relayError("relay-request-timeout")); }, 30_000);
      this.pending.set(requestId, { resolve, reject, timer });
    });
    this.socket.send(JSON.stringify({ action: "forward", sessionId: this.session.sessionId, from: "remote", frame }));
    return result as Promise<T>;
  }

  private async receive(event: MessageEvent) {
    try {
      const source = typeof event.data === "string" ? event.data : await (event.data as Blob).text();
      const envelope = JSON.parse(source) as JsonObject;
      if (envelope.accepted === false && this.pairing) {
        this.pairing.reject(relayError(publicCode(envelope.error)));
        return;
      }
      if (envelope.type === "paired") {
        if (envelope.accepted !== true || !isObject(envelope.result)) this.pairing?.reject(relayError(publicCode(envelope.error)));
        else this.pairing?.resolve(envelope.result);
        return;
      }
      if (envelope.type === "forward-accepted" || envelope.type === "replay-complete") return;
      if (envelope.type === "revoked") {
        this.revokeAcknowledgement?.();
        this.revokeAcknowledgement = null;
        this.rejectPending("relay-revoked");
        await clearRelaySession();
        return;
      }
      if (envelope.type !== "frame" || !isObject(envelope.frame) || !this.session) throw relayError("relay-frame-envelope-invalid");
      const response = await openFrame(this.session, envelope.frame);
      await this.persistSession();
      if (typeof response.requestId !== "string") throw relayError("relay-response-invalid");
      const pending = this.pending.get(response.requestId);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(response.requestId);
      if (response.error) pending.reject(relayError(publicCode(response.error)));
      else pending.resolve(response.result);
    } catch {
      this.rejectPending("relay-frame-invalid");
    }
  }

  private async persistSession() {
    if (!this.session || !this.deviceId || !this.resumeCredential || !this.expiresAt) return;
    try {
      await saveRelaySession({
        schemaVersion: 1,
        sessionId: this.session.sessionId,
        deviceId: this.deviceId,
        expiresAt: this.expiresAt,
        resumeCredential: this.resumeCredential,
        key: this.session.key,
        sendCounter: this.session.sendCounter,
        receivedCounter: this.session.receivedCounter,
      });
    } catch {
      // Persistence failure falls back to secure manual pairing on the next load.
    }
  }

  private rejectPending(code: string) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(relayError(code));
    }
    this.pending.clear();
  }
}

function decodePairingOffer(value: string): PairingOffer {
  let offer: unknown;
  try { offer = JSON.parse(value.startsWith("{") ? value : decoder.decode(fromBase64Url(value))); }
  catch { throw relayError("relay-pairing-offer-invalid"); }
  if (!isObject(offer) || Object.keys(offer).sort().join(",") !== "code,devicePublicKey,expiresAt,pairingId,protocolVersion,schemaVersion") throw relayError("relay-pairing-offer-invalid");
  if (offer.schemaVersion !== 1 || offer.protocolVersion !== PROTOCOL_VERSION || typeof offer.pairingId !== "string" || !/^pair-[a-f0-9-]{36}$/.test(offer.pairingId)) throw relayError("relay-pairing-offer-invalid");
  if (typeof offer.code !== "string" || !/^[A-Z2-9]{8}$/.test(offer.code) || typeof offer.expiresAt !== "string" || !Number.isFinite(Date.parse(offer.expiresAt))) throw relayError("relay-pairing-offer-invalid");
  if (!isObject(offer.devicePublicKey) || offer.devicePublicKey.kty !== "EC" || offer.devicePublicKey.crv !== "P-256") throw relayError("relay-pairing-offer-invalid");
  return offer as unknown as PairingOffer;
}

async function deriveSession(shared: ArrayBuffer, context: JsonObject): Promise<RelaySession> {
  const material = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  const contextBytes = encoder.encode(JSON.stringify(context));
  const salt = await crypto.subtle.digest("SHA-256", contextBytes);
  const key = await crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt, info: encoder.encode("mahoraga-relay-frame-v1") }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const hash = toBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", contextBytes))).slice(0, 32);
  return { sessionId: `rls-${hash}`, key, sendCounter: 0, receivedCounter: 0 };
}

async function sealFrame(session: RelaySession, payload: JsonObject) {
  const plaintext = encoder.encode(JSON.stringify(payload));
  if (plaintext.byteLength < 2 || plaintext.byteLength > 65_536) throw relayError("relay-frame-payload-invalid");
  const counter = ++session.sendCounter;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: frameAad(session.sessionId, "ui-to-runtime", counter), tagLength: 128 }, session.key, plaintext);
  return { schemaVersion: 1, sessionId: session.sessionId, direction: "ui-to-runtime", counter, iv: toBase64Url(iv), ciphertext: toBase64Url(new Uint8Array(ciphertext)) };
}

async function openFrame(session: RelaySession, frame: JsonObject) {
  if (frame.sessionId !== session.sessionId || frame.direction !== "runtime-to-ui" || !Number.isSafeInteger(frame.counter) || Number(frame.counter) <= session.receivedCounter) throw relayError("relay-frame-invalid");
  if (typeof frame.iv !== "string" || typeof frame.ciphertext !== "string") throw relayError("relay-frame-invalid");
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64Url(frame.iv), additionalData: frameAad(session.sessionId, "runtime-to-ui", Number(frame.counter)), tagLength: 128 }, session.key, fromBase64Url(frame.ciphertext));
  session.receivedCounter = Number(frame.counter);
  const value: unknown = JSON.parse(decoder.decode(plaintext));
  if (!isObject(value)) throw relayError("relay-response-invalid");
  return value;
}

function waitForOpen(socket: WebSocket) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(relayError("relay-connect-timeout")), 10_000);
    socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener("error", () => { clearTimeout(timer); reject(relayError("relay-connect-failed")); }, { once: true });
  });
}
function frameAad(sessionId: string, direction: string, counter: number) { return encoder.encode(JSON.stringify({ protocolVersion: PROTOCOL_VERSION, sessionId, direction, counter })); }
function toBase64Url(bytes: Uint8Array) { let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, ""); }
function fromBase64Url(value: string) { const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "="); const binary = atob(base64); return Uint8Array.from(binary, (character) => character.charCodeAt(0)); }
function isObject(value: unknown): value is JsonObject { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
function publicCode(value: unknown) { const code = String(value ?? "relay-request-rejected").toLowerCase().replace(/[^a-z0-9.-]+/g, "-").slice(0, 80); return /^[a-z]/.test(code) ? code : "relay-request-rejected"; }
function relayError(code: string) { const error = new Error(code); error.name = "RuntimeRelayError"; return error; }
