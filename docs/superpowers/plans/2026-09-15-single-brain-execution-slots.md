# Single Mahoraga Brain / Dual Execution Slots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make 4782 the only normal Mahoraga authority while retaining 4783 as an on-demand transient candidate verifier that is stopped after convergence.

**Architecture:** Keep the existing isolated candidate state and provenance/rollback machinery. Change the convergence controller so it skips 4783 when 4782 already matches protected main, otherwise runs 4783 only long enough to verify the candidate, converge 4782, record receipts, and stop the candidate before returning.

**Tech Stack:** Node.js test runner, PowerShell convergence scripts, Git worktrees, SQLite/WAL runtime state.

**Spec:** `docs/superpowers/specs/2026-09-15-single-brain-execution-slots-design.md`

## Global Constraints
- Port 4782 is the only authoritative local runtime and normal interaction target.
- Port 4783 is isolated candidate/shadow state and must not remain an always-on second brain.
- Never share one writable SQLite database between 4782 and 4783 supervisors.
- Preserve auth, encrypted vaults, protected verification, rollback, exact-source provenance, and zero-credit defaults.
- Raw 4782/4783 listeners remain loopback-only.

---
### Task 1: Lock the convergence contract with failing tests

**Files:**
- Modify: `test/runtime-convergence-controller.test.mjs`
- Test: `test/runtime-convergence-controller.test.mjs`

**Interfaces:**
- Consumes: `scripts/runtime-convergence.ps1` as text contract.
- Produces: assertions requiring transient 4783 lifecycle and production-first no-op behavior.

- [ ] **Step 1: Add a failing test for healthy-current 4782 with absent 4783**

```js
test("convergence leaves 4783 stopped when canonical 4782 is already current", async () => {
  const controller = await source("scripts/runtime-convergence.ps1");
  assert.match(controller, /production-already-current/i);
  assert.match(controller, /if\s*\(-not\s+\$live\)[\s\S]*Get-ProductionStatus[\s\S]*exit\s+0/i);
});
```

- [ ] **Step 2: Add failing tests that every successful candidate path stops 4783**
```js
test("successful convergence promotes 4782 and tears down 4783 before exit", async () => {
  const controller = await source("scripts/runtime-convergence.ps1");
  assert.match(controller, /function\s+Stop-VerifiedCandidate/i);
  assert.match(controller, /Ensure-ProductionCurrent\s+\$targetCommit[\s\S]*Stop-VerifiedCandidate\s+\$targetCommit/i);
  assert.match(controller, /state\s*=\s*['"]candidate-stopped['"]/i);
});
```

- [ ] **Step 3: Run the focused test and confirm RED**

Run: `node --test test/runtime-convergence-controller.test.mjs`
Expected: new transient-slot assertions FAIL against the current controller.

- [ ] **Step 4: Commit the RED test**

```bash
git add test/runtime-convergence-controller.test.mjs
git commit -m "test: require transient 4783 convergence slot"
```

### Task 2: Make 4783 transient and 4782 authoritative

**Files:**
- Modify: `scripts/runtime-convergence.ps1`
- Test: `test/runtime-convergence-controller.test.mjs`
**Interfaces:**
- Consumes: `Get-ProductionStatus`, `Ensure-ProductionCurrent`, `Get-LiveStatus`, `Get-ListenerPid`, `Stop-Listener`.
- Produces: `Stop-VerifiedCandidate([string]$ExpectedCommit)` and a `candidate-stopped` convergence receipt.

- [ ] **Step 1: Add a verified candidate stop helper**

```powershell
function Stop-VerifiedCandidate([string]$ExpectedCommit) {
    $live = Get-LiveStatus
    if (-not $live) { return }
    if ($live.product -ne 'Mahoraga') { throw 'Candidate listener is not Mahoraga.' }
    $source = Resolve-Commit ([string]$live.runtime.provenance.sourceCommit) 'candidate stop source'
    if ($source -ne $ExpectedCommit) { throw 'Candidate source changed before teardown.' }
    $listenerPid = Get-ListenerPid
    if (-not $listenerPid) { throw 'Candidate status is live but listener PID is missing.' }
    Stop-Listener $listenerPid
    Write-Receipt @{ state = 'candidate-stopped'; sourceCommit = $ExpectedCommit; candidatePort = $Port; productionPort = 4782 }
}
```

