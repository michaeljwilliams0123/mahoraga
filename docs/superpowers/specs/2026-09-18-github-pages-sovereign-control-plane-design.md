# GitHub Pages Sovereign Control Plane Design

Date: 2026-09-18
Status: approved design, implementation not started

## Intent

Make GitHub Pages the canonical Mahoraga browser surface, reduce infrastructure coupling, simplify how objectives move through the system, and increase Mahoraga's autonomy without making any single infrastructure provider a hard dependency.

The target is not "move Railway somewhere else." The target is a provider-agnostic Mahoraga control fabric in which GitHub owns source/build/release/UI, Cloudflare provides the preferred edge/control layer, and execution providers are interchangeable capabilities selected at runtime.

## Current-state findings

- GitHub Pages is already enabled for the private `michaeljwilliams0123/mahoraga` repository.
- `.github/workflows/pages.yml` already builds and deploys a static Next.js export from `cloud-app`.
- `cloud-app/next.config.ts` already supports `output: "export"`, `/mahoraga` base path, static assets, and trailing-slash routing when `MAHORAGA_PAGES_EXPORT=1`.
- `scripts/build-pages-static.mjs` currently overwrites the exported `index.html` with a redirect to Railway, so Pages is a launcher rather than the actual workspace.
- Railway currently runs `node scripts/cloud-service.mjs`, exposes the production domain, stores secrets, owns `/api/live`, and mounts a persistent 500 MB volume at `/var/lib/mahoraga`.
- The cloud owner gateway is currently co-located with the runtime: it uses Node crypto, Node SQLite, `/var/lib/mahoraga`, and loopback requests to `127.0.0.1:4782`.
- Browser/runtime routes include health, live, ready, runtime session, runtime action, runtime login, and artifacts. Those routes cannot remain implicit same-origin server handlers once the UI is hosted as static Pages content.

## Design principles

1. **One objective feed.** Every human command, webhook, scheduled event, health signal, plugin event, repair trigger, or autonomous proposal enters the same normalized `ObjectiveEnvelope` contract.
2. **One external API boundary.** The Pages UI knows only `MAHORAGA_API_ORIGIN`; it never embeds Railway, localhost, provider-specific URLs, or secrets.
3. **Provider-agnostic execution.** Mahoraga requests capabilities (`repo.modify`, `telemetry.query`, `desktop.execute`, `model.infer`) instead of hard-coding vendors.
4. **Aggressive autonomy below the release boundary.** Mahoraga may retry, reroute, repair, fall back, reschedule, and substitute providers automatically when actions remain within the current governance envelope.
5. **Fail closed for identity and destructive actions.** More aggressive execution must not relax authentication, secret handling, release protection, or destructive-action controls.
6. **No infrastructure singleton.** GitHub Pages, Cloudflare, GitHub Actions, plugins, local workers, and future providers are replaceable surfaces behind stable contracts.
7. **Receipts over hidden state.** Every meaningful execution emits a durable receipt that can be journaled, verified, observed, and replayed safely.
8. **Migration by shadowing, not hope.** Railway stays available as a rollback/fallback path until the new stack proves feature parity and data continuity.

## Target architecture

```text
                               MAHORAGA
                                   |
                     +-------------+-------------+
                     |   GitHub Pages Workspace   |
                     |   static UI / no secrets   |
                     +-------------+-------------+
                                   |
                         MAHORAGA_API_ORIGIN
                                   |
                     +-------------+-------------+
                     |    Edge / Control Plane    |
                     |   preferred: Cloudflare    |
                     +-------------+-------------+
                                   |
          +------------------------+-------------------------+
          |                        |                         |
  World-State Observer      Objective Planner        Policy / Budget
          |                        |                         |
          +------------------------+-------------------------+
                                   |
                         Capability Router
                                   |
             +---------------------+--------------------+
             |                     |                    |
       GitHub plane          Cloud/plugin plane    Local/device plane
   API / Actions / Copilot   Workers / MCP / SaaS   SD00 / BV / future
             |                     |                    |
             +---------------------+--------------------+
                                   |
                          Execution Receipts
                                   |
                     Journal / Verifier / Memory
                                   |
                    Experience / Evolution Engine
```

