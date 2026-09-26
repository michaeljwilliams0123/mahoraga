"use client";

type BridgeReply = { protocolVersion: 1; requestId: string; ok: boolean; result?: unknown; error?: string };
type Pending = { resolve: (value: unknown) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout> };

const FRAME_TIMEOUT_MS = 10_000;
const REQUEST_TIMEOUT_MS = 10_000;
const ACTION_TIMEOUT_MS = 60_000;

export function validatePublicBridgeOrigin(value: string | undefined) {
  if (!value?.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) return null;
    return parsed.origin;
  } catch { return null; }
}

export class PagesOwnerBridgeClient {
  private frame: HTMLIFrameElement | null = null;
  private frameReady: Promise<void> | null = null;
  private pending = new Map<string, Pending>();
  private listening = false;
  private readonly bridgeOrigin: string;

  constructor(bridgeOrigin: string) { this.bridgeOrigin = bridgeOrigin; }

  async attach(): Promise<"authenticated" | "owner-auth-required"> {
    await this.ensureFrame();
    const value = await this.request<{ authenticated?: boolean }>({ type: "bridge.status" });
    return value.authenticated === true ? "authenticated" : "owner-auth-required";
  }

  async login(pin: string) {
    if (!/^\d{4}$/.test(pin)) throw bridgeError("cloud-owner-login-required");
    await this.ensureFrame();
    const value = await this.request<{ authenticated?: boolean }>({ type: "bridge.login", pin });
    if (value.authenticated !== true) throw bridgeError("cloud-owner-auth-required");
  }

  async call<T>(type: string, payload: Record<string, unknown>) {
    await this.ensureFrame();
    return this.request<T>({ type: "bridge.action", action: type, payload });
  }

  async uploadArtifact(file: File) {
    await this.ensureFrame();
    const value = await this.request<{ artifactId?: string }>({ type: "bridge.artifact", file });
    if (typeof value.artifactId !== "string" || !/^art-[a-f0-9-]+$/.test(value.artifactId)) throw bridgeError("cloud-artifact-receipt-invalid");
    return { id: value.artifactId };
  }

  async disconnect() {
    try {
      if (this.frame?.contentWindow) await this.request({ type: "bridge.disconnect" });
    } catch { /* best-effort in-memory bridge teardown */ }
    this.destroy();
  }

  private ensureFrame() {
    if (this.frameReady) return this.frameReady;
    if (typeof document === "undefined" || typeof window === "undefined") return Promise.reject(bridgeError("cloud-session-unreachable"));
    if (!this.listening) {
      window.addEventListener("message", this.onMessage);
      this.listening = true;
    }
    const iframe = document.createElement("iframe");
    iframe.src = `${this.bridgeOrigin}/api/runtime/pages-bridge/frame`;
    iframe.hidden = true;
    iframe.referrerPolicy = "no-referrer";
    iframe.setAttribute("aria-hidden", "true");
    iframe.tabIndex = -1;
    this.frame = iframe;
    this.frameReady = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(bridgeError("cloud-session-unreachable")), FRAME_TIMEOUT_MS);
      iframe.addEventListener("load", () => { clearTimeout(timer); resolve(); }, { once: true });
      iframe.addEventListener("error", () => { clearTimeout(timer); reject(bridgeError("cloud-session-unreachable")); }, { once: true });
      document.body.appendChild(iframe);
    });
    return this.frameReady;
  }

  private request<T = Record<string, unknown>>(body: Record<string, unknown>) {
    const target = this.frame?.contentWindow;
    if (!target) return Promise.reject(bridgeError("cloud-session-unreachable"));
    const requestId = `breq-${crypto.randomUUID()}`;
    const request = { protocolVersion: 1, requestId, ...body };
    const timeoutMs = body.type === "bridge.action" ? ACTION_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
    const result = new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(bridgeError("cloud-session-unreachable")); }, timeoutMs);
      this.pending.set(requestId, { resolve: resolve as (value: unknown) => void, reject, timer });
    });
    target.postMessage(request, this.bridgeOrigin);
    return result;
  }

  private onMessage = (event: MessageEvent) => {
    if (event.origin !== this.bridgeOrigin || event.source !== this.frame?.contentWindow) return;
    const reply = event.data as Partial<BridgeReply>;
    if (!reply || reply.protocolVersion !== 1 || typeof reply.requestId !== "string" || typeof reply.ok !== "boolean") return;
    const pending = this.pending.get(reply.requestId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(reply.requestId);
    if (!reply.ok) pending.reject(bridgeError(typeof reply.error === "string" ? reply.error : "cloud-gateway-unavailable"));
    else pending.resolve(reply.result ?? {});
  };

  private destroy() {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(bridgeError("cloud-session-unreachable")); }
    this.pending.clear();
    this.frame?.remove();
    this.frame = null;
    this.frameReady = null;
    if (this.listening && typeof window !== "undefined") window.removeEventListener("message", this.onMessage);
    this.listening = false;
  }
}

function bridgeError(code: string) { return new Error(code); }
