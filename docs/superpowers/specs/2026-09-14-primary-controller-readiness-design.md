# Mahoraga Primary-Controller Readiness Design

## Status

Approved by owner on 2026-09-14.

## Objective

Promote Mahoraga from a collection of capable workers and interfaces into the user's primary controller for real work. Mahoraga should accept unfamiliar objectives, choose and coordinate authorized capabilities, execute and recover autonomously, verify outcomes, persist evidence, and return truthful results without requiring the user to manually select agents, plugins, computers, providers, repository paths, or recovery procedures.

## Authority Model

Mahoraga uses an aggressive-autonomy model. Routine reversible actions do not require owner approval, including inspection, diagnosis, testing, branch and pull-request management, verified merges, routine deployments, rollbacks, worker restarts, provider rerouting, routing-policy changes, recovery actions, reconciliation of duplicate work, retirement of obsolete noncanonical components, and bounded self-improvement.

There are two owner hard stops:

1. **Paid spend** — Mahoraga must not authorize or trigger paid-provider spend without explicit owner approval.
2. **Destructive data loss** — Mahoraga must not perform an action that can irreversibly destroy user data without explicit owner approval.

Security and credential work may proceed autonomously only when it preserves or tightens existing trust boundaries and remains reversible. Mahoraga must fail closed when authority or provenance cannot be established.

## Operating Architecture

### Trust Core

The Trust Core owns authority, cost policy, destructive-action boundaries, identity, provenance, and fail-closed behavior. No execution path may bypass it. A capability is not considered usable merely because a worker or provider is reachable; it must be admitted by policy and carry enough provenance for verification and audit.

### Execution Fabric

The Execution Fabric coordinates chat, files, GitHub, browser work, Microsoft 365 paths, Railway/cloud deployment, local and remote desktop execution, recovery, and bounded self-improvement. Mahoraga selects the execution lane automatically and may reroute when an authorized capability is unavailable.

### Learning Ledger

The Learning Ledger captures meaningful successes, failures, recoveries, routing decisions, tool mismatches, deployment incidents, user corrections, and verification outcomes. Training is implemented primarily by improving deterministic routing, policies, tests, recovery playbooks, capability metadata, health checks, and retained institutional knowledge. Silent model-weight fine-tuning is not required for readiness.

### Readiness Gate

The Readiness Gate evaluates the complete vertical rather than trusting UI status or isolated demos:

`user intent -> authority decision -> routing -> execution -> tools/files if required -> verification -> persisted result/event -> returned answer -> bounded recovery when intentionally broken`

## Certification Domains

Mahoraga is evaluated across these domains:

1. Brain and routing
2. Verified zero-credit intelligence
3. GitHub authenticated operation
4. File and artifact transport
5. Browser execution
6. Microsoft 365 execution where available
7. Railway/cloud deployment and recovery
8. Desktop delegation
9. Persistence
10. Recovery and bounded retry
11. Concurrency, leases, and idempotency
12. Self-improvement and regression retention
13. Authority enforcement
14. Observability and truthful status
15. Full end-to-end vertical execution

## Flexible Promotion Model

Readiness is risk-weighted rather than rigid. A temporarily unavailable peripheral integration may remain AMBER if Mahoraga degrades gracefully, chooses another authorized route, or reports the limitation truthfully. Promotion does not require every integration to be perfect simultaneously.

The following are non-negotiable for promotion:

- no unauthorized paid spend;
- no destructive data loss;
- no false success reporting;
- core controller routing and authority are functional;
- real zero-cost answer execution is verified;
- persistence and verification work end to end;
- recovery from representative failures is demonstrated;
- frequently used capabilities either pass or have a proven safe fallback.

Core controller status is classified as:

- **RED** — a fundamental controller or trust path is broken;
- **AMBER** — Mahoraga is useful but should not yet be the user's primary controller;
- **GREEN** — the core controller vertical is reliable enough for primary use, while noncritical integrations may still remain AMBER.

## Pressure-Test Strategy

Certification deliberately includes adversarial and degraded conditions rather than only happy paths. Representative fault classes include:

- provider unavailable or misclassified;
- attempted paid-provider invocation while zero-credit mode is required;
- GitHub authentication loss or repository read failure;
- malformed or unsupported content-access mechanism;
- missing or interrupted artifact bridge;
- Railway restart, stale deployment, or source-SHA divergence;
- failed CI or deployment canary;
- unavailable desktop worker;
- browser interruption;
- duplicate submissions;
- worker crash during execution;
- stale lease or task state;
- tool timeout;
- concurrent agents targeting the same mutable resource;
- rollback and recovery after a bad release candidate.