## Canonical objective contract

All inbound work is normalized before planning.

```text
ObjectiveEnvelope
- objectiveId
- source
- intent
- priority
- constraints
- capabilitiesNeeded
- budget
- deadline
- contextRefs
- acceptanceCriteria
- policyProfile
- correlationId
```

Inputs may originate from:

- Mahoraga chat/UI
- GitHub issue/PR/workflow events
- Datadog alerts or health signals
- Cloudflare events
- scheduled jobs
- Composio/MCP/plugin events
- local desktop workers
- verifier/repair loops
- autonomous objective proposals

No input source may bypass normalization directly into provider-specific execution.

## Capability registry and routing

Providers advertise capabilities rather than being addressed directly by planner logic.

Example capability descriptors:

```text
repo.read
repo.modify
repo.review
ci.run
artifact.store
artifact.inspect
telemetry.query
browser.execute
desktop.execute
model.infer
message.send
workflow.wait
workflow.resume
```

Each provider descriptor may expose:

- provider ID
- capability set
- current health
- authentication readiness
- latency band
- cost class
- locality
- trust class
- concurrency
- retry policy
- maintenance state
- data-residency constraints

The router scores healthy providers using a configurable policy instead of vendor-specific branches.

## Aggressive failover behavior

Within approved governance boundaries Mahoraga may automatically:

- retry transient failures with bounded exponential backoff;
- switch to an equivalent provider after health or auth failure;
- split independent work across multiple providers;
- downgrade to a lower-cost provider when quality requirements allow;
- escalate to a stronger provider when verification fails;
- route local work to cloud when a device is offline;
- route cloud work to local when cloud credits, quotas, or availability are constrained;
- pause only the blocked branch of an objective rather than the whole objective;
- resume durable work from the last verified checkpoint;
- synthesize a repair objective from failed execution receipts;
- quarantine a provider that repeatedly returns invalid or unverifiable results.

Failover must preserve objective ID, correlation ID, acceptance criteria, and audit trail.

## Custom policy profiles

Routing and autonomy should be data-driven and owner-configurable rather than compiled into planner code.

Proposed configuration surface:

`config/mahoraga-control-plane.json`

Representative policy dimensions:

- `autonomy`: conservative | balanced | aggressive | custom
- `maxProviderFailovers`
- `maxRepairLoops`
- `parallelism`
- `costPreference`
- `latencyPreference`
- `localityPreference`
- `allowCloudFallback`
- `allowLocalFallback`
- `requireIndependentVerification`
- `destructiveActionPolicy`
- `releasePromotionPolicy`
- `providerOverrides`
- `capabilityOverrides`

"Aggressive" increases routing flexibility, repair attempts, concurrency, and autonomous fallback. It does not disable identity controls, release boundaries, or destructive-action safeguards.

## GitHub responsibilities

GitHub becomes Mahoraga's canonical development and presentation authority:

- source of truth
- GitHub Pages UI
- GitHub Actions build/deploy
- deterministic CI
- PRs and Issues
- release artifacts
- deployment audit
- code review
- GitHub API/MCP capability provider
- Copilot-assisted development surface

GitHub Actions may execute bounded jobs but is not treated as Mahoraga's permanent always-on server.

## GitHub Pages responsibilities

Pages hosts only browser-safe presentation assets:

- workspace shell
- chat UI
- task/objective views
- execution timeline
- health/status display
- settings and policy controls
- artifact links/previews when safe
- client-side streaming/event consumption

Pages must never contain:

- runtime credentials
- API tokens
- owner secrets
- persistent runtime state
- server-only authorization logic
- private execution journals intended for backend storage

