# Mahoraga 7.0 Truth and Containment Design

**Status:** Approved under the owner's standing autonomy instruction on 2026-08-25  
**Release target:** `7.0.0-alpha.1`  
**Production predecessor:** `3.6.0` at commit `397acebf16766f44e3b4317f9d8b68b10de5f821`

## Purpose

Mahoraga 7.0 begins by making every authority, capability, completion, and production claim true. This release does not add broad new provider powers. It creates the trust substrate required for later autonomous planning, agent generation, Microsoft/Dataverse activation, and self-evolution.

The release is successful when an untrusted loopback caller cannot initiate or inspect sensitive work, a worker cannot become routable from a heartbeat alone, every completion receipt is validated end to end, Codex cannot edit the authoritative checkout directly, and the Control Center distinguishes observed, inferred, and verified state.

## Governing principles

1. Normal authorized operation is prompt-free. Authority is enforced by standing policy and local sessions rather than repeated conversational approvals.
2. The server derives execution policy. Callers may request an outcome but cannot assert their own capability, execution plane, data class, provider, or authority.
3. Process liveness is not provider readiness. Provider readiness is not capability verification. Only a fresh successful canary makes a write-capable capability routable.
4. Receipts are typed by capability family and validated before persistence. A malformed receipt fails the task without terminating the worker.
5. Production is never a scratchpad. Code-writing agents operate in isolated candidate worktrees under a path lease and return evidence for integration.
6. Content and operational metadata are separate. SQLite stores bounded metadata, hashes, references, classifications, and expiry; content belongs in the local content vault.
7. Repair and monitoring record incidents and transitions, not healthy polling noise.
8. Tests run at large integration boundaries, not after ordinary edits.

## Scope

### Included

- Uniform authentication classification for HTTP routes.
- One-time, loopback-only Control Center session bootstrap with an HttpOnly cookie.
- Server-derived task policy and removal of caller-controlled routing authority.
- Typed receipt registry covering all enabled worker families.
- Three-layer readiness model: process, provider, capability canary.
- Route eligibility based on policy plus verified readiness.
- Safe supervisor handling for receipt and persistence failures.
- Candidate-worktree contract for `codex.execute`.
- Sensitive task and conversation redaction from unauthenticated and metadata-only surfaces.
- Content-vault reference contract for future migration of persisted content.
- Incident-only automatic-repair ledger behavior.
- Truthful Control Center terminology and generated status copy.

### Deferred to later Mahoraga 7.0 subsystems

- Natural-language objective decomposition.
- Multi-agent councils and provider competition.
- Long-term semantic and procedural memory.
- Dataverse or Microsoft semantic-data activation.
- Agent Foundry and automatic self-promotion.
- A/B production release slots.
- Full Control Center 7 redesign.

## Architecture

### Trust boundary

The static shell, `GET /api/status`, and `GET /api/identity` remain readable on loopback. All mutations and all sensitive reads require an authenticated local session. Sensitive reads include tasks, conversations, artifacts, objectives, improvements, coordination records, and provider receipts.

The runtime loads the existing OS-protected primary token. `scripts/open-control-center.ps1` requests a single-use bootstrap nonce through a local authenticated CLI call, opens the browser to `/session/bootstrap?nonce=<value>`, and the server exchanges it for a random HttpOnly, `SameSite=Strict` session cookie before redirecting to `/`. The nonce expires after 30 seconds and is invalid after one use. Sessions expire after eight hours of inactivity and are held in memory, so a runtime restart invalidates them.

API clients may continue to use `Authorization: Bearer <primary-token>`. Cookie authentication is accepted only for same-origin loopback requests. State-changing cookie requests require an exact Origin or Referer match and reject cross-site requests.

### Server-derived task policy

`deriveTaskPolicy()` receives the authenticated source, route identity, requested outcome, attachment metadata, current attended-session state, and manifest. It returns the only task envelope the database accepts:

```js
{
  source,
  intent,
  capability,
  dataClass,
  executionPlane,
  attendedRequired,
  allowedWorkerIds,
  authoritySessionId,
  integrationLeaseId,
  contentReferences,
  policyVersion: "7.0.0-alpha.1"
}
```

The generic intake route accepts `intent`, `requestedOutcome`, and attachment references. It does not accept authoritative values for `capability`, `dataClass`, `executionPlane`, `workerId`, or `attendedRequired`. Specialized routes map to fixed policy templates. Unknown intent, ambiguous data class, unavailable attended state, or missing integration lease returns a non-retryable policy error before task creation.

### Receipt registry

Workers return a common completion envelope:

```js
{
  schemaVersion: 1,
  capability,
  outcome: "succeeded" | "failed" | "waiting",
  summary,
  evidence: [{ type, ref, sha256, observedAt }],
  metrics: { durationMs },
  details
}
```

`details` is validated by a capability-family schema:

- `system.*`: health observations and manifest evidence.
- `repository.*`: repository path, base/head commit, changed paths, validation state.
- `browser.*`: target origin, observation type, title/status evidence, screenshot hash when present.
- `desktop.*`: attended session, window identity, before/after observation hashes.
- `m365.*`: tenant/environment identity, operation type, content-access evidence without content.
- `codex.*`: candidate worktree, base/head commit, allowed/changed paths, execution session, usage, validation state.
- `repair.*`: incident identifier, affected files, checkpoint, action, verification, rollback state.

Unknown fields are rejected. Content, prompts, model responses, document previews, tokens, and secrets are rejected from receipts. Validation returns a normalized receipt or a stable error code. The supervisor catches validation and persistence failures, marks the task failed, records one bounded incident, releases the worker, and keeps the process alive.

