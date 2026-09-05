# Sovereign Coworker Fabric Design

## Status

Approved by the owner in conversation on 2026-09-05. This design extends Mahoraga's existing permanent-agent, shared-feat, zero-credit, autonomous-integration, verified-update, relay, and rollback foundations. It does not replace the existing Node ESM control plane or TypeScript UI surfaces.

## Goal

Make Mahoraga materially more capable than a fixed "AI coworker" product by combining five properties in one system:

1. durable specialist coworkers that keep objectives, inboxes, routines, feats, and scorecards across restarts;
2. demonstration-to-routine learning where a workflow can be shown once, corrected later, and replayed semantically rather than as raw clicks;
3. automatic multi-agent handoff and feat sharing so successful behavior becomes organizational knowledge;
4. a normally closed, specialized-purpose adaptive aperture system that can attach remote desktop/browser/development services only when an objective requires them; and
5. sovereign self-evolution where verified, rollback-safe core changes can promote automatically under the currently trusted generation.

## Non-goals

- No permanently open arbitrary TCP tunnel.
- No direct exposure of the loopback Mahoraga API to the public internet.
- No removal of owner sovereignty, emergency seal/revoke authority, or all rollback generations.
- No metered model spend merely to implement deterministic routing, replay, validation, or bookkeeping.
- No replacement of the current repository architecture.

## 1. Persistent Coworker Fabric

### 1.1 Coworker identity

A Foundry child manifest remains the durable identity/authorization declaration. Runtime coworker state is stored separately so identity does not churn when operational state changes.

Each coworker runtime record has:

- `agentId`
- lifecycle state: `idle`, `working`, `waiting`, `blocked`, `draining`, `sealed`
- current objective IDs
- inbox of handoff envelopes
- claimed routine IDs
- reusable feat IDs inherited from the shared ledger
- reliability scorecard counters
- last heartbeat and last successful activity timestamps

The parent Steward can create permanent specialists from capability gaps, but a specialist is useful only when it has a durable runtime state and can receive work independently.

### 1.2 Handoff envelope

Coworkers coordinate with a typed handoff envelope rather than free-form hidden context. A handoff includes:

- sender and recipient agent IDs;
- objective ID;
- requested capability;
- concise task statement;
- explicit input artifact/evidence references;
- expected output contract;
- urgency and deadline when present;
- whether the receiver may delegate again.

Handoffs are idempotent by a deterministic envelope ID.

### 1.3 Parent/child learning

Successful child feats are visible through the shared Feat Ledger. The Steward may reuse a child's feat, assign work to the child that proved it, or propagate the feat to another compatible specialist. Failures and blocked attempts remain evidence too; they reduce confidence rather than disappearing.

## 2. Demonstration -> Routine -> Autonomous Replay

### 2.1 Semantic routines

A routine is a versioned, parameterized workflow contract, not a recorded macro. It stores:

- routine ID and version;
- owner agent/capability;
- intent;
- typed parameters;
- semantic steps;
- preconditions;
- success evidence requirements;
- mutation/side-effect declarations;
- supported execution surfaces;
- confidence and observation counts;
- correction history;
- aperture capability requirements when needed.

A semantic step describes an action such as "open account record", "export invoice PDF", "post PR review", or "verify test result". Concrete UI selectors, URLs, or protocol details are execution hints, not the canonical meaning of the routine.

### 2.2 Compile from demonstration

A demonstration compiler consumes an ordered trace of observed actions with labels and evidence. It produces a routine candidate only when:

- there is a non-empty intent;
- every step has a semantic action and expected evidence;
- side effects are declared;
- parameters are explicitly identified rather than hard-coded secrets;
- the final success condition is observable.

The compiler never stores credentials in the routine.

### 2.3 Corrections stick

A correction creates the next routine version. The prior version remains immutable for audit and rollback. The correction records the reason and the step(s) changed. A corrected routine must collect new successful evidence before its confidence may exceed the prior trusted version.

### 2.4 Replay selection

Routine selection ranks candidates by:

1. capability match;
2. surface compatibility;
3. precondition satisfaction;
4. reusable successful evidence;
5. confidence;
6. recent failure penalties;
7. cost, latency, and aperture burden.

A replay must verify the routine's declared success evidence. "No exception" is not success.

## 3. Specialized-Purpose Adaptive Apertures

### 3.1 Governing rule

Replace the blanket tunnel prohibition with:

> Persistent, unbounded public exposure is prohibited. Mahoraga-controlled specialized-purpose apertures are a first-class capability.

An aperture is a leased route for one declared objective and capability. Mahoraga may automatically create a new specialized-purpose capability it has never used before when an independent validator accepts the request.

### 3.2 Supported classes

Examples include:

- `runtime-control`
- `desktop-interactive`
- `browser-cdp`
- `developer-preview`
- `mcp-remote`
- `database-maintenance`
- `webhook-ephemeral`
- `service-specialized`

