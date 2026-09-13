# Personal-Sovereign Evolution Architecture

Status: **design for owner review**  
Date: 2026-09-12  
Baseline: protected `main` at `0fd4fc4f0dea5d50bbe47695793f139201926608`  
Product identity: **Mahoraga**

## 1. Decision

Mahoraga is a **personal-first, provider-second, owner-sovereign execution fabric**.

No external vendor, enterprise tenant, model provider, hosting vendor, plugin, desktop, or subscription is allowed to become the root of Mahoraga's identity, memory, authority, continuity, or owner relationship.

External systems are interchangeable capability providers. They may add reach, compute, reasoning, data, or execution capacity, but they do not become Mahoraga's brain or constitutional authority.

This design locks the architecture so future work does not repeatedly reopen the same sovereignty debate.

## 2. Goals

1. Give the owner one direct, person-like Mahoraga interface.
2. Keep Mahoraga operational when any individual provider is unavailable, exhausted, revoked, enterprise-controlled, or replaced.
3. Preserve zero-incremental-cost routing by default.
4. Permit Mahoraga to experiment on, mutate, test, challenge, and improve descendants of itself without corrupting the incumbent.
5. Permit verified core changes to promote automatically under delegated owner authority without routine manual approval.
6. Preserve owner stop, revoke, recovery, and ultimate control outside autonomous transfer.
7. Reuse the substantial evolution, autonomous integration, receipt, verification, rollback, UCF, and runtime-provenance machinery already merged.
8. Eliminate duplicate authority models and conflicting documentation.

## 3. Non-goals

- No replacement rewrite of the existing repository.
- No second permanent orchestration brain in Microsoft, ChatGPT, Copilot Studio, Railway, Dataverse, GitHub, or any other provider.
- No direct mutation of protected `main` by a running production process.
- No bypass of exact-head verification, rollback, canary, provenance, or branch protection.
- No automatic paid fallback.
- No transfer of owner root authority to a platform, service account, model, agent, or enterprise administrator.

## 4. Constitutional invariants

These invariants supersede conflicting architectural assumptions but do not bypass the repository's existing safety and protection contracts.

### 4.1 Personal first

Mahoraga's durable identity, objective lineage, operational memory, authority state, evolution state, and receipts belong to Mahoraga-controlled state and private repository contracts.

Enterprise systems are adapters. Microsoft 365, Copilot Studio, Dataverse, Graph, Power Platform, and similar enterprise services may be used when lawful and useful, but they are detachable and non-authoritative.

### 4.2 One core, many providers

There is one authoritative Mahoraga core and one canonical objective lineage.

Providers compete to satisfy capabilities through the Universal Capability Fabric. A provider may disappear without redefining Mahoraga.

### 4.3 One owner root

Ultimate owner sovereignty remains outside autonomous transfer.

The owner can stop, revoke, seal, recover, or narrow authority. Mahoraga may not permanently remove those powers, deliberately transfer them to another principal, or destroy every viable rollback generation.

### 4.4 Zero incremental cost by default

Every route is classified at the execution boundary as one of:

- `deterministic-zero`
- `subscription-included`
- `quota-limited-included`
- `metered`
- `unknown`

Default operation admits the first two, conditionally admits the third only with fresh allowance evidence, and blocks the last two unless the owner explicitly changes spending policy.

### 4.5 Source, deployment, and runtime truth remain separate

Private GitHub `main` is canonical source truth.

A successful merge does not prove deployment. A successful deployment label does not prove runtime readiness. A live listener does not prove current source. Exact provenance must remain observable and fail closed.

## 5. Two permanent evolution lanes

Mahoraga has two fundamentally different lanes.

### 5.1 Incumbent lane

The incumbent is the currently trusted generation.

Responsibilities:

- serve owner objectives;
- maintain the authoritative objective/memory/receipt state;
- evaluate descendants;
- hold the active trust epoch;
- enforce provider, cost, authority, data, and provenance policy;
- preserve at least one viable rollback generation;
- never use candidate-modified rules to approve that same candidate.

The incumbent may create candidates, but it does not rewrite its own active source tree in place.

### 5.2 Descendant / evolution arena

A descendant is an isolated candidate generation created from an exact incumbent base.

A descendant may:

