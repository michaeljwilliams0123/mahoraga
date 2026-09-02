# Mahoraga Main Stabilization Design

## Purpose

Restore the current Mahoraga 7 development head to a verifiable state without reducing its autonomy model or modifying the self-evolution stack.

## Scope

This change will:

1. Repair autonomous conversation objectives so `codex.execute` children are released through the same server-derived task policy, integration-lease, execution-cell, and Codex Builder session contracts used by direct Builder work.
2. Bind each autonomous code-writing objective to an exact repository base commit and a deterministic writable path scope before it is persisted.
3. Acquire or reuse a bounded Primary Local Codex integration lease at child-release time so later children do not depend on a lease captured when the conversation began.
4. Preserve the existing propose → challenge → synthesize → implement → verify → integrate graph and its bounded replan behavior.
5. Keep protected-path integration policy unchanged. Candidate work may be prepared inside declared paths, but existing autonomous integration checks remain authoritative for protected roots.
6. Add regression tests that prove the execution contract is present, policy-derived child release is used, a Codex Builder session is prepared, and lease contention waits rather than bypassing authority.
7. Refresh production/status documentation to distinguish the verified repository head from the live Windows runtime, which GitHub cannot prove.
8. Clean stale GitHub issues that are superseded by the current 7.0 implementation.
9. Strengthen repository-native merge discipline as far as the available repository interfaces permit, and document any GitHub-setting control that cannot be changed through repository contents.

## Explicit non-scope

Do not modify:

- `src/evolution-controller.mjs`
- evolution-controller tests or release/activation state-machine behavior
- self-evolution candidate/deploy/canary/activation/rollback semantics
- automatic update authority in `mahoraga.manifest.json`
- the current public/private repository visibility setting

The user intends to make the repository private later; this stabilization does not change visibility.

## Autonomous child release

Objective definitions remain durable metadata, but they no longer directly mint execution authority. The objective planner supplies only the immutable repository base and writable candidate paths for Codex children. At release time the Supervisor derives authoritative policy from the manifest and current runtime state.

For `codex.execute` children, release performs these steps:

1. Validate the stored exact base commit and allowed path set.
2. Reuse an active `primary-local-codex` integration lease only when it covers the requested paths; otherwise acquire a new lease using the existing maximum lease duration.
3. If another Primary currently holds the lease, leave the objective child planned and retry on a later supervisor tick. Do not steal, widen, or bypass the lease.
4. Derive task authority through `deriveTaskPolicy` with the current lease.
5. Persist the task through `submitPolicyTask`.
6. Prepare the corresponding Codex Builder session before the worker can claim the task.

Repository verification/integration children are also released through server-derived policy instead of trusting caller-like authority fields stored in the objective definition.

## Repository base and writable scope

The exact base commit is captured from the authoritative checkout using the repository worker's fixed `git rev-parse HEAD` command. No caller can provide or override it through `/api/chat`.

Writable paths are deterministically selected from the request text. The default is `src` + `test`. Interface requests add `cloud`; documentation requests add `docs`; manifest/provider/dependency requests add `mahoraga.manifest.json` and/or `package.json`; script/release/automation requests add `scripts`. `.github/workflows` is deliberately not granted by conversation autonomy.

These are write scopes, not read scopes. Existing protected-root integration controls remain unchanged.

## Failure behavior

- Invalid repository base or path scope: reject objective creation before partial execution.
- Competing Primary lease: objective remains planned; no authority widening.
- Expired local lease: acquire a fresh lease when the next Codex child is eligible.
- Policy derivation failure: fail closed with the existing typed task-policy error.
- Missing Codex Builder session: impossible for newly released objective Codex tasks because session preparation is part of the same release path.

## Verification

Required gates:

- focused autonomy-orchestrator tests
- focused chat-runtime test
- focused database/supervisor objective-release tests
- `npm run verify:conversation-plane`
- complete `npm run verify`
- GitHub `Verify Mahoraga` on Windows and Ubuntu against the exact PR head

The stabilization may merge only after the current exact head is green in GitHub Actions. The self-evolution files listed above must not appear in the PR diff.