- [ ] **Step 2: Make absent 4783 a no-op when 4782 is already exact-main/current/healthy**
```powershell
$production = Get-ProductionStatus
if ($production -and $production.product -eq 'Mahoraga' -and
    [string]$production.runtime.provenance.sourceCommit -eq $targetCommit -and
    [string]$production.runtime.provenance.authoritativeSourceCommit -eq $targetCommit -and
    [string]$production.runtime.provenance.state -eq 'current' -and
    $production.runtime.healthy -eq $true) {
    Write-Receipt @{ state = 'production-already-current'; sourceCommit = $targetCommit; candidatePort = $Port; productionPort = 4782 }
    exit 0
}
```

- [ ] **Step 3: Collapse bootstrap/promotion into one cycle**

After `Wait-ForCommit $targetCommit $true` succeeds, call `Ensure-ProductionCurrent $targetCommit`, then `Stop-VerifiedCandidate $targetCommit`, then exit. Do not leave the candidate running for a second scheduler cycle.

- [ ] **Step 4: Tear down an already-current candidate after production verification**

In the `$sourceCommit -eq $targetCommit` branch, keep the current provenance/health checks, call `Ensure-ProductionCurrent $targetCommit`, then `Stop-VerifiedCandidate $targetCommit`, then exit.

- [ ] **Step 5: Promote immediately after a stale candidate is replaced**

After the replacement candidate reaches exact-main/current and the `activated` receipt is written, call `Ensure-ProductionCurrent $targetCommit` followed by `Stop-VerifiedCandidate $targetCommit`.
- [ ] **Step 6: Ensure rollback evidence does not leave a second always-on runtime**

After a rollback candidate is proven reachable and the `rolled-back` receipt is written, stop that verified 4783 rollback listener before rethrowing the activation error. Do not alter 4782 production state.

- [ ] **Step 7: Run focused convergence tests and confirm GREEN**

Run: `node --test test/runtime-convergence-controller.test.mjs`
Expected: all convergence-controller tests PASS.

- [ ] **Step 8: Run related containment tests**

Run: `node --test test/uccp-runtime-contract.test.mjs test/emergency-rollback.test.mjs test/cloud-relay-runtime-persistence.test.mjs`
Expected: PASS with candidate isolation and rollback contracts intact.

- [ ] **Step 9: Commit implementation**

```bash
git add scripts/runtime-convergence.ps1 test/runtime-convergence-controller.test.mjs
git commit -m "fix: make 4783 a transient candidate slot"
```

### Task 3: Verify, integrate, and prove effortless communication

**Files:**
- Modify: `README.md` only if the current runtime guidance still describes 4783 as a normal persistent runtime.
- Runtime mutation: scheduled convergence task and live 4783 process on the authorized Windows host.

**Interfaces:**
- Produces: one normal runtime authority on 4782 and one canonical user-facing cloud/Control Center path.
- [ ] **Step 1: Run full deterministic verification**

Run: `npm.cmd run verify`
Expected: Verify passes with zero test failures.

- [ ] **Step 2: Push the branch and open a bounded PR**

Push `fix/single-brain-slots-20260915`, open a PR against `main`, and preserve the exact head SHA for merge verification.

- [ ] **Step 3: Merge only after required deterministic checks are green**

Use squash merge if the repository permits it. Re-read `main` after merge and confirm the merged SHA.

- [ ] **Step 4: Converge the authorized Windows runtime to merged main**

Run the existing verified convergence controller once. Acceptance requires healthy/current 4782 on merged main and no listener on 4783 after the controller returns.

- [ ] **Step 5: Verify scheduled-task behavior**

Confirm `Mahoraga Runtime Convergence` remains installed and enabled, but an idle cycle with current healthy 4782 does not leave 4783 running.

- [ ] **Step 6: Verify canonical cloud readiness and a real user communication transaction**

Check canonical Railway `/api/ready` for HTTP 200, exact merged source SHA, and `modelInvocations: 0`. Then send a bounded test message through the normal cloud/Control Center user path and require a returned Mahoraga answer/receipt without targeting port 4783.

- [ ] **Step 7: Record the operational receipt**

Persist: authoritative source SHA, 4782 health/current state, absence of 4783 listener after convergence, canonical cloud readiness, communication transaction result, rollback availability, and any remaining interaction blocker.
