# Single Mahoraga Core Architecture

Date: 2026-09-05
Status: Approved design, implementation not started
Target candidate: 7.0.0-alpha.2

## 1. Objective

Mahoraga must present and operate as one product, one authority plane, and one version line.

The current repository already contains most of the required power, but it is divided across the loopback runtime, the Vercel cloud workspace, and candidate UCCP logic. The consolidation goal is not to collapse all code into one process or one host. It is to make every host and surface subordinate to one authoritative Mahoraga control core.

After this change:

- there is one Mahoraga product version;
- there is one conversation/task orchestration authority;
- there is one capability-routing authority;
- there is one UCCP/policy/verification authority;
- the browser app is a presentation and transport surface, not a second brain;
- cloud execution is exposed to the same core as a bounded capability worker;
- loopback remains private and internal;
- all results re-enter the same durable run, verification, receipt, vault, and autonomy graph.

## 2. Provenance and retained work

This architecture deliberately reuses the strongest logic already merged or staged in prior work rather than re-implementing it.

Retain and consolidate:

- PR #79: policy-bound autonomous execution, exact-base task staging, execution cells, lease authority, six-stage autonomous graph.
- PR #80: `cloud-app/` as the sole browser UI, encrypted cloud-to-runtime relay, loopback as an internal boundary.
- PR #86/#156/#158: fail-closed Destiny trust, signed receipt semantics, event delivery separation, replay rejection, bounded telemetry.
- PR #163: candidate UCCP, authenticated PGA telemetry, watchdog, canary and emergency rollback.
- PR #166: local encrypted-vault containment for UCCP decision content. This is a prerequisite or must be rebased into the fusion implementation before promotion.

Do not resurrect superseded legacy UI, Pages, public localhost rewrites, or a second supervisor.

## 3. Architectural invariant: one brain, many surfaces

The authoritative control path is:

`User/App -> Conversation Gateway -> UCCP + Task Policy + Capability Router -> Worker/Provider Capability -> Verification -> Receipt/Vault -> Conversation Gateway -> App`

No other surface may perform independent final task routing or independent Mahoraga policy decisions.

### 3.1 Authoritative core

The authoritative Mahoraga core remains the Node ESM runtime under `src/` and owns:

- conversation gateway;
- durable run/task state;
- supervisor and worker lifecycle;
- task policy and autonomy policy;
- capability registry and routing;
- execution cells and integration leases;
- UCCP observation/synthesis metadata;
- content vault ownership;
- verification and receipts;
- self-healing and rollback authority;
- release/promotion authority.

The core may run on loopback because local device capabilities and local-only state require a private host. Loopback is an implementation boundary, not a separate Mahoraga product.

### 3.2 Browser application

`cloud-app/` remains the sole browser-facing Mahoraga UI.

It must become a thin Mahoraga client:

- render conversations, task/run state, capabilities, receipts, UCCP candidate status and approvals;
- establish the existing authenticated encrypted relay to the core;
- submit user objectives to the core conversation gateway;
- render streamed core events and final receipts;
- expose cloud-hosted capabilities only through bounded worker adapters registered with the core.

The app must not independently choose the final model, system prompt, tool set, task graph, approval policy, or final answer path.

If the authoritative core is unavailable, the app fails closed into a disconnected/read-only state. It must not silently fall back to a separate cloud-only Mahoraga brain.

## 4. Cloud model and browser become capability workers

The existing direct `/api/chat` path currently behaves like a second orchestration brain because it chooses a model, system prompt, context compaction, tools, step budget, and final streaming behavior.

That authority must be removed from the UI route.

### 4.1 Cloud model capability

Create a bounded cloud-model worker adapter with capabilities such as:

- `assistant.respond.cloud`;
- `research.web.cloud`;
- optional future provider-specific capabilities.

The Mahoraga core decides whether and when to invoke it. The cloud side executes only the supplied bounded worker request and returns a bounded result/evidence envelope.

Provider configuration such as GPT-5.6 Sol, reasoning effort, token limits, search limits, and provider credentials remains cloud-hosted configuration, but it is worker implementation configuration rather than Mahoraga orchestration policy.

Cloud model output is evidence/result material. It returns to the same core run and can be challenged, verified, combined with local evidence, routed to another worker, or rejected before the final answer is emitted.

### 4.2 Cloud browser capability

The cloud browser remains a separately permissioned worker. Domain allowlists, approval requirements, and HTTPS-only execution remain intact.

The app must not directly grant browser authority to a model. The core routes a browser task to the browser capability only after task policy and approval gates are satisfied.

