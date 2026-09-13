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
  assert.match(installer, /sparse-checkout\s+disable/i);
  assert.match(installer, /worktree\s+remove\s+--force/i);
  assert.match(installer, /Runtime convergence controller is missing after repair/i);
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

test("Windows convergence bootstraps protected main when the 4783 candidate is absent", async () => {
  const controller = await source("scripts/runtime-convergence.ps1");
  assert.doesNotMatch(controller, /No paired candidate runtime is active; convergence is a no-op/i);
  assert.match(controller, /bootstrap/i);
  assert.match(controller, /Start-Candidate\s+\$ControllerRoot\s+\$targetCommit/);
  assert.match(controller, /Wait-ForCommit\s+\$targetCommit\s+\$true/);
  assert.match(controller, /state\s*=\s*['"]bootstrapped['"]/i);
  assert.match(controller, /npm\.cmd['"]?\s+run\s+verify/i);
});

test("Windows convergence fails closed when 4783 is occupied but status is unavailable", async () => {
  const controller = await source("scripts/runtime-convergence.ps1");
  const noLiveBlock = controller.match(/if \(-not \$live\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(noLiveBlock, /Get-ListenerPid/);
  assert.match(noLiveBlock, /listener-conflict/i);
  assert.match(noLiveBlock, /throw/i);
  assert.ok(noLiveBlock.indexOf("Get-ListenerPid") < noLiveBlock.indexOf("Start-Candidate"));
  assert.match(
    noLiveBlock,
    /if\s*\(\$failedPid\s+-and\s+\$failedPid\s+-eq\s+\$bootstrapProcess\.Id\)\s*\{\s*Stop-Listener\s+\$failedPid\s*\}/i,
  );
});

test("Windows convergence reuses only a coherent canonical centralized state bundle", async () => {
  const controller = await source("scripts/runtime-convergence.ps1");
  assert.match(controller, /\$centralStateDatabase\s*=\s*Join-Path\s+\$stateRoot\s+['"]mahoraga\.sqlite['"]/i);
  assert.match(controller, /\$centralStateVaultKey\s*=\s*Join-Path\s+\$stateRoot\s+['"]content-vault\.key\.dpapi['"]/i);
  assert.match(controller, /\$centralStateVaultRoot\s*=\s*Join-Path\s+\$stateRoot\s+['"]content-vault['"]/i);
  assert.match(
    controller,
    /\$centralStateReady\s*=\s*\(Test-Path\s+-LiteralPath\s+\$centralStateDatabase\s+-PathType\s+Leaf\)\s*-and\s*\(Test-Path\s+-LiteralPath\s+\$centralStateVaultKey\s+-PathType\s+Leaf\)\s*-and\s*\(Test-Path\s+-LiteralPath\s+\$centralStateVaultRoot\s+-PathType\s+Container\)/i,
  );
  assert.match(controller, /if\s*\(-not\s+\$centralStateReady\s+-and\s+-not\s+\(Test-Path[\s\S]*\$migrationMarker/);
  assert.ok(controller.indexOf("$centralStateReady") < controller.indexOf("Find-SourceWorktree $sourceCommit"));
});
