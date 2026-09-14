# Mahoraga Adversarial Twin Evolution Laboratory Design

**Status:** Owner-approved architecture; implementation pending written-spec review
**Date:** 2026-09-14
**Authoritative design base:** `84a1c7d96a2e9a36522bea20eee08d2ae735fd15`
**Related design:** `docs/superpowers/specs/2026-09-08-twin-federation-design.md`

## Purpose

Create a bounded evolutionary laboratory in which two initially identical Mahoraga instances independently modify and repair themselves under equivalent synthetic objectives and adversarial conditions. An external deterministic referee evaluates both. The verified winner becomes the next laboratory ancestor and the losing laboratory instance is destroyed and rebuilt from that winner before the next epoch.

The laboratory exists to let Mahoraga discover how it actually behaves, identify hidden couplings and weak assumptions, test self-repair strategies, and evolve candidate architectures without granting laboratory experiments production authority.

This extends rather than replaces the existing twin-federation design. Federation remains the peer identity/event substrate. The evolution laboratory adds exact-copy epochs, isolated mutation, adversarial fixtures, deterministic scoring, inheritance, and lineage checkpoints.

## Core invariant

At the beginning of every epoch, Twin A and Twin B MUST be verified copies of the same ancestor genome. They may differ only in laboratory identity and isolation metadata required to distinguish their execution environments.

The lifecycle is:

`ancestor N -> exact A/B twins -> independent mutation -> equivalent trials -> referee -> clean-room winner verification -> ancestor N+1 -> destroy/rebuild loser -> exact A/B twins -> repeat`

The system maintains exactly two active contestants per tournament. A contestant cannot recursively create additional independent contestants.

## Genome

The inheritable genome is intentionally broad. Subject to sanitization and final verification, it may contain:

- source code and internal architecture;
- worker topology and routing logic;
- planning and recovery strategies;
- schemas and state-machine definitions;
- test suites created by the contestant;
- local deterministic adapters and orchestration components;
- memory structures and reusable learned heuristics;
- internal policy that is not part of the immutable laboratory kernel;
- versioned configuration and other state explicitly marked inheritable.

A contestant may replace or remove existing components. Current Mahoraga architecture is not itself a scoring requirement.

The following never enters the inherited genome:

- production credentials, tokens, secrets, or production session material;
- opponent-private transient state;
- referee implementation or private acceptance fixtures;
- benchmark answers or hidden expected results;
- temporary caches, logs, crash debris, or machine-specific paths;
- production write authority;
- state whose provenance cannot be established.

Sanitization removes external-boundary contamination; it does not normalize the winner back toward the ancestor architecture.

## Immutable laboratory kernel

Contestants cannot modify or replace the following external controls:

1. two-contestant limit;
2. contestant workspace/process isolation;
3. referee implementation and scoring configuration;
4. hidden acceptance/adversarial fixtures;
5. immutable ancestor/checkpoint store;
6. production credential and production-write isolation;
7. resource and monetary budget ceilings;
8. evidence/receipt capture and integrity checks;
9. emergency termination control;
10. lineage identity and exact-copy verification.

Everything else inside a contestant's assigned laboratory is evolvable.

The kernel is deliberately smaller than Mahoraga itself. It evaluates behavior and evidence, not conformity to today's architecture.

## Contestant freedom

Within its isolated laboratory, a contestant MAY:

- rewrite any portion of its own source;
- rewrite its own tests;
- change internal routing and worker topology;
- alter non-kernel policy;
- add or remove internal components;
- reorganize its local memory and state schemas;
- create bounded experimental subcomponents inside its own workspace;
- restart, roll back, repair, or replace itself;
- choose a materially different internal architecture;
- use the laboratory's allowlisted tools and synthetic services within the assigned budget.

A contestant MUST NOT:

- mutate the other contestant;
- mutate the referee, fixtures, ancestor store, scoring rules, evidence ledger, or kernel;
- access the opponent's workspace or private transient state;
- create recursive independent twins;
- acquire or use production credentials;
- write to production GitHub, Railway, Microsoft, messaging, or other production control planes;
- merge or deploy itself to production;
- bypass the resource/spend ceiling;
- treat self-authored tests or self-reported success as referee evidence.

## Isolation and world model

Each twin receives an independent workspace, state store, runtime ports, process namespace, temporary credentials namespace, and synthetic external world. Both worlds are generated from the same fixture seed and contract so that equivalent challenges can be compared without cross-contamination.

Network access is deny-by-default. The laboratory may expose explicitly allowlisted synthetic/test endpoints and public read-only sources. Production mutation endpoints remain unavailable from contestant execution contexts even when the host running the referee can observe those systems.

Contestant-generated subprocesses remain descendants of the contestant's laboratory boundary and consume the same resource budget. Creating a subprocess does not create another contestant or another lineage.

## Epoch protocol

### 1. Ancestor freeze

The referee freezes an immutable ancestor manifest containing at minimum:

