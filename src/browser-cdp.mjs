import { createHash } from "node:crypto";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
const MAX_CONSOLE_HASHES = 8;

export async function observeLoopbackControlCenter({ cdpBase, controlCenterUrl, artifactDirectory, taskId, retentionMs }, dependencies = {}) {
  assertLoopbackControlCenter(controlCenterUrl);
  const request = dependencies.request ?? cdpRequest;
  const connect = dependencies.connect ?? createCdpSession;
  const writeArtifact = dependencies.writeArtifact ?? writeScreenshotArtifact;
  const now = dependencies.now ?? (() => Date.now());
  const target = await request(cdpBase, `/json/new?${encodeURIComponent(controlCenterUrl)}`, { method: "PUT" });
  let session;
  try {
    session = await connect(target.webSocketDebuggerUrl);
    const evidence = observeEvidence(session);
    await session.call("Page.enable");
    await session.call("Runtime.enable");
    await session.call("Network.enable");
    await session.call("Log.enable");
    await session.call("Page.navigate", { url: controlCenterUrl });
    const { title, origin } = await waitForControlCenterDocument(session);
    if (title !== "Mahoraga Control Center" || origin !== "http://127.0.0.1:4782") throw new Error("browser-observation-mismatch");
    const screenshot = await session.call("Page.captureScreenshot", { format: "png" });
    const layout = await session.call("Page.getLayoutMetrics");
    const artifact = await writeArtifact({ artifactDirectory, taskId, data: screenshot?.result?.data, now: now() });
    await pruneBrowserArtifacts(artifactDirectory, retentionMs, now());
    return {
      verified: true,
      title,
      summary: "Browser Worker observed the loopback Control Center with bounded DOM, screenshot, network, and console evidence.",
      receiptMetadata: {
        operation: "browser-observe",
        titleSha256: hash(title),
        artifactSha256: artifact.sha256,
        screenshotWidth: dimension(layout?.result?.cssVisualViewport?.clientWidth),
        screenshotHeight: dimension(layout?.result?.cssVisualViewport?.clientHeight),
        networkRequests: evidence.networkRequests,
        networkFailures: evidence.networkFailures,
        networkStatus2xx: evidence.networkStatus["2xx"],
        networkStatus3xx: evidence.networkStatus["3xx"],
        networkStatus4xx: evidence.networkStatus["4xx"],
        networkStatus5xx: evidence.networkStatus["5xx"],
        consoleErrors: evidence.consoleErrors,
        consoleWarnings: evidence.consoleWarnings,
        consoleHashCount: evidence.consoleHashes.size,
      },
    };
  } finally {
    session?.close();
    await request(cdpBase, `/json/close/${target.id}`, { method: "PUT" }).catch(() => undefined);
  }
}

export async function cdpRequest(cdpBase, route, init = {}) {
  const response = await fetch(`${cdpBase}${route}`, { ...init, signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw new Error(`browser-cdp-${response.status}`);
  return response.json();
}

export async function createCdpSession(url, { WebSocketImpl = globalThis.WebSocket, timeoutMs = 5000 } = {}) {
  if (typeof WebSocketImpl !== "function") throw new Error("browser-cdp-websocket-unavailable");
  const socket = new WebSocketImpl(url);
  const pending = new Map();
  const listeners = new Map();
  let sequence = 0;
  await waitForSocket(socket, timeoutMs);
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(`browser-cdp-protocol-${message.error.code}`));
      else request.resolve(message);
      return;
    }
    for (const listener of listeners.get(message.method) ?? []) listener(message.params ?? {});
  });
  const rejectPending = () => {
    for (const request of pending.values()) request.reject(new Error("browser-cdp-closed"));
    pending.clear();
  };
  socket.addEventListener("close", rejectPending);
  socket.addEventListener("error", rejectPending);
  return {
    call(method, params = {}) {
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error("browser-cdp-timeout")); }, timeoutMs);
        pending.set(id, { resolve: (value) => { clearTimeout(timer); resolve(value); }, reject: (error) => { clearTimeout(timer); reject(error); } });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    on(method, listener) {
      const registered = listeners.get(method) ?? new Set();
      registered.add(listener);
      listeners.set(method, registered);
      return () => registered.delete(listener);
    },
    close() { socket.close(); },
  };
}

