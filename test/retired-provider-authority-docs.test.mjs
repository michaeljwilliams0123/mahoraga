import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("active gateway contract never treats Railway as its execution upstream", () => {
  const source = read("docs/CLOUD-GATEWAY-CONTRACT.md");
  assert.match(source, /canonical Cloudflare runtime/);
  assert.match(source, /Railway has zero route, influence, fallback, or authority/);
  assert.doesNotMatch(source, /fixed Railway upstream/i);
});

test("cloud operations identify only Cloudflare as the canonical interface", () => {
  const source = read("docs/CLOUD-AUTONOMY-OPERATIONS.md");
  assert.match(source, /\| Cloud interface \| Cloudflare owner gateway and canonical execution runtime \|/);
  assert.doesNotMatch(source, /\| Cloud interface \| Railway/i);
  assert.doesNotMatch(source, /Cloud work occurs in GitHub, GitLab, Railway/i);
});

test("cloud browser contract does not advertise a retired Railway workspace", () => {
  const source = read("docs/CLOUD-BROWSER-AND-DATA-EVAL.md");
  assert.match(source, /Access-protected Cloudflare workspace alone is not evidence/);
  assert.doesNotMatch(source, /canonical\s+Railway workspace/i);
});

test("current browser entry and historical rollback documentation remain distinct", () => {
  const deployment = read("docs/CLOUD-ONLY-DEPLOYMENT.md");
  const readme = read("README.md");
  assert.match(deployment, /GitHub Pages is a derived static\/provenance mirror/);
  assert.doesNotMatch(deployment, /GitHub Pages is the current browser presentation/i);
  assert.match(readme, /Historical Railway production model \(archived evidence; not a rollback option\)/);
  assert.doesNotMatch(readme, /Historical Railway production model \(rollback reference\)/);
  assert.doesNotMatch(readme, /retained for rollback\/evidence only/i);
});
