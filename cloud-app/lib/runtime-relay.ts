"use client";

import { clearRelaySession, loadRelaySession, saveRelaySession } from "./relay-session-store";
import { PagesOwnerBridgeClient, validatePublicBridgeOrigin, type BridgeCapabilityEvent } from "./pages-owner-bridge-client";

import type { GithubWorkspaceSnapshot } from "./github-workspace";
import { RuntimeHttpScope } from "./runtime-http-scope";

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
  enabled?: boolean;
  workerId?: string | null;
  workerIds: string[];
  provider?: string;
  canary?: string;
  costClass?: string;
  billingClass?: string;
  routingReason?: string | null;
  providerReasonCode?: string | null;
  evidenceLevel?: string;
  lastObservedAt?: string | null;
  lastVerifiedAt?: string | null;
};
export type RuntimeInteractionTruth = {
  status: "observed" | "hold";
  interactionId: string;
  sourceFamily: string;
  channelFamily: string;
  modalities: string[];
  protocolFamily: "native" | "http-json" | "mcp" | "webhook" | "sse" | "websocket" | "queue";
  protocolVersion?: string | null;
  locale?: string | null;
  timezone?: string | null;
  direction?: "ltr" | "rtl" | "auto" | null;
  unitSystem?: "metric" | "us" | "uk" | null;
  currency?: string | null;
  deviceClass?: "phone" | "tablet" | "desktop" | "embedded" | "headless" | null;
  networkClass?: "online" | "degraded" | "offline" | null;
  executionStatus?: string | null;
  interactionFingerprint: string;
  negotiationFingerprint?: string | null;
  executionFingerprint?: string | null;
  observedAt?: string | null;
  reason?: string | null;
};
export type RuntimeDeliveryTruth = {
  status: "delivered" | "queued" | "hold";
  interactionId: string;
  taskId?: string | null;
  chainId?: string | null;
  outputReferences: string[];
  deliveryFingerprint: string;
  observedAt?: string | null;
  reason?: string | null;
};
export type RuntimeGithubAppRepositoryProbe = {
  provider: "github-app";
  repository: {
    fullName: string | null;
    private: boolean;
    defaultBranch: string | null;
    pushedAt: string | null;
    permissions: { admin: boolean; maintain: boolean; push: boolean; pull: boolean; triage: boolean };
  };
};
export type RuntimeGithubAppPullRequestProposal = {
  expectedMainSha: string;
  branch: string;
  title: string;
  body: string;
  commitMessage: string;
  files: Array<{ path: string; content: string }>;
};
export type RuntimeGithubAppPullRequestReceipt = {
  provider: "github-app";
  repository: "michaeljwilliams0123/mahoraga";
  number: number;
  url: string;
  state: "open" | "unknown";
  draft: true;
  head: { ref: string; sha: string };
  base: { ref: "main"; sha: string };
};
export type RuntimeGithubAppMergeProposal = {
  number: number;
  expectedMainSha: string;
  expectedHeadSha: string;
  commitTitle: string;
};
export type RuntimeGithubAppMergeReceipt = {
  provider: "github-app";
  repository: "michaeljwilliams0123/mahoraga";
  number: number;
  merged: true;
  mergeMethod: "squash";
  head: { ref: string; sha: string };
  base: { ref: "main"; sha: string };
  main: { ref: "main"; sha: string };
};
export type RuntimeGithubAppDirectMainProposal = {
  expectedMainSha: string;
  commitMessage: string;
  files: Array<{ path: string; content: string }>;
};
export type RuntimeGithubAppDirectMainReceipt = {
  provider: "github-app";
  repository: "michaeljwilliams0123/mahoraga";
  directMain: true;
  previous: { ref: "main"; sha: string };
  main: { ref: "main"; sha: string };
};
export type RuntimeTask = {
  id: string;
  conversationId: string;
  status: string;
  capability?: string | null;
  errorCode?: string | null;
};
export type RuntimeMessage = {
  id: string;
  taskId?: string | null;
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
export type CloudSessionDiagnostic = {
  code: "cloud-session-unavailable" | "cloud-session-unreachable" | "cloud-runtime-degraded" | "cloud-runtime-contract-incompatible" | "cloud-owner-auth-required";
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
  interactionReadiness: {
    ready: boolean;
    capability: "assistant.respond";
    workerId: string | null;
    provider: string;
    canary: string;
    reason: string | null;
    evidenceLevel: string;
    lastObservedAt: string | null;
    lastVerifiedAt: string | null;
  };
  interactionTruth?: RuntimeInteractionTruth | null;
  deliveryTruth?: RuntimeDeliveryTruth | null;
  latestAuthorityDecision: {
    taskId: string;
    correlationId: string | null;
    taskStatus: string;
    envelope: {
      schemaVersion: 1;
      kind: "authority-decision-v1";
      decision: "allow" | "hold" | "deny";
      reasonCodes: string[];
      request: { capability: string | null; dataClass: string | null };
      provider: { id: string | null; costClass: string | null; billingClass: string | null };
      timing: { observedAt: string | null; expiresAt: string | null; revokedAt: string | null };
    };
  } | null;
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
  private disconnectListeners = new Set<() => void>();
  onDisconnected(listener: () => void) {
    this.disconnectListeners.add(listener);
    return () => { this.disconnectListeners.delete(listener); };
  }

  private http = new RuntimeHttpScope();
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
  private bridgeClient: PagesOwnerBridgeClient | null = null;
  private bridgeAuthenticated = false;
  private authenticationGeneration = 0;
  private cloudSessionDiagnostic: CloudSessionDiagnostic | null = null;

  get connected() {
    return this.bridgeAuthenticated || this.cloudSession !== null || (this.socket?.readyState === WebSocket.OPEN && this.session !== null);
  }

  get transportKind() {
    return this.bridgeAuthenticated ? "pages-owner-bridge" : this.cloudSession ? "same-origin-cloud" : this.connected ? "encrypted-relay" : "disconnected";
  }

  get sessionDiagnostic() { return this.cloudSessionDiagnostic; }

  async attach() {
    const generation = ++this.authenticationGeneration;
    this.cloudSession = null;
    this.bridgeAuthenticated = false;
    this.cloudSessionDiagnostic = null;
    // One primary edge origin (custom domain); the legacy bridge variable remains the fallback.
    const bridgeOrigin = validatePublicBridgeOrigin(process.env.NEXT_PUBLIC_MAHORAGA_PRIMARY_ORIGIN)
      ?? validatePublicBridgeOrigin(process.env.NEXT_PUBLIC_MAHORAGA_BRIDGE_ORIGIN);
    const currentOrigin = typeof window !== "undefined" ? window.location.origin : null;
    if (bridgeOrigin && currentOrigin) {
      try {
        const client = this.bridgeClient ?? new PagesOwnerBridgeClient(bridgeOrigin);
        this.bridgeClient = client;
        const state = await client.attach();
        if (generation !== this.authenticationGeneration) return null;
        this.bridgeAuthenticated = state === "authenticated";
        if (this.bridgeAuthenticated) return { sessionId: "pages-owner-bridge" };
        this.cloudSessionDiagnostic = { code: "cloud-owner-auth-required" };
        return null;
      } catch {
        if (generation !== this.authenticationGeneration) return null;
        this.bridgeAuthenticated = false;
        this.cloudSessionDiagnostic = { code: "cloud-session-unreachable" };
        return null;
      }
    }
    try {
      const { response, value } = await this.httpJson("/api/runtime/session", { credentials: "include", cache: "no-store" }, 10_000);
      if (generation !== this.authenticationGeneration) return null;
      if (!response.ok || value.authenticated !== true || typeof value.csrf !== "string") {
        this.cloudSessionDiagnostic = sessionDiagnostic(value);
        return null;
      }
      this.cloudSession = { csrf: value.csrf };
      return { sessionId: "same-origin-cloud" };
    } catch {
      if (generation !== this.authenticationGeneration) return null;
      this.cloudSessionDiagnostic = { code: "cloud-session-unreachable" };
      return null;
    }
  }

  async loginOwnerPin(pin: string) {
    const generation = ++this.authenticationGeneration;
    if (this.bridgeClient) {
      await this.bridgeClient.login(pin);
      this.requireAuthenticationGeneration(generation);
      this.bridgeAuthenticated = true;
      this.cloudSessionDiagnostic = null;
      return;
    }
    const { response, value } = await this.httpJson("/api/runtime/login", {
      method: "POST", credentials: "include", cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ownerPin: pin }),
    }, 10_000);
    this.requireAuthenticationGeneration(generation);
    if (!response.ok) throw relayError(publicCode(value.error));
    const attached = await this.attach();
    if (!attached || !this.cloudSession) throw relayError(this.cloudSessionDiagnostic?.code ?? "cloud-owner-auth-required");
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
    socket.addEventListener("close", () => { this.rejectPending("relay-disconnected"); this.notifyDisconnected(); });
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
      socket.addEventListener("close", () => { this.rejectPending("relay-disconnected"); this.notifyDisconnected(); });
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

  async uploadArtifact(file: File) {
    const generation = this.authenticationGeneration;
    if (this.bridgeAuthenticated && this.bridgeClient) {
      try {
        const result = await this.bridgeClient.uploadArtifact(file);
        this.requireAuthenticationGeneration(generation);
        return result;
      }
      catch (error) { this.handleBridgeError(error, generation); throw error; }
    }
    if (!this.cloudSession) throw relayError("relay-attachments-local-only");
    const { response, value } = await this.httpJson("/api/runtime/artifacts", {
      method: "POST", credentials: "include", cache: "no-store",
      headers: {
        "content-type": file.type || "application/octet-stream",
        "x-mahoraga-file-name": encodeURIComponent(file.name),
        "x-mahoraga-file-source": "picker",
        "x-mahoraga-csrf": this.cloudSession.csrf,
        "x-mahoraga-request-nonce": crypto.randomUUID(),
        "x-mahoraga-request-timestamp": String(Date.now()),
      },
      body: file,
    }, 60_000);
    this.checkCloudAuthentication(response, value, generation);
    if (!response.ok) throw relayError(publicCode(value.error));
    if (typeof value.artifactId !== "string" || !/^art-[a-f0-9-]+$/.test(value.artifactId)) throw relayError("cloud-artifact-receipt-invalid");
    return { id: value.artifactId };
  }

  async chat(input: JsonObject) {
    const cloudAuthenticated = this.bridgeAuthenticated || this.cloudSession !== null;
    if (!cloudAuthenticated && Array.isArray(input.attachmentIds) && input.attachmentIds.length > 0) throw relayError("relay-attachments-local-only");
    return this.call<RuntimeChatResult>("chat", cloudAuthenticated ? input : { ...input, attachmentIds: [] });
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
  /** Resolves to an unsubscribe function when the transport can push capability state (SSE); null when polling is required. */
  async subscribeCapabilityEvents(handler: (event: BridgeCapabilityEvent) => void): Promise<(() => void) | null> {
    if (!this.bridgeAuthenticated || !this.bridgeClient) return null;
    return this.bridgeClient.subscribeCapabilities(handler);
  }
  async capabilities() {
    const value = await this.call<{ capabilities?: RuntimeCapability[] }>("capabilities", {});
    const capabilities = value?.capabilities;
    if (capabilities === undefined) return [];
    if (!Array.isArray(capabilities) || capabilities.some((entry) => {
      if (!entry || typeof entry !== "object" || typeof entry.capability !== "string" || !entry.capability.trim()
        || typeof entry.routable !== "boolean" || (entry.enabled !== undefined && typeof entry.enabled !== "boolean")
        || !Array.isArray(entry.workerIds) || entry.workerIds.some((id) => typeof id !== "string")) return true;
      const textFields = [entry.provider, entry.canary, entry.costClass, entry.billingClass, entry.evidenceLevel];
      const nullableTextFields = [entry.workerId, entry.routingReason, entry.providerReasonCode, entry.lastObservedAt, entry.lastVerifiedAt];
      return textFields.some((field) => field !== undefined && typeof field !== "string")
        || nullableTextFields.some((field) => field != null && typeof field !== "string");
    })) throw relayError("runtime-capabilities-invalid");
    return capabilities;
  }
  async nativeGithubWorkspace() {
    return this.call<GithubWorkspaceSnapshot>("native-github-workspace", {});
  }
  async nativeGithubRepository() {
    return this.call<RuntimeGithubAppRepositoryProbe>("native-github-repository", {});
  }
  async nativeGithubPullRequest(proposal: RuntimeGithubAppPullRequestProposal) {
    return this.call<RuntimeGithubAppPullRequestReceipt>("native-github-pull-request", { ...proposal });
  }
  async nativeGithubMerge(proposal: RuntimeGithubAppMergeProposal) {
    return this.call<RuntimeGithubAppMergeReceipt>("native-github-merge", { ...proposal });
  }
  async nativeGithubMainWrite(proposal: RuntimeGithubAppDirectMainProposal) {
    return this.call<RuntimeGithubAppDirectMainReceipt>("native-github-main-write", { ...proposal });
  }
  async readiness() {
    const generation = this.authenticationGeneration;
    if (this.bridgeAuthenticated && this.bridgeClient) return this.call<unknown>("readiness", {});
    if (!this.cloudSession) throw relayError("cloud-readiness-unavailable");
    const { response, value } = await this.httpJson("/api/ready", { credentials:"include", cache:"no-store" },10_000);
    this.checkCloudAuthentication(response, value, generation);
    if (!response.ok) throw relayError("cloud-readiness-unavailable");
    return value;
  }
  async internalActivity() { return this.call<unknown>("internal-activity", {}); }
  async setInternalActivity(enabled: boolean) { return this.call<unknown>("internal-activity-control", { enabled }); }
  async operationsSnapshot() {
    return this.call<RuntimeOperationsSnapshot>("operations-snapshot", {});
  }
  async operationsAction(input: RuntimeOperationsActionInput) {
    return this.call<RuntimeOperationsActionResult>("operations-action", { ...input });
  }

  disconnect() {
    this.authenticationGeneration++;
    this.http.cancel();
    this.socket?.close(1000, "browser-disconnect");
    this.socket = null;
    this.session = null;
    this.deviceId = null;
    this.resumeCredential = null;
    this.expiresAt = null;
    this.pairing = null;
    this.revokeAcknowledgement = null;
    const bridge = this.bridgeClient;
    this.bridgeClient = null;
    this.bridgeAuthenticated = false;
    void bridge?.disconnect();
    this.cloudSession = null;
    this.cloudSessionDiagnostic = null;
    this.rejectPending("relay-disconnected");
    this.notifyDisconnected();
  }

  async revoke() {
    this.authenticationGeneration++;
    this.http.cancel();
    if (this.bridgeClient) {
      const bridge = this.bridgeClient;
      this.bridgeClient = null;
      this.bridgeAuthenticated = false;
      await bridge.disconnect();
      if (!this.socket && !this.session && !this.cloudSession) return;
    }
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
    const generation = this.authenticationGeneration;
    if (this.bridgeAuthenticated && this.bridgeClient) {
      try {
        const result = await this.bridgeClient.call<T>(type, payload);
        this.requireAuthenticationGeneration(generation);
        return result;
      }
      catch (error) { this.handleBridgeError(error, generation); throw error; }
    }
    if (this.cloudSession) {
      const { response, value } = await this.httpJson("/api/runtime/action", {
        method: "POST", credentials: "include", cache: "no-store",
        headers: { "content-type": "application/json", "x-mahoraga-csrf": this.cloudSession.csrf,
          "x-mahoraga-request-nonce": crypto.randomUUID(), "x-mahoraga-request-timestamp": String(Date.now()) },
        body: JSON.stringify({ type, payload }),
      }, 60_000);
      this.checkCloudAuthentication(response, value, generation);
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

  private httpJson(url: string, init: RequestInit, timeoutMs: number) {
    return this.http.run(async (signal) => {
      const response = await fetch(url, { ...init, signal });
      const decoded: unknown = await response.json();
      return { response, value: isObject(decoded) ? decoded : {} };
    }, timeoutMs);
  }

  private requireAuthenticationGeneration(generation: number) {
    if (generation !== this.authenticationGeneration) throw relayError("relay-disconnected");
  }

  private checkCloudAuthentication(response: Response, value: JsonObject, generation: number) {
    this.requireAuthenticationGeneration(generation);
    if (response.status === 401 || value.error === "cloud-owner-auth-required") {
      this.authenticationGeneration++;
      this.cloudSession = null;
      this.cloudSessionDiagnostic = { code: "cloud-owner-auth-required" };
      this.notifyDisconnected();
      throw relayError("cloud-owner-auth-required");
    }
  }

  private handleBridgeError(error: unknown, generation: number) {
    if (generation !== this.authenticationGeneration) return;
    if (error instanceof Error && error.message === "cloud-owner-auth-required") {
      this.authenticationGeneration++;
      this.bridgeAuthenticated = false;
      this.cloudSessionDiagnostic = { code: "cloud-owner-auth-required" };
      this.notifyDisconnected();
    }
  }

  private notifyDisconnected() {
    if (!this.connected) for (const listener of this.disconnectListeners) listener();
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
function sessionDiagnostic(value: JsonObject): CloudSessionDiagnostic {
  if (value.error === "cloud-owner-auth-required") return { code: "cloud-owner-auth-required" };
  const connection = isObject(value.connection) ? value.connection : null;
  const code = connection?.code;
  if (code === "cloud-runtime-degraded" || code === "cloud-runtime-contract-incompatible") return { code };
  return { code: "cloud-session-unavailable" };
}
function isObject(value: unknown): value is JsonObject { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
function publicCode(value: unknown) { const code = String(value ?? "relay-request-rejected").toLowerCase().replace(/[^a-z0-9.-]+/g, "-").slice(0, 80); return /^[a-z]/.test(code) ? code : "relay-request-rejected"; }
function relayError(code: string) { const error = new Error(code); error.name = "RuntimeRelayError"; return error; }
