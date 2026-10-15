# Windows production coordinator: source-only integration slice

`src/windows-production-coordinator.ts` implements the sequencing contract from
issue #948. Its fault-injection tests exercise a fixture adapter. The module has
no installed Windows adapter, CLI, launcher import or scheduled-task entry point.
These tests establish source behavior only; they do not establish an installed,
activated or executed Windows update.

Windows production remains `3.6.0`. Preserve the actually observed incumbent and
the known rollback reference `397acebf16766f44e3b4317f9d8b68b10de5f821`.
`confirmedHost` must come from independent confirmation of Mike's physical main
PC; a fixture name, repository reference host, browser claim or caller-provided
string alone does not establish that identity. Other PCs remain outside scope.

The coordinator validates exact device/source bindings, verifies a checkpoint
and isolated rollback rehearsal before staging, requires a healthy compatible
candidate and incumbent admission, then re-observes main, device and incumbent
before the first production mutation. Promotion is attempted once. A thrown or
uncertain promotion restores **production 4782**, verifies the incumbent's source,
authority, health and compatibility, and attempts candidate teardown even if
restoration fails. Candidate cleanup must verify **4783 is stopped** before it
resolves. Callers must use `activationCompleted(result)`: an `activated` state
with failed cleanup is incomplete. Only bounded gate reasons and validated
checkpoint identifiers enter results; raw adapter errors are suppressed.

## Remaining trusted adapter work

A resolving adapter method promises verified postconditions, not an attempted
operation. The adapter must obtain fresh local observations independently and
fail closed for absent, stale or mismatched evidence. Before wiring a launcher:

- Authenticate the receipt producer and validate the canonical sovereign receipt
  with the incumbent-trusted `validateSovereignEvolutionReceipt` against the exact
  target SHA and observed epoch. Schema validity alone does not authenticate
  evidence. Include independent exact-head Ubuntu/Windows CI, state compatibility,
  sovereignty, checkpoint/rehearsal and canary evidence. Candidate rules cannot
  authorize the candidate. The coordinator never mints this evidence.
- Preserve the dirty controller and actual incumbent source/configuration/tasks,
  coherent SQLite backup, vault contents and DPAPI/key bindings. Validate backups
  and rehearse restoration in isolated state. Candidate staging must not mutate
  the production database. Bind observations to state continuity evidence.
- Resolve one supported pinned Node runtime. Verify Mahoraga listener/process
  ownership before stopping anything. Verify immutable release identity/digest
  when staging an archive. Unknown ownership or provenance is a hold.
- Implement restoration and relaunch of checkpointed **4782**, including failure
  after the incumbent has already stopped. The existing
  `createEmergencyRollback` in `src/state/rollback.mjs` is explicitly restricted
  to **4783** and cannot satisfy `restoreProduction`.
- Bind real canaries to the confirmed device and exact source. Preserve provider
  admission, authenticated owner/relay boundaries and zero-credit constraints.
  Keep native foundry candidate-only and preserve owner stop/revoke/recovery.
- Add isolated Windows integration tests for backup corruption, missing manifests,
  vault incompatibility, migration failure, stale epoch, missing CI, listener
  ownership, real failed-launch restoration and candidate teardown. Then collect
  actual device checkpoint/rehearsal/admission/canary receipts and the shared UI
  owner transaction required by #948. Do not enable recurring convergence first.

The existing unhealthy-candidate and dirty-controller protections from #1096 and
#1099 remain in `runtime-convergence.ps1` / `install-runtime-convergence.ps1`.
They are prerequisites to preserve, not evidence that production restore exists.

## Teams canary remains separate

Issue #376's recipient-bound Teams executor already exists in
`src/desktop-worker.mjs`, with content-free receipt metadata and a manual attended
canary bootstrap in `src/capability-readiness.mjs`. Reuse those existing contracts
when its actual acceptance is authorized. No recipient or message is authorized
by an updater integration, and an unattended update must not send a Teams canary.
The remaining #376 acceptance requires an owner-designated harmless recipient
and exact message, an identified attended Windows session, independent same-chat
confirmation, a sanitized receipt and replay/duplicate evidence. Simulated UIA
results and this coordinator's tests satisfy none of those live requirements.

Focused source verification:

```sh
node --test test/windows-production-coordinator.test.ts test/runtime-convergence-controller.test.mjs
npm run typecheck
npm run baseline:verify
```

Exact-head protected CI and real Windows acceptance remain separate gates.
