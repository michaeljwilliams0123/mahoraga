# Unified Conversation and Evolution Plane

**Status:** Approved design baseline  
**Date:** 2026-08-30  
**Target branch:** `codex/unified-conversation-evolution-plane`  
**Base commit:** `b4c59665eff9daeb7617c12b795cf8119f40281c`

## Outcome

Mahoraga becomes one single-user product with one conversation UI and one release identity.

The same browser application is published to GitHub Pages and served by the Windows runtime at `127.0.0.1:4782`. The Pages instance can operate the private runtime from another device through an authenticated, outbound-only encrypted relay. The loopback instance uses the same contracts directly without the relay.

Conversation becomes the primary control surface. A user can ask Mahoraga to perform work, inspect progress, stop a run, approve an exceptional action, or improve Mahoraga itself. The conversation displays live execution events and final evidence rather than deterministic placeholder text.

## Current state

Remote `main` is Mahoraga `7.0.0-alpha.1`. It already contains:

- a loopback Node runtime, supervisor, SQLite WAL ledger, isolated workers, leases, heartbeats, and rollback machinery;
- a capability registry and evidence-aware routing;
- task intent and task receipt contracts;
- a browser worker, repository worker, Codex builder, desktop worker, and self-healer;
- a static GitHub Pages workspace under `cloud/`;
- GitHub coordination, exact-head verification, automatic integration, release packaging, and local activation contracts.

The Pages composer currently classifies text in browser JavaScript and deliberately reports that no execution bridge is connected. The new plane replaces that placeholder path without weakening the existing runtime authority and evidence model.

## Architectural decision

Use an **outbound encrypted relay**, not a raw public tunnel to the loopback control server.

The local runtime opens an outbound TLS WebSocket to a small relay service. The Pages UI opens a second authenticated WebSocket to the relay. The relay matches the two ends by a short-lived paired session and forwards encrypted frames. It cannot address arbitrary local ports, invoke arbitrary runtime routes, or inspect message plaintext.

This is preferable to:

1. **Pages-to-loopback fetch:** lowest infrastructure but limited to the same device and vulnerable to browser mixed-content, private-network-access, CORS, and sleep/reconnect behavior.
2. **Raw Cloudflare/Tailscale tunnel:** less application code but exposes an HTTP origin connected to the PC and expands the consequences of an identity or routing mistake.
3. **Full cloud execution backend:** supports remote work but duplicates the local supervisor, worker, credential, and data-boundary logic.

A Cloudflare Worker with one Durable Object per paired device is the reference relay deployment. The relay contract remains host-neutral so Azure Web PubSub or another managed WebSocket relay can replace it without changing the UI or runtime contracts.

## System shape

```text
                 one versioned web application
               /                               \
GitHub Pages origin                        127.0.0.1:4782
       |                                          |
       | authenticated encrypted frames          | same-origin API
       v                                          v
minimal cloud relay  <--- outbound WSS ---  Mahoraga conversation gateway
                                                   |
                  +--------------------------------+----------------------+
                  |                |               |                      |
             provider gateway   capability      run/event            evolution
             / OpenClaw adapter  registry        ledger               controller
                  |                |               |                      |
             model response     isolated       receipts and       candidate worktree
             streaming          workers        verification       CI/canary/rollback
```

## Components

### 1. Canonical web application

`cloud/` becomes the canonical browser application for both origins. The loopback server serves the same files that the Pages workflow publishes.

The UI gains:

- conversation and session selection;
- connection state: local, paired relay, reconnecting, offline;
- streamed assistant text and reasoning summaries;
- tool, worker, verification, approval, and deployment events;
- run cancellation and retry;
- capability and connection views derived from the runtime;
- improvement requests and candidate status;
- a pairing screen that consumes a short-lived code created by the local runtime.

Browser-side keyword classification is retained only as an offline preview. The runtime owns the authoritative intent, route, state, and receipt.

### 2. Conversation gateway

Add a runtime service with a versioned API:

- `POST /api/v2/sessions/pair`
- `POST /api/v2/runs`
- `POST /api/v2/runs/:runId/cancel`
- `GET /api/v2/runs/:runId/events`
- `GET /api/v2/capabilities`
- `GET /api/v2/improvements/:candidateId`

Loopback requests use the existing control-session authority. Relay requests arrive as authenticated decrypted envelopes and pass through the same intake, intent, routing, and receipt functions. No separate cloud authority model is introduced.

Only one active foreground run is permitted per conversation. Background implementation lanes remain bounded by the manifest.

### 3. Durable run/event contract

Each run owns a monotonic event sequence. Events are append-only operational metadata and use this envelope:

```json
{
  "schemaVersion": 1,
  "eventId": 42,
  "sessionId": "ses_...",
  "conversationId": "con_...",
  "runId": "run_...",
  "agentId": "local-core",
  "type": "tool-result",
  "timestamp": "2026-08-30T00:00:00.000Z",
  "payload": {}
}
```

Initial event types:

