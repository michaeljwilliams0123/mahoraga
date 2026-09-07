# Universal Self-Contained Evolution Design

Date: 2026-09-07
Status: design for owner review
Scope: production architecture for Mahoraga's credit-independent learning/evolution loop

## 1. Goal

Mahoraga must continue to learn, research, experiment, improve, repair, and produce verified evolution candidates even when every metered or quota-bound model provider is unavailable.

Model providers are optional accelerators. They are not the cognitive substrate.

The default universal loop is:

`observe -> ingest -> normalize -> remember -> detect novelty/gaps -> hypothesize -> challenge -> synthesize -> experiment -> verify -> learn -> replan -> repeat`

This loop runs on local/deterministic capabilities first and can continue indefinitely with zero model credits.

## 2. Current-state constraints to preserve

- Production control plane remains Node ESM under `src/`, `scripts/`, `test/`, and `relay/`.
- Browser UIs remain TypeScript under `cloud-app/` and `operator-deck/`.
- `mahoraga.manifest.json` remains canonical configuration authority.
- Existing objective planner, world-state observation, unattended credit-free cycle, heartbeat ledger, skill compounding, agent foundry, autonomous integration, exact-head verification, and rollback infrastructure are extended rather than replaced.
- Main remains protected by the exact-head Ubuntu and Windows Verify checks.
- The existing Level-7 in-memory mesh remains an experimental cognition laboratory until it graduates through the same verification/evolution path as any other core change.

## 3. Autonomy posture

Routine owner approvals are removed from normal learning and evolution work.

Mahoraga may automatically:

- create research objectives from its own gaps and world-state evidence;
- acquire public technical information;
- normalize, score, deduplicate, correlate, and retain evidence;
- update derived knowledge and skill memory;
- generate hypotheses and implementation candidates;
- run local experiments, tests, benchmarks, differential checks, repair cycles, and canaries;
- create same-repository branches and pull requests;
- automatically integrate exact-head-green candidates when the existing autonomous integration contract admits them;
- rebase/replan after main advances;
- create or retire bounded specialist agents from measured gaps;
- continue the loop when premium providers are unavailable.

The owner remains an override/stop/recovery authority, not a routine approval gate.

## 4. Guardrail rollback

The design intentionally removes friction that is not needed for integrity:

- No manual approval is required before ordinary autonomous research.
- No manual approval is required before knowledge updates.
- No manual approval is required before isolated experiments.
- No manual approval is required before candidate branch or PR creation.
- No manual approval is required before exact-head-green autonomous integration where the existing integration/evolution contract already admits the candidate.
- Provider unavailability is not a blocker for the core loop.
- Credit exhaustion is not a blocker for the core loop.
- Uncertainty no longer requires stopping when Mahoraga can continue safely by sandboxing, comparing candidates, collecting more evidence, or degrading to deterministic/local execution.

Only a narrow integrity boundary remains:

1. Public Internet content is evidence, never executable authority.
2. Credentials, private content, and ownership secrets are never written into research memory, commits, or diagnostics.
3. No provider may create uncontrolled paid spend; metered escalation requires a separately admitted spend policy.
4. The loopback control API is not directly exposed to the public Internet.
5. A candidate may not use its own modified approval/integration rules as the sole authority to approve itself.
6. Platform/model safety policy remains local to the executing platform and is not bypassed by repository code.

## 5. Internet Evidence Plane

### 5.1 Research target generation

Research is driven by measured need rather than indiscriminate crawling. Seed topics are derived from:

- open planner actions;
- failed tasks/objectives;
- worker/provider errors;
- declared capability gaps;
- recently changed dependencies and source paths;
- failing or flaky tests;
- performance regressions;
- unresolved agent-foundry gaps;
- newly observed external releases/advisories;
- periodic broad discovery topics selected from Mahoraga's capability graph.

### 5.2 Source classes

The plane may consume public information from sources such as:

- official product/library documentation;
- GitHub and GitLab repositories, issues, releases, discussions, and commit history;
- standards bodies and public specifications;
- research papers and technical archives;
- security advisories and incident reports;
- engineering blogs and changelogs;
- public package registries and release metadata;
- public benchmarks and compatibility matrices;
- historical snapshots or archived public documents when useful.

Authenticated/private sources are separate connectors and inherit their connector data-class rules.

### 5.3 Evidence envelope

Each acquired item is normalized into a content-addressed envelope with at least:

