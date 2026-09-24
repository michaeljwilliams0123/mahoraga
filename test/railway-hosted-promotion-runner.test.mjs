import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";

test("Railway rollback promotion uses hosted Linux without weakening exact-SHA authority", async () => {
  const source = await readFile(path.join(ROOT, ".github", "workflows", "railway-promote.yml"), "utf8");
  assert.match(source, /runs-on:\s*ubuntu-latest/i);
  assert.doesNotMatch(source, /runs-on:\s*\[self-hosted,\s*linux,\s*x64\]/i);
  assert.match(source, /RAILWAY_PROJECT_TOKEN:\s*\$\{\{\s*secrets\.RAILWAY_PROJECT_TOKEN\s*\}\}/);
  assert.match(source, /workflow_dispatch:/);
  assert.doesNotMatch(source, /workflow_run:/);
  assert.match(source, /github\.actor == github\.repository_owner/);
  assert.match(source, /github\.ref == 'refs\/heads\/main'/);
  assert.match(source, /node scripts\/railway-exact-sha-promotion\.mjs promote/);
});