- `run-start`
- `text-delta`
- `reasoning-summary`
- `tool-input-start`
- `tool-call`
- `tool-result`
- `tool-error`
- `worker-started`
- `worker-completed`
- `approval-required`
- `verification-started`
- `verification-result`
- `candidate-created`
- `deployment-started`
- `deployment-completed`
- `receipt-created`
- `run-completed`
- `run-failed`
- `run-cancelled`

SSE is used on loopback. The relay transports the same event envelopes over WebSocket. A reconnect supplies the last observed event ID and receives the missing bounded event window.

Model text is not persisted in the runtime database. Operational events store bounded hashes, status, sizes, and evidence references. The encrypted content vault may hold explicitly retained local conversation artifacts under the existing classification and expiry rules.

### 4. Pairing and relay

Pairing begins on the Windows runtime, which generates a one-time code and device public key with a five-minute expiry. The user enters or scans the code in the Pages UI.

The UI and local runtime perform ephemeral P-256 ECDH using browser and Node WebCrypto, derive an AES-GCM session key, and authenticate every frame with a monotonically increasing counter. The relay receives only ciphertext plus bounded routing metadata.

The reference relay:

- authenticates through Cloudflare Access against one owner identity configured only in the deployment environment;
- accepts only the configured Pages origin;
- limits one user, a bounded number of paired devices, frame size, event rate, and session lifetime;
- keeps ciphertext only for reconnect delivery with a maximum five-minute TTL;
- exposes no generic proxy, URL, host, port, filesystem, browser, or command parameter;
- records only connection and abuse-control metadata;
- invalidates all sessions when the local runtime revokes the device.

Credentials and provider tokens remain local. The relay secret and deployment credentials live in the cloud host's secret store, never Git.

### 5. Provider and OpenClaw adapter

Introduce a provider-neutral conversation adapter behind Mahoraga. OpenClaw may run as a separate local sidecar for provider sessions, message normalization, and channel behavior.

Mahoraga remains authoritative for:

- capability selection;
- data classification;
- tool permission;
- spending class;
- worker dispatch;
- approval;
- verification;
- receipt and deployment state.

The adapter cannot select arbitrary tools or bypass Mahoraga routing. Consumer ChatGPT or Claude session credentials are not scraped or embedded. Supported API, local-model, or licensed CLI authentication is used according to the manifest.

### 6. Schema-driven MCP capability host

Add a dynamic MCP host manager, but do not accept caller-supplied transport URLs.

Each provider is declared in the manifest with:

- provider ID and transport kind;
- endpoint or local executable identity;
- tool and resource allowlists;
- data classes;
- permission and spending classes;
- credential reference;
- readiness probe and canary;
- request, response, and timeout limits.

At startup and on an explicit refresh, the manager discovers declared tools, validates JSON schemas, normalizes them into the capability registry, and marks unverified tools unavailable. Runtime discovery expands declared providers; it does not create unrestricted ambient authority.

### 7. Browser and desktop execution

The existing browser and desktop workers remain the execution boundaries.

The browser worker gains schema-driven observe and action operations with:

- registered target/domain policies;
- stable locator preference;
- bounded navigation and download directories;
- screenshot and DOM evidence hashes;
- cancellation and timeouts;
- explicit waiting states for MFA, CAPTCHA, consent, or destructive confirmation;
- network and console evidence attached to receipts.

The desktop worker remains attended for mutations. Universal application support is achieved by adding signed capability profiles and synthesized candidate tools, not by giving the supervisor a generic shell or caller-selected executable.

### 8. Evidence compiler

Add a local context compiler inspired by Repomix:

1. inventory repository paths and manifests;
2. confine all reads to a declared root using lexical and realpath checks;
3. exclude secrets, suspicious files, binaries, generated output, and oversized content;
4. produce a token-aware structural digest;
5. include full source only for selected files/functions;
6. emit an evidence manifest containing path, hash, size, line span, and source revision.

This pack is the default context passed to model-backed implementation workers. It reduces repeated repository ingestion and prevents the browser UI from uploading the full workspace.

### 9. Bounded workers and observational memory

AutoGPT-style execution budgets are added to every model-backed run:

- maximum depth;
- maximum child workers;
- maximum cycles;
- maximum token/credit class;
- inherited deny rules;
- explicit child allow rules;
- per-child worktree or workspace;
- cancellation propagation.

Children receive task contracts, context packs, and required evidence—not unrestricted parent history.

Long conversations use an n8n-style observation layer: recent raw turns plus append-only compressed observations. Authority, approvals, exact tool results, receipts, and deployment evidence are never replaced by model summaries.

### 10. Self-evolution from conversation

An improvement request such as “update your UI to show deployment progress” follows this path:

