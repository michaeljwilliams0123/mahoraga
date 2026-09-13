import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const rootVercel = new URL("../vercel.json", import.meta.url);
const cloudVercel = new URL("../cloud-app/vercel.json", import.meta.url);
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

test("Railway-only production has no active Vercel deployment configuration", () => {
  assert.equal(existsSync(rootVercel), false);
  assert.equal(existsSync(cloudVercel), false);
  assert.match(readme, /Vercel:\*\* historical\/retired from the active production-completion path/);
});
