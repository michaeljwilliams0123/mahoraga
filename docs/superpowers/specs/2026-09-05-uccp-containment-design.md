# UCCP Containment Design

## Goal

Embed a Unified Cognitive Control Plane (UCCP) into Mahoraga 7.0.0-alpha.1 without creating a second authority, leaking private reasoning, sharing candidate state with the 4782 baseline, or opening an inbound network boundary.

## Runtime boundary

The canonical runtime remains bound to `127.0.0.1`. Port `4782` continues to use the manifest runtime database. Port `4783` is a candidate-only override and MUST use candidate-scoped state. UCCP starts only when the resolved runtime port is `4783`.

The UCCP plane is runtime-owned, not a separate supervisor or release authority. It may observe worker/task state, persist bounded decision summaries, emit telemetry, and request candidate containment. Repository mutations continue to flow through Mahoraga's existing task/lease/update contracts.

## Persistent UCCP state

`src/state/schema.mjs` owns a dedicated Node 24 `node:sqlite` database at `state/uccp-candidate-4783.sqlite` by default. It enables WAL, `synchronous=FULL`, foreign keys, and a busy timeout. The UCCP ledger is observability and candidate-lease state only; it is not a replacement for `RuntimeDatabase`.

The `uccp_task_leases` table stores correlation ID, worker name, dialectical phase, lease expiry, timestamps, and a bounded structured `decision_summary_json`. Raw hidden chain-of-thought is never persisted or streamed.

## Cognitive plane

`src/state/core-plane.mjs` periodically snapshots bounded runtime health and records a structured `[Propose] -> [Challenge] -> [Synthesis]` decision summary. The plane publishes telemetry containing drift risk, database health, current worker, active UCCP leases, canary scores, and the latest decision summary.

## Watchdog and rollback

`src/state/watchdog.mjs` runs only for the 4783 candidate. It checks the UCCP database and candidate integrity on a 500 ms cadence with consecutive-failure debouncing. A failure requests containment through an injected rollback callback.

`scripts/emergency-rollback.ps1` may terminate the listener on port 4783 and quarantine candidate SQLite files. It may reset repository files only when an explicit candidate worktree path and base SHA are supplied and the worktree contains the `.mahoraga-candidate` marker. It MUST NOT run `git reset --hard` or `git clean` against the authoritative checkout or the 4782 baseline.

## Telemetry

`src/relay/pga-status.mjs` exposes a local telemetry bus and an authenticated SSE handler for `GET /api/v1/pga/stream`. The stream is same-origin/local-session protected by the existing control server. It does not emit wildcard CORS headers and does not depend on a Vercel-to-localhost rewrite.

## n8n boundary

`src/relay/n8n-interceptor.mjs` provides HMAC-SHA256 signing/verification primitives for bounded automation messages. No inbound n8n route is opened by default because the runtime remains loopback-only and the secondary-host n8n service is also loopback-bound. A workflow template may consume POSTed telemetry when a separately approved transport exists.

## Verification

Tests cover WAL schema durability, bounded decision persistence, watchdog debounce/containment, HMAC verification, telemetry shape, 4783 candidate state isolation, and the authenticated local SSE route. Root verification remains `npm run verify`; `npm run test:alpha` aliases the Node test suite for candidate testing.