1. Runtime classifies the request as an improvement and creates a durable objective.
2. Evidence compiler builds the repository context pack.
3. The orchestrator creates a candidate worktree at an exact base commit.
4. One or two bounded Codex implementation lanes change declared paths.
5. Generated JavaScript or Python passes Langflow-inspired parsing and AST/static security checks before any execution.
6. Changed-path enforcement and a focused verification profile run.
7. Mahoraga creates or updates a pull request and emits its URL and head SHA into the conversation.
8. Exact-head CI, code scanning, and required review evidence are consumed without rerunning equivalent gates.
9. Eligible heads integrate under the existing autonomy policy.
10. The Pages workflow publishes the canonical UI when `cloud/` changes.
11. The local runtime builds an immutable update artifact, records a rollback checkpoint, starts a canary, health-checks the new release, and either activates it or restores the previous release.
12. The conversation receives one final receipt containing the commit, PR, CI, Pages deployment, local activation, and rollback status.

No raw generated file is written directly into the active runtime. No shell command is constructed from model or UI text. Execution uses fixed programs, argument arrays, declared paths, and existing worker boundaries.

### 11. Code-safety and extension contracts

Before synthesized tools can execute or become durable capabilities:

- parse fenced source and structured metadata separately;
- validate exact extension manifest fields;
- reject dynamic evaluation, uncontrolled process creation, unsafe environment access, socket creation, arbitrary imports, dangerous object traversal, and out-of-root filesystem access;
- enforce input and output schemas;
- assign an explicit provider, capability ID, data class, permission class, and canary;
- keep public error messages fixed and store bounded private diagnostics locally;
- require additive versioned contracts and migration logic for persisted schema changes.

Repomix, Superpowers, and Langflow are MIT sources whose code may be adapted with notices. n8n and the AutoGPT platform are used only as architectural references because of their licensing boundaries. OpenClaw is integrated through an adapter rather than copied wholesale.

## Deployment

### Repository and releases

One repository owns the UI, runtime, relay contract, and deployment workflows.

- `cloud/` is the canonical frontend artifact.
- `src/` owns local authority, runtime, workers, and event contracts.
- `relay/` contains the minimal host-neutral relay and Cloudflare reference adapter.
- GitHub Pages publishes `cloud/` from exact `main`.
- A relay workflow deploys only after its focused gate passes and uses environment-protected secrets.
- Runtime releases remain immutable, hashed artifacts.
- Local activation remains canary-based with rollback.

The public Pages URL remains the universal entry point. The loopback URL remains available and uses the same UI without the cloud relay.

### Migration

The existing Pages interface continues to function during rollout. Its staged placeholder is replaced only when the bridge handshake succeeds.

Old UI versions detect incompatible runtime or relay contract versions and show an update-required state. The runtime keeps the previous API contract for one release to permit Pages propagation and browser cache expiry.

### Failure behavior

- Relay unavailable: Pages shows offline and queues nothing beyond the in-memory composer.
- Local runtime unavailable: relay session remains unpaired; no work is reported as accepted.
- Provider unavailable: route to another verified provider or return a blocked receipt.
- Browser/desktop wait state: preserve the run and request the exact checkpoint.
- Worker crash: supervisor lease and bounded retry rules apply.
- CI failure: keep the candidate and evidence; do not integrate.
- Pages deployment failure: local runtime may still activate only if the change does not require the new UI contract.
- Local canary failure: restore the rollback checkpoint and report both failure and restoration.
- Lost relay session: reconnect with last event ID; reject replayed frame counters.

## Focused verification

The implementation intentionally avoids building a second exhaustive test program. It adds focused coverage for changed contracts and uses the existing full release gate once.

Required focused checks:

1. event schema, monotonic replay, cancellation, and terminal receipt;
2. pairing expiry, frame authentication, replay rejection, origin restriction, and size/rate limits;
3. direct loopback and relayed runs produce equivalent intent and receipt contracts;
4. MCP providers cannot be added from user-supplied URLs and unverified tools remain unroutable;
5. evidence compiler rejects traversal, symlink escape, secrets, and oversized inputs;
6. synthesized tools cannot reach forbidden process, network, environment, or filesystem surfaces;
7. an improvement request creates a confined candidate and cannot mutate the active runtime;
8. one browser smoke proves Pages-to-relay-to-runtime streaming;
9. one self-update smoke proves PR/CI/Pages receipt flow with external effects mocked until the release candidate;
10. one full `npm run verify` before protected bootstrap or release.

## Acceptance criteria

The design is complete when:

- Pages and loopback visibly run the same UI version;
- a paired Pages session can submit, stream, cancel, reconnect, and receive a verified receipt from the local runtime;
- the relay has no generic proxy and cannot read message plaintext;
- the UI can request a Mahoraga improvement and follow candidate, PR, CI, deployment, canary, and rollback events in the same conversation;
- dynamic MCP discovery is limited to declared providers and validated tools;
- browser and desktop actions remain isolated workers with visible checkpoints;
- evidence packing materially reduces repository context while preserving hashes and line-level provenance;
- generated tools execute only from candidate workspaces after static safety and focused verification;
- exact-head CI evidence is reused and only one full release gate is required;
- credentials and private content remain absent from Pages, Git, coordination records, and cloud relay plaintext.
