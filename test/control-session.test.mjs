import test from "node:test";
import assert from "node:assert/strict";
import {
  CONTROL_SESSION_COOKIE,
  authenticateLocalRequest,
  classifyApiRoute,
  cookieMutationOriginAllowed,
  createControlSessionManager,
  parseCookies,
  sessionCookie,
} from "../src/control-session.mjs";

test("bootstrap nonces are single-use and sessions slide until expiry", () => {
  let clock = 1_000_000;
  let seed = 0;
  const sessions = createControlSessionManager({ now: () => clock, random: (size) => Buffer.alloc(size, ++seed), idleTtlMs: 60_000, nonceTtlMs: 1_000 });
  const nonce = sessions.issueBootstrapNonce();
  const exchange = sessions.exchangeBootstrapNonce(nonce);
  assert.equal(exchange.authenticated, true);
  assert.throws(() => sessions.exchangeBootstrapNonce(nonce), /bootstrap-nonce-invalid/);
  assert.equal(sessions.authenticateCookie(exchange.sessionId), true);
  clock += 59_999;
  assert.equal(sessions.authenticateCookie(exchange.sessionId), true);
  clock += 60_001;
  assert.equal(sessions.authenticateCookie(exchange.sessionId), false);
});

test("expired bootstrap nonces fail closed", () => {
  let clock = 1_000_000;
  const sessions = createControlSessionManager({ now: () => clock, random: (size) => Buffer.alloc(size, 9), idleTtlMs: 60_000, nonceTtlMs: 1_000 });
  const nonce = sessions.issueBootstrapNonce();
  clock += 1_001;
  assert.throws(() => sessions.exchangeBootstrapNonce(nonce), /bootstrap-nonce-expired/);
});

test("route classification leaves only bounded identity and status public", () => {
  assert.equal(classifyApiRoute("GET", "/api/status"), "public");
  assert.equal(classifyApiRoute("GET", "/api/identity"), "public");
  assert.equal(classifyApiRoute("GET", "/api/tasks"), "sensitive-read");
  assert.equal(classifyApiRoute("POST", "/api/tasks"), "mutation");
  assert.equal(classifyApiRoute("GET", "/app.js"), "static");
});

test("cookie auth and same-origin mutation checks are explicit", () => {
  const sessions = createControlSessionManager({ random: (size) => Buffer.alloc(size, 4) });
  const { sessionId } = sessions.exchangeBootstrapNonce(sessions.issueBootstrapNonce());
  const request = { headers: { cookie: `${CONTROL_SESSION_COOKIE}=${sessionId}`, origin: "http://127.0.0.1:4782" } };
  assert.deepEqual(authenticateLocalRequest(request, { primaryToken: "x".repeat(32), sessions }), { authenticated: true, mechanism: "cookie", sessionId });
  assert.equal(cookieMutationOriginAllowed(request, "http://127.0.0.1:4782"), true);
  assert.equal(cookieMutationOriginAllowed({ headers: { ...request.headers, origin: "http://evil.invalid" } }, "http://127.0.0.1:4782"), false);
  assert.equal(parseCookies(sessionCookie(sessionId, 60_000))[CONTROL_SESSION_COOKIE], sessionId);
});