### Capability readiness

Each worker and capability exposes separate state:

```js
{
  process: "stopped" | "starting" | "live" | "stale" | "crashed",
  provider: "unknown" | "unavailable" | "degraded" | "ready",
  canary: "never" | "stale" | "failed" | "verified",
  routable: false,
  evidenceLevel: "observed" | "inferred" | "verified",
  lastObservedAt,
  lastVerifiedAt,
  reason
}
```

`ready` IPC establishes process liveness only. A capability is routable only when the process is live, provider readiness is ready, the canary is verified and fresh, policy permits the task, and required attended/lease state is present. Read-only deterministic local capabilities may use a 24-hour canary TTL. Write-capable, browser-session, Desktop, Microsoft, and Codex capabilities use a 15-minute TTL.

Canaries are bounded and content-free. They prove the exact capability contract, not only executable presence.

### Codex candidate execution

`codex.execute` requires an integration lease and an immutable base commit. The worker creates a worktree beneath `state/execution-cells/codex/<task-id>`, creates a task branch, and invokes Codex only inside that worktree. The task envelope contains exact allowed paths. Completion fails if any changed path is outside the allowlist, the base commit changed, the worktree contains unresolved conflicts, or the receipt omits verification state.

The worker never merges, pushes, deploys, or edits the authoritative checkout. It returns a candidate commit and evidence. A later integrator task owns promotion.

### Content boundary

New task and conversation writes store content through `ContentVault.put()` and persist only a reference in operational tables. The initial vault is local, encrypted with a user-scoped Windows-protected key, and expiration-aware. This release introduces the interface and routes new writes through it; migration of historical rows is a separately rehearsed operation.

Metadata APIs never return content. An authenticated content endpoint resolves a specific reference only after task/conversation authorization and records access evidence. Artifact inspection returns structural metadata and hashes; previews are removed from persisted summaries.

### Repair ledger

The repair scanner runs in memory on schedule. It creates a durable task only when it detects a new incident, an incident changes state, or a recovery action occurs. Incident identity is a stable hash of affected path, expected digest, observed condition, and release baseline. Repeated healthy scans and unchanged incidents update volatile metrics only.

### Control Center truth model

The UI must never render `healthy`, `live`, `ready`, or `verified` as synonyms. It displays:

- Runtime: process liveness.
- Provider: connection/readiness result.
- Capability: last canary and expiry.
- Routing: eligible or blocked with a concrete reason.
- Evidence: observed, inferred, or verified.

Copy is sourced from the API state contract. Hard-coded statements such as “User-controlled core updates” and “Review candidate changes before activation” are removed when they contradict the actual release policy.

## Data flow

```text
authenticated intent
  -> task policy derivation
  -> metadata ledger + content-vault references
  -> readiness-aware route selection
  -> isolated worker execution
  -> typed receipt validation
  -> atomic task completion
  -> incident/evidence event
  -> redacted API projection
  -> truthful Control Center status
```

No unvalidated worker payload reaches the database. No caller assertion becomes routing authority. No content enters the operational ledger through a receipt or summary.

## Failure behavior

- Authentication failure: `401`, no task or sensitive data returned.
- Cross-site cookie mutation: `403`, no state change.
- Policy ambiguity: `422 policy-undetermined`, no task created.
- Capability not verified: task remains waiting with a durable reason; it is not routed optimistically.
- Receipt invalid: task fails with `receipt-invalid`; worker remains alive.
- Receipt persistence failure: task fails with `receipt-persistence-failed`; worker remains alive and one incident is recorded.
- Canary failure: capability becomes unroutable immediately; unrelated capabilities remain available.
- Codex path escape or base drift: candidate is quarantined and cannot be integrated.
- Vault unavailable: content-bearing intake fails closed; metadata-only health remains available.
- Repair verification failure: checkpoint is restored and an incident is retained.

## Verification strategy

The owner requires batch verification. Implementation tasks may add tests beside code, but tests are not run after each edit.

1. Complete the entire Truth and Containment implementation wave.
2. Run one focused integration gate covering authentication, task policy, receipts, readiness, supervisor resilience, candidate worktrees, vault boundaries, and repair deduplication.
3. Correct actual failures with targeted reruns only.
4. Run the complete suite once at the release-candidate boundary.
5. Deploy to the inactive candidate runtime and perform one live smoke covering status, session bootstrap, one deterministic task, one malformed receipt simulation, and rollback to 3.6.0.

## Acceptance criteria

- Every mutation and sensitive read rejects unauthenticated access.
- The Control Center operates through a prompt-free authenticated local session.
- Callers cannot select their execution capability or weaken classification.
- All enabled capability families have receipt schemas and cross-module completion coverage.
- Malformed or unpersistable receipts cannot crash a worker.
- No capability is routable from heartbeat state alone.
- Control Center readiness labels match API evidence.
- Codex executes only in a candidate worktree with changed-path enforcement.
- New content is referenced through the vault and excluded from receipts and metadata projections.
- Healthy repair scans create no durable repair tasks.
- The focused integration gate, full suite, live smoke, and rollback drill pass at their defined boundaries.

## Migration and compatibility

The database migration is additive. Existing task rows remain readable through a legacy projection, but legacy records are marked `evidenceLevel: "inferred"` unless a qualifying historical receipt exists. Existing bearer-token clients continue to work. The old generic task body is rejected with a stable migration error when it supplies authoritative routing fields.

The 3.6.0 runtime remains the rollback target until the alpha release completes its live canary. No provider that is currently disabled becomes enabled in this wave.
