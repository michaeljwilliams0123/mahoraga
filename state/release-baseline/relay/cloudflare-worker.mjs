import { createRelayBroker } from "./core.mjs";

const STATE_KEY = "relay-broker-v1";

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
    this.broker = null;
    this.roles = new Map();
    this.ready = this.#load();
  }

  async #load() {
    let snapshot = null;
    if (this.state?.storage && typeof this.state.storage.get === "function") snapshot = await this.state.storage.get(STATE_KEY);
    this.broker = createRelayBroker({ ownerIdentity: this.env.MAHORAGA_OWNER_IDENTITY, allowedOrigin: this.env.MAHORAGA_PAGES_ORIGIN, initialState: snapshot });
  }

  async fetch(request) {
    await this.ready;
    if (typeof WebSocketPair !== "function") return fixed(501, "websocket-runtime-required");
    const pair = new WebSocketPair();
    const client = pair[0]; const server = pair[1];
    server.accept();
    server.addEventListener("message", (event) => { void this.#message(server, request, event); });
    server.addEventListener("close", () => this.#closed(server, request));
    server.addEventListener("error", () => this.#closed(server, request));
    return new Response(null, { status: 101, webSocket: client });
  }

  async #message(socket, request, event) {
    let input;
    try { input = JSON.parse(String(event.data)); } catch { return send(socket, { accepted: false, error: "relay-message-invalid" }); }
    const owner = request.headers.get("cf-access-authenticated-user-email");
    const origin = request.headers.get("origin");
    try {
      let result;
      if (input.action === "pair-local") {
        exact(input, ["action", "code", "deviceId", "devicePublicKey", "pairingId"]);
        result = this.broker.pairLocal({ owner, deviceId: input.deviceId, pairingId: input.pairingId, code: input.code, devicePublicKey: input.devicePublicKey, socket });
        this.roles.set(socket, { sessionId: result.sessionId, side: "local" });
        send(socket, { type: "paired", accepted: true, result: { ...result, peerPublicKey: null } });
      } else if (input.action === "pair-remote") {
        exact(input, ["action", "code", "devicePublicKey", "pairingId"]);
        result = this.broker.pairRemote({ owner, origin, pairingId: input.pairingId, code: input.code, devicePublicKey: input.devicePublicKey, socket });
        const details = this.broker.sessionDetails(result.sessionId);
        this.roles.set(socket, { sessionId: result.sessionId, side: "remote" });
        send(socket, { type: "paired", accepted: true, result: { ...result, peerPublicKey: details.localPublicKey } });
        const local = this.findSocket(result.sessionId, "local");
        if (local) send(local, { type: "paired", accepted: true, result: { ...result, peerPublicKey: details.remotePublicKey } });
      } else if (input.action === "forward") {
        exact(input, ["action", "frame", "from", "sessionId"]);
        this.requireRole(socket, input.sessionId, input.from);
        result = this.broker.forward({ owner, origin, sessionId: input.sessionId, from: input.from, frame: input.frame });
        send(socket, { type: "forward-accepted", accepted: true, counter: result.counter, delivered: result.delivered });
      } else if (input.action === "replay") {
        exact(input, ["action", "afterCounter", "sessionId", "to"]);
        this.requireRole(socket, input.sessionId, input.to);
        result = this.broker.replay({ owner, origin, sessionId: input.sessionId, to: input.to, afterCounter: input.afterCounter });
        for (const frame of result) send(socket, { type: "frame", sessionId: input.sessionId, frame });
        send(socket, { type: "replay-complete", accepted: true, count: result.length });
      } else if (input.action === "revoke-device") {
        exact(input, ["action", "deviceId"]);
        result = this.broker.revokeDevice({ owner, deviceId: input.deviceId });
        send(socket, { type: "revoked", accepted: true, ...result });
      } else throw relayMessageError("relay-action-invalid");
      await this.#persist();
    } catch (error) {
      send(socket, { accepted: false, error: /^relay-[a-z0-9-]+$/.test(error?.code ?? "") ? error.code : "relay-request-rejected" });
    }
  }

  #closed(socket, request) {
    const role = this.roles.get(socket); if (!role || !this.broker) return;
    try { this.broker.unregisterSocket({ owner: request.headers.get("cf-access-authenticated-user-email"), origin: request.headers.get("origin"), sessionId: role.sessionId, side: role.side, socket }); } catch { /* socket cleanup is best effort */ }
    this.roles.delete(socket);
  }

  async #persist() {
    if (this.state?.storage && typeof this.state.storage.put === "function") await this.state.storage.put(STATE_KEY, this.broker.snapshot());
  }

  findSocket(sessionId, side) {
    for (const [socket, role] of this.roles) if (role.sessionId === sessionId && role.side === side) return socket;
    return null;
  }

  requireRole(socket, sessionId, side) {
    const role = this.roles.get(socket);
    if (!role || role.sessionId !== sessionId || role.side !== side) throw relayMessageError("relay-socket-role-invalid");
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
function exact(value, allowed) {
  if (!value || typeof value !== "object" || Object.keys(value).length !== allowed.length || Object.keys(value).some((key) => !allowed.includes(key))) throw relayMessageError("relay-message-fields-invalid");
}
function send(socket, value) { try { socket.send(JSON.stringify(value)); } catch { /* disconnected clients are cleaned up by close */ } }
function fixed(status, error, headers = {}) { return new Response(JSON.stringify({ error }), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } }); }
function relayMessageError(code) { const error = new TypeError(code); error.code = code; return error; }
