import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const rootVercel = new URL("../vercel.json", import.meta.url);
const cloudVercel = new URL("../cloud-app/vercel.json", import.meta.url);
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const readme = read("README.md");

test("retired Vercel stays silent while GitHub Pages owns the browser UI", () => {
  assert.equal(existsSync(rootVercel), false);
  assert.equal(existsSync(cloudVercel), true);

  const config = JSON.parse(readFileSync(cloudVercel, "utf8"));
  assert.equal(config.git?.deploymentEnabled, false);
  assert.equal(config.github?.silent, true);
  assert.equal(config.framework, undefined);
  assert.equal(config.buildCommand, undefined);
  assert.equal(config.installCommand, undefined);
  assert.equal(config.outputDirectory, undefined);
  assert.match(readme, /Vercel:\*\* historical\/retired from the active production-completion path/);
});

test("GitHub Pages is canonical browser UI while Railway remains runtime fallback only", () => {
  const references = {
    versions: read("operator-deck/src/lib/fleet/versions.ts"),
    execute: read("operator-deck/src/lib/fleet/execute.server.ts"),
    allowlist: read("operator-deck/src/lib/fleet/allowlist.ts"),
    browserWorker: read("src/browser-worker.mjs"),
    manifest: read("mahoraga.manifest.json"),
  };

  assert.match(references.versions, /APP_HOST = "GitHub Pages"/);
  assert.match(references.versions, /CLOUD_APP_URL = "https:\/\/michaeljwilliams0123\.github\.io\/mahoraga\/"/);
  assert.match(references.versions, /GitHub Pages is the canonical browser UI/);
  assert.match(references.versions, /Railway is migration fallback only until retirement/);
  assert.match(references.execute, /Conversation UI", value: "GitHub Pages workspace"/);
  assert.match(readme, /\[Open Mahoraga\]\(https:\/\/michaeljwilliams0123\.github\.io\/mahoraga\/\)/);

  assert.match(references.allowlist, /"mahoraga-runtime-main-production\.up\.railway\.app"/);
  assert.match(references.browserWorker, /canonical Railway workspace/);
  assert.match(references.manifest, /canonical Railway workspace/);

  for (const [sourcePath, source] of Object.entries(references)) {
    assert.doesNotMatch(source, /mahoraga-cloud-workspace\.vercel\.app|unified Vercel workspace/, sourcePath);
  }
});