- mutate core or non-core code inside a disposable candidate root;
- run experiments;
- generate alternate implementations;
- challenge incumbent assumptions;
- perform regression, adversarial, and compatibility testing;
- benchmark routes and planners;
- add or remove candidate-only components;
- create additional child candidates;
- fail, crash, or be discarded without damaging the incumbent.

A descendant has no authority merely because it exists or performs well.

## 6. Descendant identity

Each descendant receives an immutable identity envelope containing at minimum:

- candidate ID;
- parent trust epoch;
- exact base SHA;
- exact candidate head SHA;
- candidate epoch ID;
- mutation objective digest;
- allowed mutation surface;
- cost policy;
- data-class ceiling;
- creation timestamp;
- validator identity requirements;
- rollback predecessor;
- experiment lineage.

Descendants are branches/worktrees/artifacts, not permanent independent Mahoraga brains.

## 7. Mutation model

### 7.1 Ordinary mutation

Unprotected changes continue through the existing autonomous integration lane.

### 7.2 Core mutation

Protected/core changes use the existing Sovereign Evolution model, extended into a first-class delegated core-mutation path.

A core candidate must be based on incumbent rules and cannot approve itself with modified policy.

The existing sovereign receipt requirements remain the minimum:

- independent validator passed;
- deterministic verification passed;
- rollback checkpoint created;
- rollback rehearsal passed;
- canary passed;
- state compatibility passed;
- sovereignty invariant passed;
- receipt bound to exact candidate SHA and trusted incumbent epoch.

### 7.3 Immediate core changes

The owner's standing authority grant may delegate core evolution without requiring a new human approval for every verified candidate.

That delegation must be machine-readable and revocable. It does **not** mean bypassing protection. It means repository policy may authorize automatic squash merge and release after every required incumbent-governed proof succeeds.

The owner remains able to force a human review mode, revoke scopes, seal evolution, or narrow eligible paths.

## 8. Promotion contract

Promotion is evidence-driven and atomic.

A descendant may promote only when all required proofs refer to the exact same head SHA:

1. descendant base is current or has been deterministically reconciled with current `main`;
2. affected focused tests pass;
3. full required exact-head repository verification passes;
4. independent validation passes;
5. state migration compatibility passes;
6. immutable candidate artifact exists when activation requires one;
7. rollback checkpoint exists;
8. rollback rehearsal succeeds;
9. canary succeeds;
10. owner-sovereignty invariant succeeds;
11. spending policy succeeds;
12. deployment/runtime provenance checks succeed for activation stages;
13. candidate remains mergeable and is not stale;
14. incumbent policy, not candidate policy, produces the final authorization decision.

When all conditions pass under active delegated authority, the existing Autonomous Integration mechanism may squash-merge automatically.

Any failed, missing, stale, ambiguous, or contradictory proof produces `hold` or `blocked`, never optimistic success.

## 9. Trust epoch transition

The current repository already has an incumbent trust-epoch contract. The transition mechanism must be made explicit and unified with activation.

After a sovereign candidate is successfully merged, activated, canaried, and checkpointed:

1. the previous incumbent remains the rollback predecessor;
2. a new trust epoch is derived from the activated exact source SHA and verifier fingerprint;
3. the new epoch becomes authoritative only after activation evidence is complete;
4. the previous epoch becomes historical, not silently overwritten;
5. descendants created before the transition either rebase/revalidate or remain bound to their original parent epoch and cannot claim current authority.

Trust-epoch rotation must be its own verified state transition, not an incidental file edit.

## 10. Canonical authority model

Mahoraga currently has multiple related authority concepts: owner authority scopes, autonomy policy, protected paths, sovereign receipts, integration leases, capability permission classes, and provider authorization.

These remain distinct enforcement layers, but they must project into one canonical decision object:

`AuthorityDecision`

Required fields:

- owner grant ID and state;
- requested capability;
- requested mutation class;
- affected paths/resources;
- provider identity;
- data class;
- cost class;
- attendance requirement;
- integration lease identity;
- trust epoch;
- candidate head SHA when relevant;
- decision: `allow | hold | deny`;
- deterministic reason codes;
- expiry/revocation metadata.

No worker, model, plugin, Microsoft tenant, repository branch, or candidate can expand its own authority by assertion.

## 11. Canonical state and memory

Mahoraga-controlled durable state is authoritative.

Canonical operational state remains based on the existing durable SQLite/task/event model and encrypted content-vault contracts unless a later approved migration changes the storage engine.

