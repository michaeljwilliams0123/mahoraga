export function pagesOwnerBridgeFrameHeaders(pagesOrigin: string) {
  return new Headers({
    "cache-control": "no-store",
    "content-type": "text/html; charset=utf-8",
    "content-security-policy": `default-src 'none'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors ${pagesOrigin}; base-uri 'none'; form-action 'none'`,
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  });
}

export function renderPagesOwnerBridgeFrame(pagesOrigin: string) {
  const encodedOrigin = JSON.stringify(pagesOrigin).replaceAll("<", "\\u003c");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Mahoraga bridge</title></head><body><script>
(() => {
  "use strict";
  const PAGES_ORIGIN = ${encodedOrigin};
  const PROTOCOL_VERSION = 1;
  const TYPES = new Set(["bridge.status", "bridge.login", "bridge.action", "bridge.artifact", "bridge.disconnect"]);
  let bridgeSession = null;
  let bridgeCsrf = null;
  let bridgeExpiresAt = 0;

  function clearBridgeSession() {
    bridgeSession = null;
    bridgeCsrf = null;
    bridgeExpiresAt = 0;
  }
  function authenticated() {
    if (!bridgeSession || !bridgeCsrf || bridgeExpiresAt <= Date.now()) {
      clearBridgeSession();
      return false;
    }
    return true;
  }
  function exactKeys(value, allowed) {
    const keys = Object.keys(value);
    return keys.length === allowed.length && keys.every((key) => allowed.includes(key));
  }
  function isExactBridgeRequest(value) {
    if (!value || typeof value !== "object" || Array.isArray(value) || value.protocolVersion !== 1 || typeof value.requestId !== "string" || !/^[A-Za-z0-9_-]{8,96}$/.test(value.requestId) || !TYPES.has(value.type)) return false;
    if (value.type === "bridge.status" || value.type === "bridge.disconnect") return exactKeys(value, ["protocolVersion", "requestId", "type"]);
    if (value.type === "bridge.login") return exactKeys(value, ["protocolVersion", "requestId", "type", "pin"]) && typeof value.pin === "string" && /^\\d{4}$/.test(value.pin);
    if (value.type === "bridge.action") return exactKeys(value, ["protocolVersion", "requestId", "type", "action", "payload"]) && typeof value.action === "string" && value.payload && typeof value.payload === "object" && !Array.isArray(value.payload);
    if (value.type === "bridge.artifact") return exactKeys(value, ["protocolVersion", "requestId", "type", "file"]) && value.file instanceof Blob && typeof value.file.name === "string";
    return false;
  }
  function reply(requestId, ok, result, error) {
    const response = { protocolVersion: PROTOCOL_VERSION, requestId, ok };
    if (ok && result !== undefined) response.result = result;
    if (!ok && typeof error === "string") response.error = error;
    window.parent.postMessage(response, PAGES_ORIGIN);
  }
  function authHeaders(contentType) {
    if (!authenticated()) throw new Error("cloud-owner-auth-required");
    const headers = {
      "x-mahoraga-bridge-session": bridgeSession,
      "x-mahoraga-bridge-csrf": bridgeCsrf,
      "x-mahoraga-request-nonce": crypto.randomUUID(),
      "x-mahoraga-request-timestamp": String(Date.now()),
    };
    if (contentType) headers["content-type"] = contentType;
    return headers;
  }
  async function jsonResponse(response) {
    const value = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof value.error === "string" ? value.error : "cloud-gateway-unavailable");
    return value;
  }
  window.addEventListener("message", async (event) => {
    if (event.origin !== PAGES_ORIGIN || event.source !== window.parent) return;
    const request = event.data;
    if (!isExactBridgeRequest(request)) return;
    try {
      if (request.type === "bridge.status") {
        reply(request.requestId, true, { authenticated: authenticated() });
        return;
      }
      if (request.type === "bridge.disconnect") {
        clearBridgeSession();
        reply(request.requestId, true, { authenticated: false });
        return;
      }
      if (request.type === "bridge.login") {
        const value = await jsonResponse(await fetch("/api/runtime/pages-bridge/login", {
          method: "POST",
          cache: "no-store",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ownerPin: request.pin }),
        }));
        if (value.protocolVersion !== PROTOCOL_VERSION || typeof value.bridgeSession !== "string" || typeof value.csrf !== "string" || !Number.isFinite(value.expiresAt)) throw new Error("cloud-runtime-contract-incompatible");
        bridgeSession = value.bridgeSession;
        bridgeCsrf = value.csrf;
        bridgeExpiresAt = value.expiresAt;
        reply(request.requestId, true, { authenticated: true });
        return;
      }
      if (request.type === "bridge.action") {
        const value = await jsonResponse(await fetch("/api/runtime/pages-bridge/action", {
          method: "POST",
          cache: "no-store",
          headers: authHeaders("application/json"),
          body: JSON.stringify({ type: request.action, payload: request.payload }),
        }));
        reply(request.requestId, true, value);
        return;
      }
      if (request.type === "bridge.artifact") {
        const file = request.file;
        const headers = authHeaders(file.type || "application/octet-stream");
        headers["x-mahoraga-file-name"] = encodeURIComponent(file.name);
        headers["x-mahoraga-file-source"] = "picker";
        const value = await jsonResponse(await fetch("/api/runtime/pages-bridge/artifacts", { method: "POST", cache: "no-store", headers, body: file }));
        reply(request.requestId, true, value);
      }
    } catch (caught) {
      const code = caught instanceof Error && /^[a-z0-9.-]+$/.test(caught.message) ? caught.message : "cloud-gateway-unavailable";
      if (code === "cloud-owner-auth-required") clearBridgeSession();
      reply(request.requestId, false, undefined, code);
    }
  });
})();
</script></body></html>`;
}