The last class permits new protocols without a repository redesign, but it still requires an identified purpose, peer, target, TTL, idle TTL, and closure conditions.

### 3.3 Lease lifecycle

`closed -> requested -> validated -> leased -> active -> draining -> verified-close -> closed`

A lease includes:

- objective ID and requesting agent;
- capability class;
- target device/service and expected peer;
- protocol and local target metadata when known;
- absolute expiry and idle expiry;
- lateral-routing prohibition by default;
- validator receipt;
- close reasons.

The broker owns the lease. The requesting worker cannot extend it unilaterally.

### 3.4 Automatic opening

For an authorized objective, Mahoraga may open desktop/browser/specialized-purpose apertures automatically without owner approval. Novel capability classes require independent validation, not owner approval.

### 3.5 Self-closing invariants

Any of the following closes the aperture: objective completion, lease expiry, idle expiry, heartbeat loss, peer mismatch, integrity failure, explicit revocation, device loss, Steward Seal, or post-update verification completion.

## 4. Sovereign Core Evolution

### 4.1 Two integration lanes

Mahoraga retains the normal autonomous integration lane for ordinary changes and adds a sovereign evolution lane for changes that touch current protected core paths.

A protected-path candidate is eligible only when it carries a sovereign-evolution receipt proving:

- candidate was evaluated by the currently trusted epoch;
- independent validator passed;
- exact-head deterministic verification passed;
- rollback checkpoint exists;
- rollback rehearsal passed;
- canary passed;
- state compatibility passed;
- no owner-sovereignty invariant was modified.

Without that receipt, current protected-path rejection remains fail-closed.

### 4.2 Trust epochs

Each trusted generation is represented by a trust epoch containing:

- epoch ID;
- trusted commit;
- verifier fingerprint;
- rollback checkpoint ID;
- policy generation;
- activation timestamp.

Trusted epoch N evaluates candidate N+1. Candidate N+1 cannot use its modified rules to validate itself. Only after promotion does N+1 become the judge for N+2.

### 4.3 Owner sovereignty root

Mahoraga may autonomously evolve Supervisor, Planner, Foundry, Validator, routing, aperture policy, workers, memory, update machinery, and other core implementation.

The owner-only root is limited to actions that deliberately:

- transfer ultimate ownership/control to another principal;
- permanently remove the owner's seal/revoke/recovery authority;
- destroy every viable rollback generation; or
- irreversibly disclose or transfer root credentials establishing ownership.

## 5. Enhancement and Update Use of Apertures

Self-improvement jobs receive the same aperture authority as operational objectives. An enhancement may automatically attach a Windows worker, temporary browser, test service, webhook, MCP endpoint, development preview, validation database, or other specialized service when needed to prove the candidate.

The currently trusted generation controls the aperture policy used to test the candidate. A candidate cannot use its own relaxed aperture rules to validate itself.

## 6. Event-Driven Learning

The existing periodic stewardship cycle remains a maximum dormancy fallback, not the sole learning trigger. Improvement consideration may be triggered by failed objectives, recurring worker weakness, repeated successful patterns, new capabilities, external dependency drift, validator findings, or newly reusable feats.

## 7. First Implementation PR Scope

This PR establishes the deterministic control-plane contracts required for the larger architecture:

1. routine compilation, correction, ranking, and replay-verification contracts;
2. durable coworker state and idempotent handoff contracts;
3. specialized-purpose aperture request/validation/lease/closure contracts;
4. trust-epoch and sovereign-evolution receipt validation;
5. autonomous-integration support for protected-path candidates only when a valid sovereign receipt is present;
6. documentation update replacing the blanket inbound-tunnel prohibition with specialized-purpose aperture rules.

Actual OS firewall manipulation, SSH server provisioning, remote-desktop driver implementation, and cloud-host deployment remain separate execution adapters behind these contracts. The control plane must be able to reason about, authorize, validate, audit, and close those adapters before any adapter is introduced.

## 8. Acceptance Criteria

- Existing ordinary autonomous integration remains unchanged for unprotected changes.
- Protected paths remain rejected unless sovereign evidence is complete and exact-head.
- A novel specialized aperture can be authorized by an independent validator without owner approval.
- An aperture cannot be created without purpose, objective, target/peer, TTL, and close policy.
- Aperture closure is deterministic and cannot be overridden by the requesting worker.
- A demonstration can compile into an immutable routine candidate with no embedded secrets.
- A correction creates a new version without mutating the old version.
- Routine ranking prefers proven compatible routines and penalizes recent failures.
- Handoffs are deterministic and idempotent.
- Coworker state survives serialization with lifecycle and scorecard information intact.
- All new production behavior is covered by Node test cases and the full `npm run verify` gate.