## Single API boundary

The browser should know one configurable origin:

`MAHORAGA_API_ORIGIN`

Representative contract:

```text
GET  /health
GET  /session
POST /login
POST /objective
POST /action
GET  /events
POST /artifacts
GET  /artifacts/:id
```

Provider-specific addresses remain behind this boundary.

During migration the compatibility gateway may still forward requests to Railway. After runtime extraction the same browser contract remains unchanged.

## Preferred Cloudflare control plane

Cloudflare is the preferred edge/control plane, not a second monolithic app host.

Preferred responsibilities:

- Worker API gateway
- identity/session edge enforcement
- request validation
- CORS/origin policy
- rate limiting
- durable objective/workflow coordination where suitable
- health-aware provider routing
- webhook ingress
- lightweight transformation
- optional event streaming

State should progressively move out of the Railway-local SQLite dependency into managed provider-independent stores. D1 is the preferred first target for small relational control-plane state such as replay protection, login throttling, objective metadata, and receipts that fit its usage model. Larger artifacts should use an artifact store rather than SQL blobs.

## Durable workflows

Long-running objectives should be expressed as resumable steps rather than one process that must remain alive.

Representative lifecycle:

```text
observe-world
  -> normalize-objective
  -> plan
  -> route
  -> execute
  -> verify
  -> repair/reroute if required
  -> journal
  -> learn
  -> complete
```

Each step should be idempotent or protected by execution receipts so retries do not duplicate irreversible side effects.

## State model

Separate state by purpose:

1. **Source state:** GitHub repository.
2. **Objective/control state:** durable control-plane database.
3. **Execution journal:** append-oriented receipts/events.
4. **Artifacts:** dedicated artifact storage.
5. **Secrets:** provider secret stores only.
6. **Device-local state:** local worker caches and device-specific execution state.

No state should require a single Railway filesystem mount after final cutover.

## Observability

Datadog remains the cross-plane observability surface.

Minimum correlation fields:

- objective ID
- task ID
- execution ID
- provider ID
- capability
- correlation ID
- git SHA when applicable
- deployment ID when applicable
- verification outcome
- latency
- retry/failover count

Observability failures must not break the user workflow, but missing telemetry should be visible as degraded observability.

## Migration sequence

### Phase 0 - Baseline and inventory

- Capture exact `main` SHA and current Pages/Railway configuration.
- Inventory every Railway URL, localhost/loopback dependency, same-origin assumption, persistent file, secret, and server route.
- Record current acceptance transactions and rollback path.

### Phase 1 - Pages becomes a real UI

- Stop replacing Pages `index.html` with a Railway redirect.
- Publish the actual exported Mahoraga workspace.
- Keep Railway runtime untouched.
- Ensure static navigation and assets work directly from `/mahoraga/`.

### Phase 2 - Introduce the single API origin

- Add `MAHORAGA_API_ORIGIN` to browser configuration.
- Convert UI calls from implicit same-origin API paths to a single API client abstraction.
- Keep the compatibility target backed by Railway initially.

### Phase 3 - Extract the owner/API gateway

- Move session/auth/action gateway responsibilities behind the external API boundary.
- Remove browser dependency on Node/Next route handlers.
- Preserve existing security properties: signed owner assertions, CSRF/replay protection, throttling, trusted origins, and no browser-visible secrets.

### Phase 4 - Externalize control-plane state

- Move replay/login/session-support state out of `/var/lib/mahoraga`.
- Introduce durable managed state for control-plane records.
- Export and reconcile relevant Railway state.

### Phase 5 - Durable objective orchestration

- Route normalized objectives through resumable workflow steps.
- Preserve current planner/router/verifier semantics.
- Add bounded repair and provider failover.

### Phase 6 - Execution-provider convergence

- Register GitHub, Cloudflare, Composio/plugins, local workers, and other providers through the same capability contract.
- Remove planner-level vendor branches when an equivalent capability route exists.