## 5. Relay model

Retain the encrypted, owner-bound, fixed-origin relay introduced by prior cloud-workspace work.

The relay is a transport, not an authority plane.

Rules:

- no public exposure of 127.0.0.1:4782 or 4783;
- no Vercel-to-localhost rewrite;
- no wildcard CORS;
- no generic proxy route;
- no persistence of local runtime tokens in Git or SQLite;
- relay frames remain bounded and authenticated;
- cloud worker invocation uses explicit typed envelopes;
- inbound UI objectives and outbound worker results join the same core run identity.

## 6. One product version

Mahoraga has exactly one product version source of truth.

Target for the fusion candidate: `7.0.0-alpha.2`.

Required alignment:

- root `package.json` version = `7.0.0-alpha.2`;
- `cloud-app/package.json` version = `7.0.0-alpha.2`;
- manifest top-level product version = `7.0.0-alpha.2`;
- runtime/API/UI status surfaces report the same product version;
- candidate 4783 reports the same product version plus `candidate: true`, not a separate product version.

The current manifest `versions` block must be normalized so subcomponents do not masquerade as different Mahoraga versions.

Replace separate product-like version fields with protocol/implementation revisions where needed, for example:

- `apiProtocol`;
- `taskSchema`;
- `workerContract`;
- `relayProtocol`;
- `capabilityRegistrySchema`;
- worker `implementationRevision` rather than worker `version`.

These revisions describe compatibility, not separate Mahoraga products.

The prior Windows 3.6.0 runtime is retained only as a rollback artifact until the unified 7.0 candidate is promoted. It is not advertised as an active second Mahoraga.

## 7. Candidate and production topology

Port 4783 is a temporary canary instance of the same Mahoraga release candidate, not a separate edition.

During fusion verification:

- 4782 remains the current authoritative production boundary;
- 4783 runs `7.0.0-alpha.2` against isolated candidate state;
- UCCP watchdog, vault containment and rollback remain active;
- app/operator status clearly labels the connection as `candidate` or `production` without changing product identity.

After successful promotion:

- the unified release becomes the canonical 4782 runtime;
- 4783 returns to candidate-only use for future changes;
- no parallel 3.x or cloud-only Mahoraga remains active.

## 8. Data ownership and containment

One-core fusion must preserve the Truth and Containment rules.

- Runtime tokens are memory/runtime state only and never stored in Git or SQLite.
- Content-bearing local writes go to the encrypted content vault.
- SQLite contains bounded references, hashes, state, leases, timestamps, counters and operational evidence only.
- UCCP stores/streams no raw private chain-of-thought.
- Cloud and relay persistence must not contain local vault plaintext, local credentials, browser history or hidden reasoning.
- Any cloud result required for durable local use enters the local vault through the authoritative core before being referenced by durable local state.

## 9. Authority and autonomy

Fusion must increase usable capability without creating multiple actors with overlapping state-changing authority.

The core remains the only component allowed to:

- create authoritative tasks/runs;
- choose final routing;
- hold integration leases;
- approve autonomous state transitions under policy;
- decide whether evidence is sufficient;
- emit final verified task receipts;
- trigger candidate rollback or promotion.

Workers may implement, inspect, reason, browse, research, or return evidence according to their contracts, but they cannot independently integrate or declare the global task complete unless their existing contract explicitly delegates a bounded subtask result.

Destiny, Codex Builder, local reasoners, cloud model, browser, repository and desktop workers therefore become peers under the same router rather than alternate Mahoraga brains.

## 10. UI/operator behavior

The sole app should expose one coherent Mahoraga state:

- product version and connected core commit;
- production/candidate environment badge;
- connection health;
- active run/task graph;
- current routed capability/worker;
- bounded UCCP state and lease freshness;
- verification/receipt state;
- rollback/canary state;
- capability readiness and legal waits.

The app must never show a cloud-model answer as a completed Mahoraga answer until the authoritative core has accepted the result into the run lifecycle.

## 11. Failure behavior

Fail closed on authority ambiguity.

Examples:

- Core disconnected: UI cannot launch an independent cloud Mahoraga session.
- Relay identity mismatch: reject the frame; do not retry through a weaker route.
- Duplicate run/envelope: idempotency/replay controls suppress duplicate execution.
- Cloud model unavailable: router may use another admitted capability or return a bounded provider gap.
- Local-only data would cross into an unapproved cloud worker: policy rejects routing.
- Candidate containment canary fails: existing watchdog/rollback path owns recovery.
- Product-version mismatch across app/core handshake: surface degraded/incompatible state and block state-changing actions.