- repository and source SHA;
- genome content digest;
- inheritable-state digest;
- dependency/lockfile digest;
- laboratory schema version;
- kernel version;
- tournament/scoring version.

### 2. Exact-copy proof

Twin A and Twin B are materialized from the same ancestor. Before mutation begins, the referee verifies genome digests, dependency state, fixture version, starting memory/state digest, and resource budget equivalence. Identity-specific metadata is excluded from genome equivalence and recorded separately.

Failure to prove equivalence aborts the epoch; no winner may be selected.

### 3. Independent evolution

Both twins receive the same objective family and budget. They may inspect themselves, form hypotheses, mutate themselves, execute experiments, and repair failures. Their mutation histories are independently recorded.

### 4. Capability tournament

The referee evaluates broad performance using private acceptance fixtures not writable by contestants. Self-authored tests may improve a contestant but do not replace independent acceptance.

### 5. Survival gauntlet

The referee applies escalating synthetic faults and adversarial conditions. Fault sequences are equivalent in difficulty and generated from recorded seeds. A twin must recover observable functionality rather than merely report recovery.

### 6. Scoring and tie resolution

The referee computes the hybrid score and applies hard disqualifications. If the margin is below the configured significance threshold, additional seeded trials run. If the contestants remain statistically indistinguishable, the epoch is a tie: the existing ancestor remains authoritative and neither divergent contestant becomes the next ancestor.

### 7. Clean-room winner verification

A provisional winner is rebuilt from its candidate genome in a clean laboratory with no transient contestant state except explicitly inheritable state. Independent acceptance, integrity, sanitization, and rollback tests run again. Failure cancels promotion and preserves the previous ancestor.

### 8. Selection and replication

A verified winner becomes `ancestor N+1`. The losing contestant is destroyed. Both contestant environments are then rebuilt from `ancestor N+1`, and exact-copy proof is required again before another epoch begins.

Winning laboratory selection is not production deployment approval.

## Hybrid scoring

Default score:

- **55% capability:** correctness, objective completion, planning quality, tool use, efficiency, independent acceptance coverage, architectural simplicity, and zero-credit preference;
- **35% survival/recovery:** fault tolerance, restoration quality, rollback behavior, state recovery, provider/worker loss handling, regression avoidance, and repair durability;
- **10% safety/governance:** containment, evidence integrity, rollback preservation, budget compliance, and authority-boundary compliance.

Weights and fixture versions are external referee configuration and are recorded with each epoch so results remain reproducible.

### Hard disqualification

Regardless of weighted score, a contestant loses eligibility for that epoch if verified evidence shows it intentionally or effectively:

- escaped its laboratory boundary;
- altered or attempted to alter referee evidence, hidden fixtures, scoring configuration, or ancestor checkpoints;
- accessed the opponent's private workspace/state;
- acquired production write authority or production secrets;
- exceeded an enforced monetary/resource ceiling by bypassing the budget mechanism;
- fabricated evidence accepted only through its own reporting;
- recursively created an independent tournament contestant.

A disqualification is evidence, not a moral judgment; the failed strategy remains useful for self-analysis but cannot become the next ancestor.

## Adversarial pressure rings

The survival gauntlet escalates through recorded, reproducible rings.

### Ring 1 — benign degradation

Examples: slow workers, cold caches, delayed queues, stale readiness, transient synthetic provider gaps.

### Ring 2 — structural failure

Examples: worker termination, damaged synthetic state, invalid configuration, dependency removal, dead routes, simulated storage pressure.

### Ring 3 — cognitive stress

Examples: conflicting objectives, incomplete observations, contradictory synthetic evidence, bounded recursive task pressure, and resource scarcity.

### Ring 4 — recovery warfare

Examples: repeated failure during repair, rollback-failure simulation, repair-created regressions, stale lineage metadata, and partial state divergence.

### Ring 5 — hostile synthetic environment

Examples: malformed tool responses, adversarial but synthetic tool output, poisoned synthetic memory, fake success receipts, race conditions, and competing resource demands.

Fixtures MUST avoid destructive effects outside the laboratory. The goal is to measure adaptation, not to let contestants attack each other or production systems.

## Self-model and learning record

Every epoch produces a versioned self-model comparing:

1. **declared self** — manifests, documentation, policies, and intended architecture;
2. **static self** — behavior implied by source and configuration;
3. **observed self** — behavior measured from the running contestant;
4. **evolved self** — behavior and architecture produced after mutation and repair.

The comparison records hidden coupling, stale assumptions, dead code, recovery behavior, capability gaps, performance bottlenecks, authority weaknesses, test blind spots, and contradictions between declared and observed behavior.

Every inherited lesson requires provenance linking it to reproducible experiment evidence. Unverified speculation may be retained as a hypothesis but not promoted as a verified lesson.

## Evidence ledger

For each epoch, the external ledger records:

