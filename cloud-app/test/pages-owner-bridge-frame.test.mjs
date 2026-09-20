import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

const root = new URL("../", import.meta.url);
const read = (file) => readFile(new URL(file, root), "utf8");

async function frameModule() {
  const source = stripTypeScriptTypes(await read("lib/pages-owner-bridge-frame.ts"));
  return import(`data:text/javascript,${encodeURIComponent(source)}`);
}

test("bridge frame enforces exact parent origin/source and keeps authentication material in memory", async () => {
  const frame = await frameModule();
  const html = frame.renderPagesOwnerBridgeFrame("https://michaeljwilliams0123.github.io");

  assert.match(html, /event\.origin !== PAGES_ORIGIN/);
  assert.match(html, /event\.source !== window\.parent/);
  assert.match(html, /protocolVersion !== 1/);
  assert.match(html, /bridge\.status/);
  assert.match(html, /bridge\.login/);
  assert.match(html, /bridge\.action/);
  assert.match(html, /bridge\.artifact/);
  assert.match(html, /bridge\.disconnect/);
  assert.match(html, /let bridgeSession = null/);
  assert.match(html, /let bridgeCsrf = null/);
  assert.match(html, /let bridgeExpiresAt = 0/);
  assert.match(html, /window\.parent\.postMessage\(reply, PAGES_ORIGIN\)/);
  assert.doesNotMatch(html, /localStorage|sessionStorage|document\.cookie/);
});

test("bridge frame CSP is narrowly embeddable only by the configured Pages origin", async () => {
  const frame = await frameModule();
  const headers = frame.pagesOwnerBridgeFrameHeaders("https://michaeljwilliams0123.github.io");
  const csp = headers.get("content-security-policy") ?? "";
  assert.match(csp, /^default-src 'none';/);
  assert.match(csp, /script-src 'unsafe-inline'/);
  assert.match(csp, /connect-src 'self'/);
  assert.match(csp, /frame-ancestors https:\/\/michaeljwilliams0123\.github\.io/);
  assert.equal((csp.match(/frame-ancestors/g) ?? []).length, 1);
  assert.equal(headers.get("x-frame-options"), null);
  assert.equal(headers.get("cache-control"), "no-store");
});

test("only the bridge frame escapes the global DENY framing policy", async () => {
  const [route, config] = await Promise.all([
    read("app/api/runtime/pages-bridge/frame/route.ts"),
    read("next.config.ts"),
  ]);
  assert.match(route, /renderPagesOwnerBridgeFrame/);
  assert.match(route, /pagesOwnerBridgeFrameHeaders/);
  assert.match(route, /MAHORAGA_PAGES_ORIGIN/);
  assert.match(config, /api\/runtime\/pages-bridge\/frame/);
  assert.match(config, /X-Frame-Options/);
  assert.match(config, /frame-ancestors 'none'/);
});
