import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";

async function source(relative) {
  return readFile(path.join(ROOT, relative), "utf8");
}

test("Windows convergence controller periodically promotes verified main without model calls", async () => {
  const [controller, installer, startupInstaller] = await Promise.all([
    source("scripts/runtime-convergence.ps1"),
    source("scripts/install-runtime-convergence.ps1"),
    source("scripts/install-production-startup.ps1"),
  ]);
  assert.match(installer, /Mahoraga Runtime Convergence/);
  assert.match(installer, /New-ScheduledTaskTrigger[\s\S]*-RepetitionInterval/);
  assert.match(installer, /-RepetitionDuration/);
  assert.doesNotMatch(installer, /Repetition\.Interval\s*=/);
  assert.match(installer, /MultipleInstances IgnoreNew/);
  assert.match(startupInstaller, /install-runtime-convergence\.ps1/);
  assert.match(startupInstaller, /Runtime convergence installer is missing/);
  assert.match(startupInstaller, /&\s+\$convergenceInstaller/);
  assert.match(controller, /runtime\.provenance\.state/);
  assert.match(controller, /runtime-drift/);
  assert.match(controller, /authoritativeSourceCommit/);
  assert.match(controller, /refs\/heads\/main/);
  assert.match(controller, /npm\.cmd['"]?\s+run\s+verify/i);
  assert.match(controller, /state\\candidate-4783/);
  assert.match(controller, /Ensure-RollbackWorktree/);
  assert.match(controller, /rolled-back/);
  assert.match(controller, /MAHORAGA_DATABASE_FILE/);
  assert.match(controller, /MAHORAGA_EXPECTED_SOURCE_COMMIT/);
  assert.match(controller, /Stop-Listener/);
  assert.match(controller, /Wait-ForCommit\s+\$targetCommit\s+\$true/);
  assert.doesNotMatch(controller, /codex\s+exec|openai|model invocation|gemini/i);
});
