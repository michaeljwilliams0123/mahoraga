import test from "node:test";
import assert from "node:assert/strict";
import { classifyGateway, classifyLocal, classifyWorkspace, observeExecutionSurfaces } from "../scripts/execution-surface-smoke.ts";

const SHA = "a".repeat(40);
const local = { product: "Mahoraga", version: "3.6.0", capabilities: [{ capability: "system.health", availability: "healthy" }] };
const staticShell = { ok: true, product: "Mahoraga", deployment: { provider: "cloudflare-workers", commitSha: SHA },
  boundaries: { localDeviceMutationAllowed: false } };
const response = (value: unknown, { status = 200, location, type = "application/json" }: {
  status?: number; location?: string; type?: string;
} = {}) => new Response(type === "application/json" ? JSON.stringify(value) : String(value),
  { status, headers: { "content-type": type, ...(location ? { location } : {}) } });
const gatewayLogin = "https://login-zone.cloudflareaccess.com/cdn-cgi/access/login";
function fetchFixture(url: string, options?: RequestInit): Promise<Response> {
  if (url.includes(":4782") || url.includes(":4783")) return Promise.resolve(response(local));
  if (url.endsWith("/api/health.json")) return Promise.resolve(response(staticShell));
  if (url === "https://pages.example/") return Promise.resolve(response("<title>Mahoraga</title>", { type: "text/html" }));
  if (url === "https://gateway.example/") {
    assert.equal(options?.redirect, "manual");
    return Promise.resolve(response("", { status: 302, location: gatewayLogin, type: "text/html" }));
  }
  throw new Error("unexpected-url");
}
const urls = { pages: "https://pages.example/", workspace: "https://workspace.example", gateway: "https://gateway.example" };

test("local health requires real Mahoraga 3.6.0 readiness, not a bare HTTP 200", () => {
  assert.equal(classifyLocal({ status: 200, value: local }), "healthy");
  assert.equal(classifyLocal({ status: 200, value: { ...local, version: "7.0.0-alpha.2" } }), "offline-or-degraded");
  assert.equal(classifyLocal({ status: 200, value: { ...local, capabilities: [] } }), "offline-or-degraded");
});
test("workspace must have matching exact SHA and forbid browser device mutations", () => {
  assert.equal(classifyWorkspace({ status: 200, value: staticShell }, SHA), "verified-static-shell");
  assert.equal(classifyWorkspace({ status: 200, value: staticShell }, "b".repeat(40)), "workspace-unverified");
  assert.equal(classifyWorkspace({ status: 200, value: { ...staticShell, boundaries: { localDeviceMutationAllowed: true } } }, SHA), "workspace-unverified");
});
test("Cloudflare Access login is protection, not authenticated execution", () => {
  assert.equal(classifyGateway({ status: 302, location: gatewayLogin }), "access-protected");
  assert.equal(classifyGateway({ status: 302, location: "https://evil.example/signin" }), "access-boundary-unverified");
  assert.equal(classifyGateway({ status: 200, body: "<title>Mahoraga</title>" }), "access-boundary-unverified");
  assert.equal(classifyGateway({ status: 403, body: "denied" }), "denied-unverified");
});
test("surface smoke reports only observable surfaces; never claims authenticated mobile execution", async () => {
  const report = await observeExecutionSurfaces({ fetchImpl: fetchFixture, expectedSha: SHA, urls });
  assert.equal(report.probePassed, true);
  assert.equal(report.cloud.ownerGateway, "access-protected");
  assert.equal(report.cloud.authenticatedExecution, "not-tested");
  assert.equal(report.cloud.physicalMobileSession, "not-tested");
});
test("one disconnected local port fails the smoke without changing production state", async () => {
  const failingFetch = (url: string, options?: RequestInit): Promise<Response> =>
    url.includes(":4783") ? Promise.reject(new Error("offline")) : fetchFixture(url, options);
  const report = await observeExecutionSurfaces({ fetchImpl: failingFetch, expectedSha: SHA, urls });
  assert.equal(report.probePassed, false);
  assert.equal(report.local["4783"], "offline-or-degraded");
});