- `sourceId`
- `sourceType`
- `canonicalUrl` or repository identity
- `retrievedAt`
- `publishedAt` when known
- `contentSha256`
- `topicIds`
- `objectiveIds`
- `trustClass`
- `freshnessClass`
- `noveltyScore`
- `corroborationCount`
- `contradictionCount`
- `parserVersion`
- `rawRetentionPolicy`

Raw content is kept separate from derived claims so a future parser can re-evaluate historical evidence without losing provenance.

### 5.4 Delta-first acquisition

After historical bootstrap, normal operation uses delta checks:

- conditional HTTP metadata when available;
- commit/release IDs;
- content hashes;
- feed timestamps;
- last-seen cursors;
- bounded revisit intervals based on source volatility.

Unchanged sources do not trigger expensive downstream reasoning.

## 6. Knowledge Plane

Knowledge has three layers.

### Evidence ledger

Immutable provenance records for what Mahoraga observed.

### Derived knowledge graph

Claims, relationships, patterns, version applicability, confidence, contradictions, and freshness. A claim can be revised without deleting the evidence that produced it.

### Skill/routine library

Only procedures that have survived experiment/verification are promoted into reusable skills. Failed experiments are retained as negative knowledge so the system does not repeatedly rediscover the same rejected approach.

Knowledge updates are autonomous and do not require model credits.

## 7. Evolution Plane

A meaningful novelty signal creates one or more hypotheses linked to concrete evidence and a measurable Mahoraga gap.

Candidate lifecycle:

1. **Hypothesis** — state what should improve and why.
2. **Challenge** — generate deterministic counterchecks, conflicting evidence, regression risks, and alternate explanations.
3. **Candidate** — produce the smallest bounded implementation or configuration change that can test the hypothesis.
4. **Experiment** — execute in an isolated workspace/branch/Level-7 lab as appropriate.
5. **Measure** — run focused tests, existing invariants, benchmarks, differential behavior, and regression checks.
6. **Verify** — require the repository's exact-head verification contract for production integration.
7. **Learn** — update positive or negative knowledge from the result.
8. **Integrate or reject** — exact-head-green admitted candidates may merge automatically; rejected candidates remain evidence.
9. **Replan** — feed the result back into the world state and next research cycle.

The system optimizes for many small verified improvements rather than large speculative rewrites.

## 8. Level-7 role

Level 7 becomes the fast experimental cognition substrate, not the production authority root.

It may hold:

- working knowledge graphs;
- hypothesis populations;
- candidate transformations;
- temporary embeddings/representations;
- experiment queues;
- mutation/search strategies;
- local evaluation state;
- ephemeral specialist agents.

Level 7 may mutate aggressively inside its isolated workspace. Successful output graduates to normal Mahoraga candidate branches and verification. Its own runtime state cannot directly bless production changes.

The existing dangerous dynamic-evaluation experiment must remain isolated until a future verified change replaces it with a bounded evaluation mechanism or proves an equivalent containment boundary.

## 9. Provider hierarchy

Provider selection is an assistance layer above the universal loop, not the loop itself.

Preferred order for optional generative assistance:

1. local deterministic workers and Level-7 cognition;
2. local open-weight reasoners;
3. primary owner's included Codex capacity, when available;
4. Destiny's separately authenticated Codex capacity, when available and route-verified;
5. connected providers with zero-additional-cost or already-included capacity, such as GitHub/GitLab-integrated agents or other subscribed assistants;
6. metered providers only if a future explicit spend policy admits them;
7. otherwise hold that optional subtask and continue all non-generative learning/evolution work.

No provider quota failure changes the health of the universal core loop.

## 10. Codex review-trigger suppression

Generated pull-request titles, bodies, comments, release notes, automation messages, and coordination artifacts must not emit the at-sign Codex trigger token.

Codex may still be assigned explicit implementation tasks through an authenticated execution route. Code review remains disabled as a Mahoraga transport and quota exhaustion remains non-blocking.

A sanitizer must run before any GitHub/GitLab conversation write and before PR metadata is submitted.

## 11. Research scheduler

The scheduler has two tempos.

### Fast loop

Runs with the existing heartbeat/unattended cycle. It consumes local changes, errors, objective state, newly-arrived evidence, and queued experiment results.

### Slow research loop

Runs periodically and also event-driven when a high-value novelty signal appears. It performs:

- historical backfill for newly discovered capability areas;
- source discovery;
- freshness checks;
- contradiction resolution;
- synthesis of new hypotheses;
- pruning/compaction of low-value duplicate evidence;
- skill-confidence recalculation.

Cadence is adaptive. Stable areas back off; rapidly changing or failing areas receive more attention.

## 12. Storage

Production durable memory uses the existing persistent control-plane storage pattern rather than the volatile Level-7 memory as the sole source of truth.