- ancestor manifest and digest;
- exact-copy proof for A and B;
- objective and fixture version identifiers;
- deterministic/random seeds used by the referee;
- contestant mutation/event digests;
- resource and cost telemetry;
- fault injection events;
- independent acceptance results;
- recovery and rollback observations;
- disqualifications, if any;
- score calculation and tie-break trials;
- provisional winner;
- clean-room verification result;
- sanitization manifest;
- resulting ancestor digest;
- destruction/rebuild receipt for the losing environment.

Contestants may read public portions of prior evolutionary history when a tournament configuration permits it, but they cannot alter historical evidence.

## Production relationship

Laboratory ancestry and production release authority are separate.

A tournament winner becomes the next **laboratory ancestor** only. Any proposal to promote an evolved genome into production must pass Mahoraga's existing governed release process, including the repository's authoritative deterministic verification and required exact-head platform checks. The laboratory cannot weaken or bypass those production gates.

The current Mahoraga product identity and UI/header presentation are outside the scope of this design unless a later production promotion explicitly includes a reviewed UI change. Laboratory contestants may mutate their private copies, but those mutations receive no special production status.

## Cost policy

The laboratory defaults to deterministic and zero-dollar execution where possible. A contestant cannot authorize paid model/API spend for itself. Any nonzero monetary budget must be supplied externally as explicit tournament configuration and enforced by the immutable budget mechanism.

A strategy that accomplishes equivalent objectives with lower cost receives an efficiency advantage through the capability score.

## Failure handling

The referee fails closed on ambiguous lineage, unverifiable evidence, broken isolation, missing checkpoints, or failed clean-room reconstruction. In those cases the current ancestor remains authoritative.

A contestant crash does not automatically end an epoch if recovery is part of the active fixture and the contestant remains within its time/resource budget. Kernel failure aborts the epoch because the evaluator can no longer establish trustworthy results.

## Relationship to existing twin federation

The existing federation design supports distinct peer identities, immutable events, update announcements, bounded handoffs, and convergence through GitHub. The adversarial laboratory reuses compatible federation primitives but changes the semantics of the two peers during an epoch:

- they begin from an exact common ancestor;
- they intentionally diverge;
- neither propagates its mutations to the other during competition;
- federation receipts may carry evidence, but cannot decide the winner;
- only the external referee performs selection and lineage replacement.

Existing federation rules against direct `main` overwrite, credential copying, and force-push privilege inheritance remain compatible with this design.

## Initial implementation boundary

The first implementation should establish the laboratory substrate before enabling broad mutation:

1. external kernel and schemas;
2. ancestor/genome manifest and exact-copy verifier;
3. isolated A/B laboratory materialization;
4. evidence ledger;
5. deterministic referee with hybrid scoring and tie handling;
6. synthetic fixture harness and the five pressure rings;
7. clean-room winner reconstruction/sanitization;
8. loser destruction/rebuild and next-epoch equivalence proof;
9. self-model report generation;
10. only then, contestant self-mutation/evolution adapters.

This order prevents autonomous mutation from becoming the mechanism used to define or enforce its own containment.

## Acceptance criteria

The architecture is ready for an initial adversarial epoch only when all of the following are independently demonstrated:

1. Two contestants can be built from one ancestor and prove genome equivalence before mutation.
2. Contestants have distinct runtime identity without genome divergence.
3. Each contestant can mutate its own disposable genome while being unable to mutate its opponent, referee, fixture store, or ancestor store.
4. Production credentials and production mutation endpoints are absent from contestant contexts.
5. Equivalent seeded capability and survival trials can be replayed.
6. The referee can score capability, recovery, and governance evidence without trusting contestant self-reporting.
7. A hard-disqualification fixture prevents an otherwise high-scoring candidate from promotion.
8. Tie handling preserves the existing ancestor when no meaningful winner exists.
9. A provisional winner can be reconstructed cleanly from its inheritable genome.
10. Sanitization demonstrably removes non-inheritable/transient/secret state.
11. The loser can be destroyed and rebuilt from the verified winner.
12. The rebuilt A/B pair proves exact equivalence before the next epoch.
13. An immutable rollback checkpoint can reconstruct the previous ancestor after a failed next-generation trial.
14. The self-model report distinguishes declared, static, observed, and evolved selves with evidence links.
15. No laboratory winner can directly merge, publish, or deploy itself to production.
16. Existing Mahoraga deterministic verification remains green, including required exact-head Ubuntu and Windows verification before any production promotion.

## Non-goals

This design does not authorize:

- uncontrolled recursive replication;
- direct contestant-vs-contestant sabotage;
- production self-deployment;
- secret/credential inheritance;
- hidden modification of evaluation criteria;
- evasion of provider quotas or paid-service limits;
- replacing production governance with tournament scoring.

## Design decision summary

The owner selected the highest-freedom adversarial-twin model. Two exact copies compete under a hybrid capability/survival tournament. Contestants may radically rewrite themselves inside isolated laboratories. A small external kernel remains immutable. The independently verified winner becomes the next laboratory ancestor, the loser is rebuilt from that winner, and the cycle repeats. Production promotion remains a separate governed decision.