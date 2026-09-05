import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";

test("cloud-cycle CLI reuses one local-reasoner probe and stays inspect-only", async () => {
  const source = await readFile(path.join(ROOT, "src", "cloud-cycle-worker.mjs"), "utf8");
  const cliStart = source.lastIndexOf("if (typeof process.argv[1] === \"string\"");
  assert.notEqual(cliStart, -1);
  const cliSource = source.slice(cliStart);

  assert.doesNotMatch(cliSource, /observeLocalReasonerReady/);
  assert.match(cliSource, /probeLocalReasoner\(\{ timeoutMs: 750 \}\)/);
  assert.match(cliSource, /creditFree\.probe\s*=/);
  assert.match(cliSource, /localReasonerReady\s*=\s*creditFree\.probe\?\.verified\s*===\s*true/);
  assert.match(cliSource, /requiresGeneration: false/);
  assert.match(cliSource, /cloudModeEnabled: false/);
});