### Phase 7 - Shadow and parity proof

Run Pages/control-plane path in parallel with Railway fallback and prove:

- login/session
- health/readiness
- chat
- objective creation
- tasks
- messages
- action execution
- artifacts
- GitHub operation
- plugin operation
- local fallback where available
- independent verification
- restart/recovery

### Phase 8 - Canonical cutover

- Make GitHub Pages the repository homepage/canonical browser entry.
- Remove Railway from UI configuration and normal routing.
- Retain Railway only as an explicitly named rollback provider.

### Phase 9 - Railway retirement preparation

- Export remaining durable state.
- Verify no canonical code path requires Railway domain, Railway variables, Railway volume, or Railway deployment APIs.
- Freeze Railway configuration.

### Phase 10 - Railway removal

Only after parity and rollback criteria are satisfied:

- remove Railway service/domain dependencies;
- archive migration evidence;
- update docs and baselines;
- delete or disable obsolete Railway automation.

## Rollback policy

Every migration phase must be independently reversible until Railway retirement.

A rollback may switch only the API/control-plane origin; it must not require rebuilding the Pages UI when avoidable.

The Pages UI should therefore remain compatible with both:

- the new external control-plane contract; and
- a temporary compatibility gateway backed by Railway.

## Security boundaries

The migration must not weaken:

- owner authentication
- CSRF protection
- replay protection
- signed assertions
- secret isolation
- origin validation
- destructive-action governance
- release/promotion boundaries

Public/static Pages assets are assumed observable by anyone who can reach the site. No security decision may depend on obscurity of frontend code.

## Acceptance criteria

The migration is complete only when all are true:

1. `https://michaeljwilliams0123.github.io/mahoraga/` renders the real Mahoraga workspace rather than redirecting to Railway.
2. The browser contains no Railway-specific canonical routing.
3. The browser uses one `MAHORAGA_API_ORIGIN` abstraction.
4. Secrets remain entirely server-side/provider-side.
5. Chat and objective execution work through the new API boundary.
6. Task/action/message/artifact flows work through the new API boundary.
7. Provider failover preserves objective correlation and execution receipts.
8. GitHub, plugin/cloud, and local providers can coexist behind capability routing.
9. Datadog can correlate objective -> route -> execution -> verification.
10. Railway can be made unavailable without breaking the canonical UI or control path.
11. No required durable state exists only on `/var/lib/mahoraga`.
12. A fresh deployment from GitHub `main` can reproduce the UI/control-plane configuration without manual Railway setup.
13. Existing deterministic verification remains green.
14. Rollback evidence is documented before Railway is removed.

## Non-goals

- Running arbitrary server-side Node/Python directly on GitHub Pages.
- Moving all compute into GitHub Actions.
- Making Cloudflare a new hard dependency embedded in planner logic.
- Removing Railway before parity evidence exists.
- Weakening governance to gain autonomy.

## Desired end state

```text
Human / Event / Agent
        |
        v
  ObjectiveEnvelope
        |
        v
  World-State Observer
        |
        v
  Objective Planner
        |
        v
 Capability / Policy Router
        |
   +----+----------------------+------------------+
   |                           |                  |
 GitHub                    Cloud/Plugins       Local/Device
   |                           |                  |
   +-------------+-------------+------------------+
                 |
                 v
          Execution Receipts
                 |
                 v
      Independent Verification
                 |
                 v
        Experience / Evolution

UI: GitHub Pages
API: stable provider-agnostic boundary
Control: preferred Cloudflare edge/durable orchestration
Source/build/release: GitHub
Observability: Datadog
Execution: dynamically selected capabilities
Railway: no canonical dependency
```

This architecture deliberately increases Mahoraga's freedom to reroute, repair, parallelize, and substitute providers while decreasing the number of infrastructure assumptions required for any single objective to succeed.
