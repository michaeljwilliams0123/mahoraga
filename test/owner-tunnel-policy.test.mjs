import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

const root = new URL("../", import.meta.url);
let sequence = 0;

async function loadTypescript(relative) {
  const url = new URL(relative, root);
  const source = stripTypeScriptTypes(await readFile(url, "utf8"));
  return import("data:text/javascript," + encodeURIComponent(source + `\n// fixture ${sequence++}`));
}

test("owner-authorized authenticated tunnels are allowed while raw loopback exposure stays denied", async () => {
  const policy = await loadTypescript("operator-deck/src/lib/fleet/allowlist.ts");
  assert.equal(policy.isTunnelRequest("Open an authenticated Cloudflare Tunnel for Mahoraga."), true);
  assert.equal(policy.isDeniedTunnelRequest("Open an authenticated Cloudflare Tunnel for Mahoraga."), false);
  assert.equal(policy.isDeniedTunnelRequest("Use ngrok with owner authentication and a scoped gateway."), false);
  assert.equal(policy.isDeniedTunnelRequest("Expose 127.0.0.1:4782 publicly without authentication."), true);
  assert.equal(policy.isDeniedTunnelRequest("Create a generic public proxy to localhost:4783."), true);
});

test("operator policy no longer treats every inbound tunnel as a hard deny", async () => {
  const denies = await loadTypescript("operator-deck/src/lib/cockpit/denies.ts");
  assert.equal(denies.isHardDenyIntent("inbound-tunnel"), null);
  assert.equal(denies.isHardDenyIntent("unsafe-tunnel-exposure"), "unsafeTunnelExposure");
});

test("cloud cutover documents authenticated tunnel allowance without exposing raw runtime ports", async () => {
  const docs = await readFile(new URL("docs/CLOUDFLARE-WORKERS-CUTOVER.md", root), "utf8");
  assert.match(docs, /owner-authorized authenticated tunnel/i);
  assert.match(docs, /must not expose `127\.0\.0\.1:4782` or `127\.0\.0\.1:4783` directly/i);
  assert.doesNotMatch(docs, /Workers yes, Tunnel no/i);
});

test("operator surfaces route tunnels through posture instead of the retired hard-deny command", async () => {
  const [arsenal, operatorReadme, security] = await Promise.all([
    readFile(new URL("operator-deck/src/lib/fleet/arsenal.ts", root), "utf8"),
    readFile(new URL("operator-deck/README.md", root), "utf8"),
    readFile(new URL("SECURITY.md", root), "utf8"),
  ]);
  assert.doesNotMatch(arsenal, /id:\s*"deny-tunnel"/);
  assert.match(arsenal, /id:\s*"tunnel-posture"/);
  assert.match(operatorReadme, /Owner-authorized authenticated tunnels are permitted/i);
  assert.match(security, /Owner-authorized authenticated\s+tunnels/i);
});
