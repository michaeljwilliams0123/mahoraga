import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";

test("heartbeat CLI reuses one local-reasoner probe result instead of probing loopback twice", async () => {
  const source = await readFile(path.join(ROOT, "src", "autonomy-heartbeat.mjs"), "utf8");
  const cliStart = source.indexOf("async function runHeartbeatCli()");
  assert.notEqual(cliStart, -1);
  const cliSource = source.slice(cliStart);

  assert.doesNotMatch(cliSource, /observeLocalReasonerReady/);
  assert.match(cliSource, /probe\s*=\s*await probeLocalReasoner\(\{ timeoutMs: 750 \}\)/);
  assert.match(cliSource, /localReasonerReady\s*=\s*probe\?\.verified\s*===\s*true/);
  assert.match(cliSource, /decideUnattendedGeneration/);
  assert.match(cliSource, /envGenerationExplicit\(process\.env\.MAHORAGA_REQUIRES_GENERATION\)/);
  assert.match(cliSource, /requiresGeneration: generationAdmit\?\.requiresGeneration === true/);
});