## 12. Migration sequence

Implementation should be decomposed into bounded waves rather than one giant rewrite.

### Wave 1 — Identity and anti-split-brain contract

- add one canonical product-version contract;
- align root/app/manifest version to `7.0.0-alpha.2`;
- replace product-like subversions with protocol/implementation revisions;
- add tests that reject version divergence and more than one orchestration authority.

### Wave 2 — Cloud model worker extraction

- extract the current cloud model/search execution from `/api/chat` into a bounded cloud worker adapter;
- remove independent final orchestration decisions from the app route;
- define typed cloud worker request/result envelopes;
- ensure no hidden reasoning is persisted or forwarded as durable evidence.

### Wave 3 — App-to-core conversation convergence

- make all browser conversation starts/continuations enter `createConversationGateway` through the encrypted relay;
- project core run events back into UI streaming;
- keep attachments/data-class metadata policy-bound;
- disable cloud-only fallback when the core is disconnected.

### Wave 4 — Capability convergence

- register cloud model/search/browser as core-visible capabilities;
- ensure local, repository, Destiny, Codex, cloud and browser workers all appear in one capability registry;
- centralize final routing and completion under core policy/verification.

### Wave 5 — UCCP/operator convergence

- surface candidate UCCP metadata, lease freshness, canary and rollback state through the same app;
- preserve vault-only decision content from PR #166;
- keep rollback authority local/core-owned.

### Wave 6 — Promotion and retirement

- run exact-head Ubuntu + Windows verification;
- run real local 4783 canary and intentional rollback drill;
- validate cloud/app connection against the same candidate version/commit;
- promote unified `7.0.0-alpha.2` to canonical 4782 only after receipts are complete;
- retire active 3.6.0 identity and any remaining cloud-only orchestration path;
- retain prior production artifact only for bounded rollback.

## 13. Test and verification requirements

Required regression classes:

1. Version identity
   - root/app/manifest must report one product version;
   - candidate and production differ by environment, not product version;
   - handshake rejects incompatible product versions.

2. Single authority
   - app cannot independently route a final Mahoraga task;
   - all browser-originated objectives create a core run;
   - cloud result cannot become final without core verification.

3. Relay containment
   - fixed origin/authenticated encryption/replay checks remain green;
   - no localhost exposure or generic proxy route;
   - disconnected core fails closed.

4. Capability routing
   - cloud model/browser workers are discoverable through the same capability index;
   - policy can prefer/reject/fallback without UI-side routing logic.

5. Data containment
   - runtime token never enters SQLite/Git;
   - content-bearing UCCP/cloud durable data enters vault before durable reference;
   - raw private reasoning is rejected from persistence/telemetry.

6. Candidate safety
   - 4783 startup/readiness;
   - UCCP lease freshness;
   - intentional canary trip;
   - emergency rollback;
   - clean restart;
   - production 4782 unaffected during failed candidate.

7. Repository verification
   - focused tests for each wave;
   - `npm run verify:conversation-plane`;
   - full `npm run verify`;
   - exact-head `Verify (ubuntu-latest)` and `Verify (windows-latest)`.

Vercel workspace verification may run for UI assurance but is not a PR-completion gate.

No Codex code review is required or permitted for this project workflow.

## 14. Non-goals

This fusion does not:

- create an active-active distributed Mahoraga cluster;
- expose loopback ports publicly;
- replace Node ESM core with TypeScript/JavaScript app code;
- move local encrypted-vault keys to Vercel;
- create a second supervisor;
- fabricate Destiny identity/readiness;
- enable paid model health checks merely for assurance;
- remove candidate rollback boundaries;
- merge all files into one package/process merely for cosmetic unity.

The goal is one logical Mahoraga authority with bounded physical adapters, not one monolithic executable.

## 15. Acceptance criteria

The fusion is complete when all of the following are true:

- every visible Mahoraga surface identifies as the same product version;
- `cloud-app/` cannot produce an authoritative Mahoraga answer without the core run lifecycle;
- local, cloud, browser, repository, model, Destiny and Codex capabilities are routed through one core capability graph;
- one conversation gateway owns user objectives regardless of surface;
- UCCP, policy, verification, receipts, vault and rollback remain core-owned;
- the app presents one coherent state for the connected core;
- no separate cloud-only Mahoraga policy brain remains;
- the 4783 candidate passes the canary and rollback drill;
- the promoted 4782 runtime and app report the same version and commit identity;
- the former 3.6.0 runtime exists only as a rollback artifact, not an active product identity.