External stores may mirror or enrich state, but are never assumed authoritative by default.

Dataverse, SharePoint, Teams, Gmail, Google Drive, ChatGPT memory, plugin state, Railway metadata, and provider-specific memory are contextual sources or execution surfaces, not Mahoraga's constitutional memory.

## 12. Provider federation

Providers are admitted behind explicit contracts.

### Personal providers

Examples: private GitHub, owner ChatGPT subscription, owner GitHub Copilot subscription, owner-authorized desktops and personal cloud services.

They may receive broader personal-data eligibility when the owner grant permits it.

### Enterprise providers

Examples: employer-managed Microsoft 365, Copilot Studio, Dataverse, SharePoint, enterprise desktop sessions.

They are always treated as detachable enterprise adapters. Enterprise administrator control, retention, monitoring, or revocation must never strand Mahoraga's root identity or continuity.

### Execution providers

Examples: Railway, browser providers, GitHub Actions, local Windows workers, future cloud compute.

They provide runtime/execution capacity only. Hosting does not grant product authority.

### Model providers

Models supply reasoning or generation. Model output is evidence input, not authority.

## 13. Direct owner interface

The long-term front door is Mahoraga's own host-neutral cloud workspace, paired to the authoritative Mahoraga core.

Teams, Copilot, ChatGPT, GitHub, desktop tools, voice interfaces, and plugins can remain alternate ingress/egress surfaces.

The owner should not have to operate Mahoraga by manually coordinating those providers. Mahoraga should route to them.

## 14. What already exists and should be reused

Current `main` already contains major pieces of this architecture:

- Universal Capability Fabric and ranked routing;
- owner authority grant in the manifest;
- automatic integration policy;
- exact-head verification gates;
- Sovereign Evolution receipts;
- incumbent trust epoch;
- Autonomous Integration workflow;
- evolution controller with isolated candidate roots;
- immutable artifact, canary, activation, and rollback stages;
- self-extension candidate production;
- runtime source provenance and drift detection;
- durable SQLite objective/task/event state;
- encrypted content vault;
- zero-credit and billing-class concepts;
- rollback predecessor protection;
- owner stop/override invariant.

The goal is to converge these pieces into one operating model, not create a second framework.

## 15. Current conflicts to reconcile

The implementation phase must explicitly address these conflicts rather than layering around them.

### 15.1 Authority duplication

`ownerAuthority`, autonomy policy, sovereign evolution, integration leases, and capability permission classes are individually useful but do not yet emit one unified authority decision contract.

### 15.2 Trust epoch lifecycle

The incumbent trust epoch is static repository state and is materially behind current `main`. Core evolution needs an explicit activated-generation epoch rotation path.

### 15.3 Enterprise coupling

Current configuration contains Microsoft/Dataverse-specific queue and provider state. That is acceptable as adapter configuration but must not be required for canonical task durability, identity, memory, or startup.

### 15.4 Builder dependency

The primary builder path is coupled to a licensed Codex route that can become quota-unavailable. Evolution must be able to stage deterministic or alternate-provider work when that route is unavailable, while still respecting capability and cost admission.

### 15.5 Workspace authority drift

Open issue/PR work still exists around removing GitHub Pages as a runtime-default interaction origin. The host-neutral workspace contract must remain canonical.

### 15.6 Private repository truth

Operator-deck reads must use authenticated server-side private-repository access and fail closed rather than pretending unauthenticated/public fallback data is authoritative.

### 15.7 Runtime convergence

Repository source, Railway/cloud runtime, and Windows live-runtime state are not yet fully converged. Evolution cannot claim operational success until deployment/runtime provenance agrees with exact source.

### 15.8 Interaction readiness

Process health and owner-conversation readiness are separate. The in-flight interaction-readiness work should remain compatible with this design and feed provider/routing truth rather than becoming a new authority plane.

## 16. Implementation sequence after owner approval

### Phase A — Constitutional convergence

- add one canonical architecture/authority contract;
- reconcile conflicting docs and stale assumptions;
- define the unified `AuthorityDecision` projection;
- preserve current protection and verification behavior;
- add deterministic tests proving external providers cannot become root authority.

### Phase B — Trust epoch and descendant registry

