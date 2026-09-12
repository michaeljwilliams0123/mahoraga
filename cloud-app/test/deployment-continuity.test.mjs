import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appRoot = new URL("../", import.meta.url);
const readApp = (path) => readFile(new URL(path, appRoot), "utf8").catch(() => "");
const readRepo = (path) => readFile(new URL(`../${path}`, appRoot), "utf8").catch(() => "");

test("Netlify fallback builds the existing Next workspace without changing authority", async () => {
  const [config, pkg] = await Promise.all([
    readRepo("netlify.toml"),
    readApp("package.json"),
  ]);

  assert.match(config, /base\s*=\s*"cloud-app"/);
  assert.match(config, /command\s*=\s*"npm run build"/);
  assert.match(config, /publish\s*=\s*"\.next"/);
  assert.match(pkg, /"next"\s*:\s*"16\.3\.3"/);
});

test("health route reports deployment identity from either supported host", async () => {
  const health = await readApp("app/api/health/route.ts");

  assert.match(health, /VERCEL_GIT_COMMIT_SHA/);
  assert.match(health, /COMMIT_REF/);
  assert.match(health, /VERCEL_URL/);
  assert.match(health, /DEPLOY_PRIME_URL/);
  assert.match(health, /provider/);
});

test("deployment continuity keeps private main authoritative while browser hosting stays replaceable", async () => {
  const [readme, cloudReadme] = await Promise.all([
    readRepo("README.md"),
    readApp("README.md"),
  ]);

  assert.match(readme, /GitHub `main` is the private code authority/i);
  assert.match(readme, /GitHub Pages is an optional derived static export/i);
  assert.match(cloudReadme, /GitHub is the private source\/evolution ledger/i);
  assert.match(cloudReadme, /presentation is host-neutral/i);
  for (const source of [readme, cloudReadme]) {
    assert.match(source, /Netlify/i);
    assert.match(source, /Vercel/i);
    assert.match(source, /non-canonical|paused|optional|fallback/i);
  }
});