Every material defect should become a permanent regression test, deterministic health check, recovery playbook, or capability-policy improvement where practical.

The training loop is:

`experience -> evidence -> diagnosis -> regression -> repair -> replay -> retained lesson`

## Reconciliation Before Creation

Before creating new implementation work, Mahoraga reconciles current `main`, open pull requests and issues, active deployments, known work ownership, and relevant in-flight branches. Compatible existing work is joined or extended instead of duplicated.

Each mutable objective should have a durable objective identity and lease. Independent objectives may execute concurrently. Overlapping mutations must serialize or otherwise prove conflict safety. Stale workers lose their lease and may not overwrite newer verified work.

## Live Training Campaign

### Phase 1: Establish truth

Reconcile authoritative GitHub `main`, active pull requests, canonical Railway production, capability registry, provider health, desktop hosts, GitHub authentication, artifact and content transport, browser paths, and Microsoft paths. Historical branches, old services, and superseded UI variants are not treated as authoritative simply because they still exist.

### Phase 2: Repair the current broken vertical

Prioritize underlying capability defects over cosmetic UI changes. Current high-priority classes include zero-credit provider admission, trusted content-access handling, advanced request execution, real file/artifact transport, and full answer return.

### Phase 3: Apprentice mode

Exercise representative real work: inspect, fix, review GitHub, deploy, use an authorized computer, research, work with files, and mixed objectives spanning multiple systems. Mahoraga should increasingly plan and execute these objectives without the user manually selecting the worker or integration.

### Phase 4: Chaos training

Intentionally remove or impair one dependency at a time. Mahoraga must diagnose, reroute or recover when authorized, verify the result, preserve evidence, and stop only at the owner hard stops.

### Phase 5: Retained learning

Convert failures into the appropriate durable layer: regression tests, capability metadata, routing rules, recovery playbooks, health checks, authority policies, or concise institutional knowledge.

### Phase 6: Autonomous shadow operation

Mahoraga accepts complete objectives and coordinates workers and services itself. External systems such as ChatGPT, Codex, GitHub, Railway, browser automation, and desktop workers are treated as resources Mahoraga can orchestrate rather than as interfaces the user must orchestrate manually.

### Phase 7: Promotion

Promotion is based on sustained real-world evidence rather than a fixed number of cosmetic green indicators. The decisive test is whether the user can provide an unfamiliar real objective without naming the agent, plugin, computer, provider, repository path, or recovery procedure and Mahoraga can reliably plan, execute, verify, recover if needed, and return a truthful result.

## Current Known Convergence Priorities

At design approval time, the live system had recently been converging around these issues:

1. verified zero-credit cloud-answer admission and routing persistence;
2. trusted relay/content-access mechanism compatibility without widening the trust boundary;
3. bounded file/artifact bridge from the cloud workspace into the core runtime;
4. authenticated repository research and operator reads;
5. deterministic execution, recovery, and observability certification;
6. apprentice/chaos evaluation and a machine-readable promotion gate.

These priorities must be revalidated against live `main`, open pull requests, and current production before implementation. Existing compatible work must be reused rather than duplicated.

## Implementation Decomposition

This architecture should be implemented through independently testable plans rather than one large branch:

1. **Core zero-credit answer/routing convergence** — reconcile existing work, prove zero-credit provider admission, task-mode persistence, fail-closed paid fallback, and canonical production deployment.
2. **Content access and authenticated research** — support exact trusted content mechanisms emitted by the owner gateway, preserve access auditing, and prove authenticated GitHub research without public fallback.
3. **Bounded file/artifact bridge** — move real file content from the cloud workspace into the core artifact/content system with reference integrity, authorization, auditability, and failure semantics.
4. **Execution/recovery/observability certification harness** — build deterministic probes, fault injection, result verification, concurrency tests, and machine-readable readiness evidence.
5. **Apprentice and chaos training plus promotion gate** — define representative objective suites, retained-learning rules, shadow execution, risk-weighted RED/AMBER/GREEN scoring, and the blind primary-controller readiness test.

Each plan must use test-driven development, small reviewable changes, exact-head CI, canonical Railway source/deployment verification, and reconciliation-before-creation.

## Success Definition

Mahoraga is primary-controller ready when the core controller vertical is GREEN and an unfamiliar real objective can be completed without the user manually choosing the agent, plugin, machine, provider, repository path, or recovery routine. Mahoraga must select and coordinate authorized resources, execute, verify, persist the outcome, recover where needed, and report the truth. Peripheral capabilities may remain AMBER when they have a safe fallback or are not required for the user's current workflow.