- add explicit activated-generation trust-epoch rotation;
- add descendant lineage registry and immutable candidate identity envelope;
- bind every descendant to parent epoch and exact base SHA;
- add stale-parent/rebase/revalidation behavior.

### Phase C — Evolution arena

- make disposable descendant creation a first-class runtime capability;
- allow bounded experimental mutations in isolated roots;
- add experiment receipts, regression comparison, and discard semantics;
- permit core mutation only through Sovereign Evolution evidence.

### Phase D — Unified promotion engine

- converge `evolution-controller` and `autonomous-integration` responsibilities around one evidence bundle;
- ensure incumbent policy is the final judge;
- add automatic squash integration under active delegated authority;
- keep `hold` behavior for stale/missing proofs;
- rotate trust epoch only after verified activation.

### Phase E — Provider sovereignty and cost admission

- make every provider removable without breaking canonical startup/state;
- demote enterprise-specific queue/storage assumptions to adapters;
- enforce billing classes at execution boundary;
- add fresh quota evidence for `quota-limited-included` routes;
- prevent `metered` or `unknown` fallback by default.

### Phase F — Runtime convergence and direct interface

- finish authoritative cloud/runtime deployment convergence;
- finish Windows live-runtime convergence;
- finish authenticated private-repository operator reads;
- remove stale workspace-origin assumptions;
- make the host-neutral Mahoraga workspace the direct owner interface.

### Phase G — Continuous adaptive evolution

- schedule bounded descendant experiments;
- compare incumbent vs descendants with deterministic and observed metrics;
- preserve failed experiments as compact lessons, not active code;
- allow successful descendants to promote through the same proof path;
- prevent self-generated metrics from becoming sole promotion evidence.

## 17. Testing strategy

Every implementation PR derived from this design must use focused RED/GREEN tests and exact-head `npm run verify` before integration.

Required architecture-level tests include:

- provider removal does not destroy canonical Mahoraga identity/state;
- Microsoft/enterprise provider unavailable does not prevent personal core startup;
- candidate active-root equality is rejected;
- candidate cannot approve itself with candidate-modified policy;
- stale trust epoch rejects promotion;
- exact-head mismatch rejects promotion;
- missing independent validator rejects promotion;
- missing rollback rehearsal rejects promotion;
- failed canary rolls back;
- metered/unknown route is denied under zero-cost mode;
- quota-limited route requires fresh allowance evidence;
- owner revoke/stop blocks new autonomous mutation;
- owner root survives descendant promotion;
- successful activation rotates trust epoch only after all required evidence;
- descendant failure leaves incumbent source/state intact;
- process health does not imply conversational readiness;
- repository truth does not imply deployment/runtime truth.

## 18. Migration rule

No big-bang rewrite.

Changes land as bounded, reviewable, squash-merged PRs against current `main`.

Existing functionality is preserved unless a PR explicitly proves a conflicting path is superseded. Historical evidence, rollback artifacts, release baselines, and state migration support are retained until their retirement criteria are proven.

## 19. Merge and release model

For this design PR:

- documentation only;
- no runtime activation;
- no Windows candidate activation;
- no provider spend;
- no automatic merge requested;
- owner reviews in GitHub.

For future implementation PRs:

- ordinary unprotected work may use existing Autonomous Integration;
- protected/core work uses Sovereign Evolution;
- exact-head required checks remain authoritative;
- eligible verified work may auto-squash under delegated repository policy;
- owner can always stop, revoke, or force manual review.

## 20. Definition of done

This architecture is complete when the owner can interact directly with Mahoraga and the following statements are true:

1. Mahoraga remains itself if Microsoft, ChatGPT, Copilot, Railway, GitHub Actions, or a desktop provider disappears.
2. Mahoraga can create isolated descendants, mutate them aggressively, test them, and discard them without damaging the incumbent.
3. Mahoraga can promote verified core improvements automatically under delegated authority without bypassing incumbent-governed proof.
4. The owner retains ultimate stop/revoke/recovery authority.
5. No enterprise tenant is required for identity, memory, canonical state, or continuity.
6. No metered provider is used silently.
7. Source, deployment, and runtime truth are independently observable.
8. One canonical authority decision explains why every sensitive action is allowed, held, or denied.
9. The direct owner-facing workspace is Mahoraga's own replaceable, host-neutral interface.
10. Future architecture discussions start from this contract rather than reopening the sovereignty model.