New logical stores:

- evidence envelopes;
- source cursors/freshness metadata;
- derived claims/relationships;
- hypotheses;
- experiment receipts;
- negative knowledge;
- skill confidence/history;
- research objectives.

Large raw bodies may use a content-addressed filesystem/object store with metadata referenced from the control-plane database. Hashes, provenance, and derived knowledge stay durable.

## 13. Integration with existing modules

Initial implementation should extend existing modules and add focused components rather than rewrite them.

Expected production components:

- `src/internet-evidence.mjs` — source/evidence normalization contract.
- `src/research-objectives.mjs` — derives research targets from world state and gaps.
- `src/knowledge-ledger.mjs` — evidence/claim/hypothesis reduction and confidence.
- `src/evolution-hypothesis.mjs` — converts novelty into bounded measurable candidates.
- `src/provider-assistance-router.mjs` — optional provider hierarchy and quota-independent fallback.
- `src/pr-text-sanitizer.mjs` — prevents accidental Codex review trigger tokens in GitHub/GitLab writes.
- extensions to `src/unattended-credit-free-cycle.mjs` — incorporate evidence/knowledge deltas into the slow loop.
- extensions to `src/objective-planner.mjs` — emit research/evolution actions from knowledge gaps and novelty.
- extensions to `src/autonomy-orchestrator.mjs` — use the universal loop as default and call premium providers only as optional assistance.
- extensions to `src/autonomous-integration.mjs` — preserve exact-head integration and sovereign-evolution semantics while removing routine manual gating.
- release-baseline mirrors for new essential control-plane files.

Level-7 integration is through a narrow experiment adapter; the production core does not import the experimental runtime directly.

## 14. Policy changes

The autonomy policy remains automatic, but future implementation should remove repository text that requires stopping merely because the agent is uncertain when a deterministic sandbox/research path exists.

Policy language should state:

- investigate first;
- sandbox when uncertain;
- gather corroborating evidence;
- produce a candidate only when there is a measurable hypothesis;
- verify before integration;
- stop only for an actual platform-policy boundary, missing authorization/credential boundary, explicit owner stop, uncontrolled spend risk, or inability to preserve recovery/ownership.

This is a rollback of unnecessary approval friction, not a removal of execution integrity.

## 15. Testing strategy

Implementation follows TDD.

Required focused coverage includes:

- evidence normalization and content-addressing;
- provenance preservation;
- prompt/instruction text from Internet content never becoming executable authority;
- delta deduplication;
- contradictory-source handling;
- novelty/gap scoring;
- hypothesis generation only from measurable gaps;
- negative-knowledge retention;
- universal loop continues with every external model provider unavailable;
- optional provider order: local -> primary Codex -> Destiny -> other admitted zero-additional-cost providers;
- no metered fallback without an explicit admitted spend policy;
- PR text sanitizer removes the Codex mention trigger;
- exact-head-green autonomous integration still works;
- protected/core candidates still cannot self-approve using only their modified rules;
- Level-7 experiment output cannot directly mutate production authority.

A final `npm run verify` and exact-head Ubuntu/Windows CI remain required for integration.

## 16. Success criteria

The design is successful when:

1. Mahoraga can run its research/learning/evolution loop indefinitely with zero Codex/Gemini/Claude/Grok credits.
2. External model providers can disappear without stopping evidence acquisition, knowledge updates, deterministic experiments, repairs, or verified candidate production.
3. New public technical knowledge can be discovered, retained with provenance, challenged, tested, and converted into reusable skills.
4. Failed ideas are remembered and reduce repeated wasted work.
5. Level 7 accelerates exploration without becoming a self-authorizing production root.
6. Exact-head-green autonomous candidates integrate without routine owner approval.
7. Accidental Codex code-review triggers no longer appear in generated PR metadata or comments.
8. No uncontrolled paid spend is required for the core evolution loop.

## 17. Rollout sequence

Implementation should be decomposed into independent verified slices:

1. PR-text sanitizer and Codex-trigger suppression.
2. Evidence envelope + source cursor primitives.
3. Research-objective derivation from world state.
4. Knowledge ledger and contradiction/negative-knowledge model.
5. Universal-loop integration into unattended slow loop.
6. Hypothesis/experiment receipts and autonomous candidate generation.
7. Optional provider-assistance router with primary/Destiny/other hierarchy.
8. Level-7 experiment adapter.
9. Policy-text cleanup removing unnecessary uncertainty/manual gates.
10. Long-running research scheduler and adaptive cadence.

Each slice must be independently revertible and exact-head verified.