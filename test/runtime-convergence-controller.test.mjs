import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";

async function source(relative) {
  return readFile(path.join(ROOT, relative), "utf8");
}

test("Windows convergence controller evaluates verified main without model calls", async () => {
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
  assert.doesNotMatch(installer, /worktree\s+remove\s+--force/i);
  assert.doesNotMatch(installer, /Remove-Item[^\n]*-Recurse[^\n]*-Force/i);
  assert.match(installer, /function Assert-SafeControllerWorktree/);
  assert.match(installer, /controller-worktree-dirty/);
  assert.match(installer, /controller-worktree-attached-branch/);
  assert.match(installer, /status --porcelain --untracked-files=all/);
  assert.match(installer, /symbolic-ref --quiet --short HEAD/);
  assert.match(installer, /worktree remove \$controllerRoot/);
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


test("controller installer rejects stale or dirty branch checkout before any destructive fallback", async () => {
  const installer = await source("scripts/install-runtime-convergence.ps1");
  const guard = installer.indexOf("function Assert-SafeControllerWorktree");
  const installerBody = installer.indexOf("if (-not (Test-Path -LiteralPath $controllerRoot -PathType Container))");
  const explicitPreflight = installer.lastIndexOf("Assert-SafeControllerWorktree", installer.indexOf("sparse-checkout disable"));
  const sparseDisable = installer.indexOf("sparse-checkout disable");
  assert.ok(guard >= 0 && installerBody > guard);
  assert.ok(explicitPreflight > guard && explicitPreflight < sparseDisable);
  assert.match(installer, /controller-worktree-path-mismatch/);
  assert.match(installer, /controller-worktree-status-unavailable/);
  assert.match(installer, /controller-worktree-branch-indeterminate/);
  assert.ok(installer.indexOf("Assert-SafeControllerWorktree", installer.indexOf("function New-ControllerWorktree")) <
    installer.indexOf("worktree remove $controllerRoot"));
  assert.doesNotMatch(installer, /worktree remove --force|Remove-Item -LiteralPath \$controllerRoot -Recurse -Force/);
});

test("Windows controller refuses source reset when its worktree contains local or untracked changes", async () => {
  const controller = await source("scripts/runtime-convergence.ps1");
  const update = controller.slice(controller.indexOf("if ($currentControllerCommit -ne $targetCommit) {"), controller.indexOf("reset --hard $targetCommit"));
  assert.match(update, /status --porcelain --untracked-files=all/);
  assert.match(update, /controller-worktree-dirty/);
  assert.ok(controller.indexOf("status --porcelain") < controller.indexOf("reset --hard $targetCommit"));
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

test("Windows convergence refuses unhealthy exact-SHA candidates on both bootstrap and promotion", async () => {
  const controller = await source("scripts/runtime-convergence.ps1");
  const candidate = controller.match(/function Wait-ForCommit\([\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(candidate, /\$status\.runtime\.healthy\s+-ne\s+\$true/);
  assert.ok(candidate.indexOf("$status.runtime.healthy") < candidate.indexOf("if (-not $RequireCurrent) { return $status }"));
  assert.match(controller, /function Wait-ForProductionCommit[\s\S]*?\$production\.runtime\.healthy\s+-eq\s+\$true/);
});

test("Windows convergence stop helper never shadows PowerShell automatic PID", async () => {
  const controller = await source("scripts/runtime-convergence.ps1");
  assert.doesNotMatch(controller, /function\s+Stop-Listener\s*\(\s*\[int\]\s*\$Pid\s*\)/i);
  assert.match(controller, /function\s+Stop-Listener\s*\(\s*\[int\]\s*\$ProcessId\s*\)/i);
});

test("Windows convergence accepts current production and holds an unsafe replacement", async () => {
  const controller = await source("scripts/runtime-convergence.ps1");
  assert.match(controller, /\$productionHealthUrl\s*=\s*["']http:\/\/127\.0\.0\.1:4782\/api\/status["']/i);
  assert.match(controller, /function\s+Ensure-ProductionCurrent\s*\(\s*\[string\]\s*\$ExpectedCommit\s*\)/i);
  assert.match(controller, /production\.runtime\.provenance\.sourceCommit/i);
  assert.match(controller, /production\.runtime\.provenance\.authoritativeSourceCommit/i);
  assert.match(controller, /production\.runtime\.provenance\.state/i);
  assert.match(controller, /state\s*=\s*["']production-promotion-held["']/i);
  assert.doesNotMatch(controller, /start-production\.ps1/i);
  assert.match(
    controller,
    /if\s*\(\$sourceCommit\s+-eq\s+\$targetCommit\)\s*\{[\s\S]*?Ensure-ProductionCurrent\s+\$targetCommit[\s\S]*?exit\s+0/i,
  );
});

test("convergence leaves 4783 stopped when canonical 4782 is already current", async () => {
  const controller = await source("scripts/runtime-convergence.ps1");
  assert.match(controller, /production-already-current/i);
  assert.match(
    controller,
    /if\s*\(-not\s+\$live\)\s*\{[\s\S]*?Get-ProductionStatus[\s\S]*?production-already-current[\s\S]*?exit\s+0/i,
  );
});

test("convergence tears down an exact-main candidate after production acceptance or hold", async () => {
  const controller = await source("scripts/runtime-convergence.ps1");
  assert.match(controller, /function\s+Stop-VerifiedCandidate/i);
  assert.match(controller, /try\s*\{[\s\S]*?Ensure-ProductionCurrent\s+\$targetCommit[\s\S]*?finally\s*\{[\s\S]*?Stop-VerifiedCandidate\s+\$targetCommit/i);
  assert.match(controller, /state\s*=\s*["']candidate-stopped["']/i);
});


test("production hold is persisted before verification and never enters old-binary rollback", async () => {
  const controller = await source("scripts/runtime-convergence.ps1");
  const hold = controller.indexOf("# Promotion requires an independently verified native checkpoint/restore");
  const verify = controller.indexOf("Invoke-VerificationGate", controller.indexOf("reset --hard $targetCommit"));
  const sourceReset = controller.indexOf("reset --hard $targetCommit");
  assert.ok(hold > 0 && hold < sourceReset && hold < verify);
  assert.match(controller.slice(hold, sourceReset), /production-promotion-hold\.json|\$promotionHoldFile/);
  assert.match(controller.slice(hold, sourceReset), /\$holdUnchanged/);
  assert.match(controller.slice(hold, sourceReset), /exit 0/);
  const catchStart = controller.lastIndexOf("} catch {");
  const catchBody = controller.slice(catchStart);
  const branch = catchBody.indexOf("if ($_.Exception.Message -like 'production-promotion-held:*')");
  const rollback = catchBody.indexOf("Start-Candidate $rollbackWorktree $sourceCommit");
  assert.ok(branch >= 0 && rollback > branch, "intentional hold must bypass rollback");
  assert.match(catchBody.slice(branch, rollback), /Stop-VerifiedCandidate \$targetCommit/);
});

test("Windows one-minute hold is idempotent, updates on main change, and lifts when production is exact", async (t) => {
  if (process.platform !== "win32") return t.skip("PowerShell fixture only runs on Windows");
  const { mkdtemp, readdir, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { spawnSync } = await import("node:child_process");
  const temp = await mkdtemp(path.join(tmpdir(), "mahoraga-promotion-hold-"));
  const controller = await source("scripts/runtime-convergence.ps1");
  const start = controller.indexOf("# Promotion requires an independently verified native checkpoint/restore");
  const end = controller.indexOf("$currentControllerCommit = Resolve-Commit", start);
  assert.ok(start > -1 && end > start);
  const guard = controller.slice(start, end);
  const sha1 = "a".repeat(40), sha2 = "b".repeat(40), old = "c".repeat(40);
  const psPath = temp.replaceAll("'", "''");
  const invoke = (target, exact) => {
    const script = [
      "$ErrorActionPreference = 'Stop'",
      "$convergenceRoot = '" + psPath + "'",
      "$promotionHoldFile = Join-Path $convergenceRoot 'production-promotion-hold.json'",
      "$targetCommit = '" + target + "'",
      "$Port = 4783",
      "function Get-ProductionStatus { return [pscustomobject]@{ product='Mahoraga'; runtime=[pscustomobject]@{healthy=$true; provenance=[pscustomobject]@{sourceCommit='" + old + "';authoritativeSourceCommit='" + old + "';state='current'}} } }",
      "function Test-ProductionExactMain($Status, [string]$Commit) { return " + (exact ? "$true" : "$false") + " }",
      "function Write-Receipt([hashtable]$Body) { Add-Content -LiteralPath (Join-Path $convergenceRoot 'writes.txt') -Value $Body.state }",
      guard,
      "Write-Output 'CONTINUES_AFTER_HOLD'"
    ].join("\n");
    return spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand",
      Buffer.from(script, "utf16le").toString("base64")], { encoding: "utf8", timeout: 15000 });
  };
  try {
    const first = invoke(sha1, false);
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /promotion held/);
    let files = await readdir(temp);
    assert.ok(files.includes("production-promotion-hold.json"));
    const { readFile } = await import("node:fs/promises");
    assert.equal((await readFile(path.join(temp, "writes.txt"), "utf8")).trim(), "production-promotion-held");
    const second = invoke(sha1, false);
    assert.equal(second.status, 0, second.stderr);
    assert.equal((await readFile(path.join(temp, "writes.txt"), "utf8")).trim().split(/\r?\n/).length, 1);
    const moved = invoke(sha2, false);
    assert.equal(moved.status, 0, moved.stderr);
    assert.equal((await readFile(path.join(temp, "writes.txt"), "utf8")).trim().split(/\r?\n/).length, 2);
    const accepted = invoke(sha2, true);
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.match(accepted.stdout, /CONTINUES_AFTER_HOLD/);
    files = await readdir(temp);
    assert.equal(files.includes("production-promotion-hold.json"), false);
  } finally {
    await rm(temp, { force: true, recursive: true });
  }
});

test("Windows activation stays in the native controller and holds before an unprotected production replacement", async () => {
  const [controller, launcher] = await Promise.all([
    source("scripts/runtime-convergence.ps1"),
    source("scripts/start-production.ps1"),
  ]);
  await assert.rejects(
    access(path.join(ROOT, "src/windows-production-coordinator.ts")),
    /ENOENT/,
  );

  const promotion = controller.match(/function Ensure-ProductionCurrent[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(promotion, /production-promotion-held:trusted-native-restore-unavailable/i);
  assert.doesNotMatch(promotion, /start-production\.ps1/i);

  const replacement = launcher.match(/if \(\$existing -and \$existing\.product -eq 'Mahoraga'\) \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(replacement, /production-replacement-held:trusted-native-restore-unavailable/i);
  assert.doesNotMatch(replacement, /stop-production\.ps1/i);
});
