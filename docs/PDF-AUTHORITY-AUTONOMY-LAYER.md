# PDF Authority Autonomy Layer

Status: staged candidate contract  
Source: `autonomous - Google Search.pdf`  
Branch: `upgrade/pdf-authority-autonomy-layer-20260906`

## Implementation purpose

This layer converts the uploaded PDF direction into an implementable Mahoraga control contract without replacing the existing repository ecosystem.

It keeps the Node ESM control plane, SQLite WAL durability, loopback/private execution boundary, worker isolation, canary health checks, rollback, and owner activation boundary intact. The implementation intentionally does not copy unsafe sample mechanics such as blind runtime `eval`, public unauthenticated mutation sockets, volatile-only state, or self-activation of protected root changes.

## Authority model

Mahoraga may autonomously intake, plan, propose, sandbox-test, benchmark, sign, quorum-check, stage, and rollback-checkpoint candidate mutations.

Mahoraga must not silently activate protected-root changes, publish production releases, commit secrets, use metered cloud fallback, open public tunnels, or accept unauthenticated mutation feeds.

## Local-first execution order

1. Deterministic repository and AST logic.
2. Local model execution where present.
3. Licensed cloud builder only when explicitly configured and task-scoped.
4. No metered cloud default path.

## Candidate mutation gate

A mutation is stageable only when all of the following are true:

- Proposal has a stable ID.
- Target path or node ID is declared.
- Mutation source is non-empty and size-bounded.
- Cost class is deterministic or local-model.
- Execution boundary is private/loopback; no public ingress.
- No blind runtime eval.
- No secrets or private content are committed.
- Sandbox test passed.
- Benchmark passed.
- Envelope is signed.
- Quorum threshold is met.
- Rollback checkpoint exists.
- Protected-root changes remain behind reviewed bootstrap PR handling.

## Files added

- `src/pdf-authority-profile.mjs` — exports the candidate authority profile and deterministic mutation-envelope evaluator.
- `scripts/pdf-authority-verify.mjs` — validates the manifest cost modes and candidate gate behavior.
- `test/pdf-authority-profile.test.mjs` — adds unit coverage for local-first constraints, stageable candidate requirements, unsafe-path blocking, and protected-root blocking.

## Next wiring step

After this PR is green, wire `evaluateMutationEnvelope()` into the real candidate creation path before any generated mutation can move to `candidate-ready`. That is the point where the current autonomy loop becomes materially stronger without weakening containment.
