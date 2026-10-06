import { normalizeWorkspaceOrigin } from "./workspace-origins.ts";

/** Access authenticates the frame at the gateway; no credential is sent to its parent. */
export function renderCloudflareBridgeFrame(pagesOrigin: string | readonly string[]): string {
 const origins = typeof pagesOrigin === 'string' ? [pagesOrigin] : [...pagesOrigin];
 if (origins.length < 1 || origins.length > 3 || origins.some(value => normalizeWorkspaceOrigin(value) !== value)) throw new Error('gateway-workspace-origin-invalid');
 const origin = JSON.stringify(origins).replaceAll('<', '\\u003c');
 return `<!doctype html><html><head><meta charset="utf-8"><title>Mahoraga bridge</title></head><body><script>
(() => {
 "use strict";
 const WORKSPACE_ORIGINS = new Set(${origin});
 const PROTOCOL_VERSION = 1;
 let authenticated = true;
 function exact(value, keys) { return Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key)); }
 function valid(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.protocolVersion !== 1 || typeof value.requestId !== "string" || !/^[A-Za-z0-9_-]{8,96}$/.test(value.requestId)) return false;
  const base = ["protocolVersion", "requestId", "type"];
  if (value.type === "bridge.status" || value.type === "bridge.disconnect" || value.type === "bridge.subscribe" || value.type === "bridge.unsubscribe") return exact(value, base);
  if (value.type === "bridge.login") return exact(value, [...base,"pin"]) && typeof value.pin === "string" && /^\\d{4}$/.test(value.pin);
  if (value.type === "bridge.action") return exact(value, [...base,"action","payload"]) && typeof value.action === "string" && /^[a-z][a-z0-9-]{0,63}$/.test(value.action) && value.payload && typeof value.payload === "object" && !Array.isArray(value.payload);
  if (value.type === "bridge.artifact") return exact(value, [...base,"file"]) && value.file instanceof Blob && typeof value.file.name === "string";
  return false;
 }
 function reply(targetOrigin, requestId, ok, result, error) {
  const value = { protocolVersion: PROTOCOL_VERSION, requestId, ok };
  if (ok) value.result = result;
  else value.error = error;
  window.parent.postMessage(value, targetOrigin);
 }
 let source = null; let subscriberOrigin = null;
 function closeSource() { if (source) { source.close(); source = null; } }
 function emit(event, data) { if (subscriberOrigin) window.parent.postMessage({ protocolVersion: PROTOCOL_VERSION, type: "bridge.event", event, data }, subscriberOrigin); }
 function subscribe(origin) {
  closeSource(); subscriberOrigin = origin;
  const stream = new EventSource("/api/runtime/pages-bridge/events", { withCredentials: true }); source = stream;
  stream.onopen = () => emit("open", {});
  stream.addEventListener("capabilities", message => { try { const value = JSON.parse(message.data); emit("capabilities", { capabilities: Array.isArray(value.capabilities) ? value.capabilities : [] }); } catch { /* malformed frames are dropped */ } });
  stream.addEventListener("heartbeat", () => emit("heartbeat", {}));
  stream.addEventListener("reconnect", () => { if (source === stream) { closeSource(); emit("closed", {}); } });
  stream.onerror = () => { if (source === stream) { closeSource(); emit("error", {}); } };
 }
 async function action(request) {
  const body = JSON.stringify({ type: request.action, payload: request.payload });
  if (new TextEncoder().encode(body).byteLength > 32768) throw new Error("cloud-action-too-large");
  const controller = new AbortController(); let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => { reject(new Error("cloud-request-timeout")); controller.abort(); }, 60000); });
  try {
   return await Promise.race([timeout, (async () => {
    const response = await fetch("/api/runtime/pages-bridge/action", { method:"POST", credentials:"include", cache:"no-store", signal:controller.signal, headers:{"content-type":"application/json"}, body });
    if (response.status === 401 || response.status === 403) { authenticated = false; throw new Error("cloud-owner-auth-required"); }
    const value = await response.json();
    if (!response.ok) throw new Error(value && typeof value.error === "string" && /^[a-z][a-z0-9.-]{0,79}$/.test(value.error) ? value.error : "cloud-gateway-unavailable");
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("cloud-runtime-contract-incompatible");
    return value;
   })()]);
  } finally { clearTimeout(timer); }
 }
 window.addEventListener("message", async event => {
  if (!WORKSPACE_ORIGINS.has(event.origin) || event.source !== window.parent || !valid(event.data)) return;
  const request = event.data;
  try {
   if (request.type === "bridge.status") { reply(event.origin, request.requestId, true, { authenticated }); return; }
   if (request.type === "bridge.unsubscribe") { closeSource(); subscriberOrigin = null; reply(event.origin, request.requestId, true, { subscribed: false }); return; }
   if (request.type === "bridge.disconnect") { authenticated = false; closeSource(); subscriberOrigin = null; reply(event.origin, request.requestId, true, { authenticated:false }); return; }
   if (!authenticated) throw new Error("cloud-owner-auth-required");
   if (request.type === "bridge.subscribe") { subscribe(event.origin); reply(event.origin, request.requestId, true, { subscribed: true }); return; }
   if (request.type === "bridge.login") { reply(event.origin, request.requestId, true, { authenticated: true }); return; }
   if (request.type === "bridge.action") { reply(event.origin, request.requestId, true, await action(request)); return; }
   throw new Error("cloud-native-artifact-unavailable");
  } catch (error) {
   const code = error instanceof Error && /^[a-z][a-z0-9.-]{0,79}$/.test(error.message) ? error.message : "cloud-gateway-unavailable";
   reply(event.origin, request.requestId, false, undefined, code);
  }
 });
})();
</script></body></html>`;
}
