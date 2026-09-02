# Mahoraga production and repository status — 2026-09-02

This record deliberately separates **repository truth**, **GitHub verification**, and **live Windows production truth**. A manifest declaration, merged pull request, or green hosted-runner check does not prove which Mahoraga build is currently running on the Windows host. Live production claims require fresh process, listener, worker, provider, canary, and runtime-version evidence from that machine.

## Repository line

- Repository candidate version: `7.0.0-alpha.1`
- Runtime/API/Control Center declaration: `7.0.0-alpha.1`
- Phase/environment: `alpha-candidate` / `candidate`
- Canonical runtime boundary: `127.0.0.1:4782`
- OpenAI Platform API provider: disabled by default
- Last verified production predecessor / rollback target: `3.6.0`
- Immutable predecessor commit: `397acebf16766f44e3b4317f9d8b68b10de5f821`
- Mahoraga 7 production activation: **not asserted by this repository**
- Current live Windows process/version: **not asserted by this repository**

The earlier `7.0.0-alpha.1` release receipt remains historical evidence for its exact reviewed implementation and rollback drill. It must not be reused as proof for later repository heads. See `docs/verification/7.0.0-alpha.1-release.json`.

## September 1 stabilization

PR #76 introduced the unified ChatGPT-style conversation/action surface but GitHub's authoritative cross-platform verification detected a real integration regression after the merge. The failing path was:

`conversation Act request -> autonomous objective -> codex.execute child -> RuntimeDatabase.submitTask`

The objective planner had created Codex child definitions without the execution-cell authority required by `RuntimeDatabase.submitTask`, producing `Codex Builder base commit is invalid.` during objective reconciliation. `main` also had no GitHub branch protection or required status checks, so the merge was not prevented by the failing workflow.

PR #77 repairs that boundary without changing the self-evolution stack:

- preserves the six-node `propose + challenge -> synthesize -> implement -> verify -> integrate` objective graph;
- derives an exact repository base SHA through a fixed Git boundary;
- derives deterministic writable candidate scopes from the user's requested work while excluding `.github` workflow authority;
- marks objective children as internal authority-derived work instead of trusting stored caller-like authority fields;
- acquires a bounded `primary-local-codex` integration lease only when a Codex child is ready;
- leaves the objective planned when a competing Primary owns the lease instead of stealing or bypassing authority;
- derives every released child through the existing task-policy boundary;
- prepares a Codex Builder session before a Codex child can dispatch;
- releases/reacquires objective-owned integration leases between completed Codex stages so a long objective does not depend on one stale lease;
- releases the objective-owned lease immediately after the final Codex stage and uses an unpaginated active-task predicate before declaring a lease idle;
- resolves the exact repository base asynchronously before persisting autonomous chat/conversation state, including owner-paired relay chat;
- derives new-conversation write scope from the original user request before encrypted-vault substitution;
- adds the new autonomy authority modules to the immutable repair baseline;
- preserves the existing candidate-worktree, exact-head, verification, integration, and rollback boundaries.

The implementation was developed test-first. GitHub Actions observed each intended RED state before its production repair. Exact implementation head `02ed3d30d79430f983e580a79f231dcf22d8a25a` passed complete `Verify Mahoraga` run #191 on both Ubuntu and Windows. Any later documentation-only commit must still pass the same exact-head merge gate. A separate stabilization record is maintained at `docs/verification/7.0.0-alpha.1-main-stabilization.md`.

## Self-evolution boundary for this stabilization

The September 1 stabilization does **not** modify:

- `src/evolution-controller.mjs`;
- evolution-controller tests or contracts;
- candidate build/deploy/canary/activation/rollback semantics;
- automatic update authority in `mahoraga.manifest.json`;
- repository visibility.

Evolution tests continue to run as part of the canonical conversation/evolution and complete repository gates; passing those tests is regression evidence only, not a change to their behavior.

## Durable architecture

The current repository retains the Node supervisor, isolated workers, SQLite WAL operational ledger, leases, heartbeats, crash recovery, bounded restarts, durable conversations, durable objective graphs, encrypted content vault, bounded receipts, repository coordination, world-state observation, and evidence-backed routing.

Configured or enabled is not synonymous with routable. Capability routing separates process state, provider readiness, canary evidence, routing decision, and evidence level. Write-capable routes require current evidence and fail closed when canaries or attended authority are absent.

## Conversation and autonomy plane

The repository implements durable conversation runs, idempotent intake, cancellation/replay, capability discovery, typed run events, answer-quality validation, and autonomous objective graphs. Conversation-driven code changes now use the same policy, integration-lease, execution-cell, and Codex Builder session boundaries as direct Builder work rather than bypassing them through objective reconciliation.

The planner foundation and read-only World-State Observer are implemented. Higher-level capability quality still depends on the live providers and current canary evidence available on the machine where Mahoraga is running.

## Browser and desktop truth

The repository contains a bounded browser worker and a Windows Desktop Worker contract. Managed loopback Chrome observation is implemented. The Desktop Worker remains attended and allowlisted. These repository contracts do not prove a current attended Windows canary.

Canonical signed-in autonomous browser ownership remains separate from attended browser/application handoff. A live provider observation is required before signed-session work can be treated as routable.

## Microsoft and local-provider truth

The Microsoft 365 attended worker and Dataverse queue contracts exist. Unattended queue polling remains dependent on a working silent credential and live outbound poll. LM Studio/local-reasoner execution, optional GitHub Copilot execution, Workspace Agent cloud triggering, Copilot Studio delegation, and Lenovo AI execution remain subject to their declared provider/readiness prerequisites.

Use `npm run providers:probe` on the authoritative Windows checkout for a bounded, non-activating readiness pass. The probe does not prove end-to-end execution and must not be substituted for task-specific canary evidence.

## GitHub assurance and merge enforcement

Canonical CI verifies the repository on both Linux and Windows using Node 24 and runs the focused conversation/evolution contract gate, full `npm run verify`, static self-upgrade policy validation, capability gap audit, and GitHub assurance dashboard.

Repository code also enforces exact-head integration rules, immutable task/coordination evidence, protected-root boundaries, and release-baseline integrity.

At the start of this stabilization, GitHub `main` itself was unprotected and had no required status checks. The connected GitHub interface available to this stabilization exposes branch-protection/ruleset state but does not expose a mutation action for enabling those repository settings. Therefore this repository document does **not** claim that GitHub branch protection has been enabled. Until that setting is changed through a GitHub settings surface that supports writes, merges must continue to be gated operationally on the exact PR head's successful Windows and Ubuntu `Verify Mahoraga` checks.

## Repair baseline

The immutable repair baseline now covers the new autonomous write-scope resolver and objective-release authority in addition to the existing production-critical files. Baseline equality is verified by the complete repository suite; changed core files are not accepted by weakening the check or adding hash exceptions.

## Remaining live-evidence boundary

GitHub can establish source state and hosted-runner verification. It cannot establish the current Windows PID, listener, active version, worker processes, local provider authentication, attended desktop session, local canaries, SQLite operational state, or whether a candidate has been activated on the machine.

A separate read-only live Windows audit is required before making any current-production claim.