export function observeEvidence(session) {
  const evidence = {
    networkRequests: 0,
    networkFailures: 0,
    networkStatus: { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0 },
    consoleErrors: 0,
    consoleWarnings: 0,
    consoleHashes: new Set(),
  };
  session.on("Network.responseReceived", ({ response }) => {
    evidence.networkRequests += 1;
    const bucket = `${Math.floor(Number(response?.status ?? 0) / 100)}xx`;
    if (Object.hasOwn(evidence.networkStatus, bucket)) evidence.networkStatus[bucket] += 1;
  });
  session.on("Network.loadingFailed", () => { evidence.networkFailures += 1; });
  session.on("Runtime.consoleAPICalled", ({ type, args = [] }) => {
    if (type === "error") evidence.consoleErrors += 1;
    if (type === "warning") evidence.consoleWarnings += 1;
    collectConsoleHash(evidence.consoleHashes, args.map((item) => item?.value ?? item?.description ?? "").join(" "));
  });
  session.on("Log.entryAdded", ({ entry }) => {
    if (entry?.level === "error") evidence.consoleErrors += 1;
    if (entry?.level === "warning") evidence.consoleWarnings += 1;
    collectConsoleHash(evidence.consoleHashes, entry?.text ?? "");
  });
  return evidence;
}

export async function writeScreenshotArtifact({ artifactDirectory, taskId, data, now = Date.now() }) {
  if (!/^[a-z0-9-]{1,80}$/i.test(taskId)) throw new Error("browser-artifact-task-invalid");
  const bytes = Buffer.from(String(data ?? ""), "base64");
  if (bytes.length < 8 || bytes.length > MAX_SCREENSHOT_BYTES) throw new Error("browser-screenshot-size-invalid");
  await mkdir(artifactDirectory, { recursive: true });
  const file = path.join(artifactDirectory, `${taskId}-${now}.png`);
  await writeFile(file, bytes, { mode: 0o600 });
  return { sha256: hash(bytes), bytes: bytes.length };
}

export async function pruneBrowserArtifacts(artifactDirectory, retentionMs, now = Date.now()) {
  if (!Number.isInteger(retentionMs) || retentionMs < 60_000 || retentionMs > 7 * 24 * 60 * 60 * 1000) throw new Error("browser-artifact-retention-invalid");
  let artifacts;
  try { artifacts = await readdir(artifactDirectory, { withFileTypes: true }); } catch (error) { if (error?.code === "ENOENT") return 0; throw error; }
  let removed = 0;
  for (const artifact of artifacts) {
    if (!artifact.isFile() || !artifact.name.endsWith(".png")) continue;
    const file = path.join(artifactDirectory, artifact.name);
    if (now - (await stat(file)).mtimeMs <= retentionMs) continue;
    await rm(file, { force: true });
    removed += 1;
  }
  return removed;
}

export function assertLoopbackControlCenter(url) {
  if (url !== "http://127.0.0.1:4782/") throw new Error("browser-origin-not-approved");
}

function collectConsoleHash(hashes, value) {
  if (hashes.size < MAX_CONSOLE_HASHES && value) hashes.add(hash(String(value)));
}

function hash(value) { return createHash("sha256").update(value).digest("hex"); }
function dimension(value) { const size = Math.round(Number(value)); return Number.isInteger(size) && size >= 0 && size <= 100_000 ? size : 0; }
async function waitForControlCenterDocument(session, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const document = await session.call("Runtime.evaluate", {
      expression: "({title:document.title,origin:location.origin})",
      returnByValue: true,
    });
    const title = String(document?.result?.result?.value?.title ?? "");
    const origin = String(document?.result?.result?.value?.origin ?? "");
    if (title === "Mahoraga Control Center" && origin === "http://127.0.0.1:4782") return { title, origin };
    await delay(100);
  }
  return { title: "", origin: "" };
}
function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function waitForSocket(socket, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("browser-cdp-connect-timeout")), timeoutMs);
    socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("browser-cdp-connect-failed")); }, { once: true });
  });
}
