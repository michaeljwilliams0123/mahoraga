import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";
import { ESSENTIAL_FILES } from "../src/repair.mjs";

const retiredWorkflow = ".github/workflows/chromebook-control-plane.yml";

async function exists(relative) {
  return Boolean(await stat(path.join(ROOT, relative)).catch(() => null));
}

test("Chromebook control plane remains retired from the live workflow set and repair baseline contract", async () => {
  assert.equal(await exists(retiredWorkflow), false);
  assert.equal(ESSENTIAL_FILES.includes(retiredWorkflow), false);
});

test("retirement documentation preserves the supported control surfaces", async () => {
  const source = await readFile(path.join(ROOT, "docs", "retired-providers.md"), "utf8");
  assert.match(source, /chromebook-control-plane\.yml` removed/i);
  assert.match(source, /GitHub, Vercel workspace, Codex builder, local desktop, repository worker/);
  assert.doesNotMatch(source, /OPENAI_API_KEY|ngrok|public listener/i);
});
