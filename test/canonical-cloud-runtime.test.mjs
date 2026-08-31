import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";
import { snapshotStaticAssets } from "../src/server.mjs";

const digest = (value) => createHash("sha256").update(value).digest("hex");

test("loopback snapshots the exact canonical cloud application", async () => {
  const assets = snapshotStaticAssets();
  for (const [route, file] of [["/", "index.html"], ["/app.js", "app.js"], ["/styles.css", "styles.css"], ["/skills.css", "skills.css"], ["/mark.svg", "mark.svg"], ["/site.webmanifest", "site.webmanifest"]]) {
    assert.equal(digest(assets.get(route).body), digest(await readFile(path.join(ROOT, "cloud", file))), route);
  }
});

test("canonical browser transports are fixed, replayable, cancellable, and memory-only", async () => {
  const [html, app] = await Promise.all([readFile(path.join(ROOT, "cloud", "index.html"), "utf8"), readFile(path.join(ROOT, "cloud", "app.js"), "utf8")]);
  assert.match(html, /mahoraga-ui-version/);
  assert.match(html, /id="session-select"/);
  assert.match(html, /id="cancel-run"/);
  assert.match(html, /id="pair-code"/);
  assert.match(app, /class LoopbackTransport/);
  assert.match(app, /class RelayTransport/);
  assert.match(app, /class OfflinePreviewTransport/);
  assert.match(app, /\/api\/v2\/runs/);
  assert.match(app, /text\/event-stream|parseSse/);
  assert.match(app, /async cancel/);
  assert.match(app, /wss:\/\/relay\.mahoraga\.app/);
  assert.doesNotMatch(app, /constructor\([^)]*(?:baseUrl|endpoint|host|port)/);
  assert.doesNotMatch(`${html}\n${app}`, /localStorage|sessionStorage|indexedDB|document\.cookie/);
});

test("canonical rendering uses text nodes for remote event values", async () => {
  const app = await readFile(path.join(ROOT, "cloud", "app.js"), "utf8");
  assert.match(app, /textContent\s*=/);
  assert.doesNotMatch(app, /innerHTML\s*=/);
  assert.match(app, /renderRunEvent/);
  assert.match(app, /getImprovement/);
  assert.match(app, /capabilities/);
});
