# Production status — repository baseline 2026-08-23

This record describes the authoritative GitHub production baseline. It does not
claim that a particular Windows process has already fetched, restarted, or
activated the latest commit. Live-machine activation must be supported by local
runtime evidence.

## Repository production baseline

- Product version: `3.3.0`
- Runtime version declared by the manifest: `3.3.0`
- Control Center: `5.2.0`
- Cloud control plane declaration: `3.0.2`
- Capability registry: `1.0.0`
- Node runtime contract: `>=24`
- Phase/environment: `production`
- Local control address: `http://127.0.0.1:4782`
- Update authority: user-only
- Default autonomy mode: hybrid
- OpenAI Platform API provider: disabled by default

## Durable local architecture

The production repository retains the Node supervisor, isolated worker
processes, SQLite WAL task/event state, leases, heartbeats, crash recovery,
bounded restarts, durable conversations, execution receipts, improvement state,
secondary assignments, and durable objective/task graphs.

Enabled production workers declared by the manifest are:

- `local-core`
- `repository`
- `browser`
- `self-healer`

The supervisor reconciles objective graphs on every scheduler tick, performs
bounded automatic operational repair, and monitors the outbound Secondary Codex
mailbox when enabled.

## Portable and cloud coordination

- The Chromebook Control Plane is repository-hosted through GitHub Actions and
  supports `status`, `verify`, `gap-audit`, `secondary-assignment`, and
  `codex-cloud-task` operations.
- The Chromebook lane remains owner-gated and does not expose the Windows
  localhost runtime to the internet.
- Secondary Codex coordination remains outbound-only through the GitHub mailbox.
- Codex Cloud delegation uses repository task metadata and ChatGPT/Codex sign-in;
  it is not an OpenAI Platform API-key integration.
- Canonical CI runs `npm run verify` and the declared gap audit on Linux and
  Windows GitHub-hosted runners.

## Implemented planner/observer foundation

Earlier records described the Objective Planner and World-State Observer as
future gaps. The current repository now contains durable objective graphs,
dependency reconciliation, objective intake/status APIs, and a read-only
world-state observer covering runtime health, workers, leases, task counts,
objectives, repository evidence, browser state, and declared providers.

This closes the foundation gap. Higher-level autonomous decomposition and
provider-specific execution can continue to evolve on top of these primitives.

## Desktop Worker contract

The repository now contains a bounded Windows Desktop Worker execution contract.
It is wired into the isolated worker process with a fixed allowlist for Chrome,
Edge, Excel, Word, PowerPoint, and Visio. Inspection receipts contain only
interactive-session state and allowlisted window counts. The initial interaction
primitive is `focus-window`, which requires exactly one allowlisted top-level
window and verifies the foreground handle after the action.

The manifest flag remains disabled until the real Windows host validates the
attended-session contract. This is an activation blocker, not a missing worker
implementation. Arbitrary executables, arbitrary PowerShell, click/type
sequences, window titles, document content, and screenshots are not part of this
initial production contract.

## Remaining live capability gaps

The following declarations remain intentionally inactive until their provider or
machine prerequisites are proven:

- Desktop Worker: code/allowlist/receipt contract is prepared; live attended
  Windows validation and explicit activation remain.
- Signed-in browser control: disabled pending an owned signed-session provider
  and deterministic verification receipts.
- Microsoft durable queue worker: disabled while Dataverse authentication is
  still pending for the configured environment and solution.
- LM Studio/local reasoner: disabled pending a fresh local provider probe and a
  result channel that does not persist prompts/model responses.
- Direct Primary Codex Builder execution: disabled; subscription-backed
  Secondary Codex and Codex Cloud remain available repository execution lanes.
- GitHub Copilot worker and Workspace Agent cloud trigger: optional declared
  providers that remain disabled until their live authentication/health
  prerequisites are satisfied.

Run `npm run gap:audit` for the machine-readable repository-declared gap report.

## Historical note

The previous version of this document described a `3.2.0`/Control Center `4.1.0`
baseline dated 2026-08-13. That record is superseded for repository state by the
3.3 production line. It should not be used as evidence that the current Windows
process has already been restarted onto this commit.
