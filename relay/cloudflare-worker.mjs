import { createRelayBroker } from "./core.mjs";

export function createCloudflareRelayHandler() {
  return Object.freeze({
    async fetch(request, env) {
      const url = new URL(request.url);
      if (url.pathname !== "/pair" || url.search) return fixed(404, "not-found");
      if (!validEnvironment(env)) return fixed(503, "relay-environment-unavailable");
      const owner = request.headers.get("cf-access-authenticated-user-email");
      if (owner !== env.MAHORAGA_OWNER_IDENTITY) return fixed(403, "owner-required");
      if (request.headers.get("origin") !== env.MAHORAGA_PAGES_ORIGIN) return fixed(403, "origin-required");
      if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return fixed(426, "websocket-required", { Upgrade: "websocket" });
      if (!env.RELAY_SESSIONS || typeof env.RELAY_SESSIONS.idFromName !== "function") return fixed(503, "relay-session-namespace-unavailable");
      const id = env.RELAY_SESSIONS.idFromName(owner);
      return env.RELAY_SESSIONS.get(id).fetch(request);
    },
  });
}

export class RelayDurableObject {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.broker = createRelayBroker({ ownerIdentity: env.MAHORAGA_OWNER_IDENTITY, allowedOrigin: env.MAHORAGA_PAGES_ORIGIN });
  }

  async fetch(request) {
    if (typeof WebSocketPair !== "function") return fixed(501, "websocket-runtime-required");
    const pair = new WebSocketPair();
    const client = pair[0]; const server = pair[1];
    server.accept();
    server.addEventListener("message", (event) => this.#message(server, request, event));
    return new Response(null, { status: 101, webSocket: client });
  }

  #message(socket, request, event) {
    let input;
    try { input = JSON.parse(String(event.data)); } catch { return socket.send(JSON.stringify({ accepted: false, error: "relay-message-invalid" })); }
    const owner = request.headers.get("cf-access-authenticated-user-email");
    const origin = request.headers.get("origin");
    try {
      let result;
      if (input.action === "pair-local") result = this.broker.pairLocal({ owner, deviceId: input.deviceId, pairingId: input.pairingId });
      else if (input.action === "pair-remote") result = this.broker.pairRemote({ owner, origin, pairingId: input.pairingId });
      else if (input.action === "forward") result = this.broker.forward({ owner, origin, sessionId: input.sessionId, from: input.from, frame: input.frame });
      else if (input.action === "replay") result = this.broker.replay({ owner, origin, sessionId: input.sessionId, to: input.to, afterCounter: input.afterCounter });
      else if (input.action === "revoke-device") result = this.broker.revokeDevice({ owner, deviceId: input.deviceId });
      else throw relayMessageError("relay-action-invalid");
      socket.send(JSON.stringify({ accepted: true, result }));
    } catch (error) {
      socket.send(JSON.stringify({ accepted: false, error: /^relay-[a-z0-9-]+$/.test(error?.code ?? "") ? error.code : "relay-request-rejected" }));
    }
  }
}

const handler = createCloudflareRelayHandler();
export default handler;

function validEnvironment(env) {
  try {
    if (!env || typeof env.MAHORAGA_OWNER_IDENTITY !== "string") return false;
    const origin = new URL(env.MAHORAGA_PAGES_ORIGIN);
    return origin.protocol === "https:" && origin.origin === env.MAHORAGA_PAGES_ORIGIN;
  } catch { return false; }
}
function fixed(status, error, headers = {}) { return new Response(JSON.stringify({ error }), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } }); }
function relayMessageError(code) { const error = new TypeError(code); error.code = code; return error; }
