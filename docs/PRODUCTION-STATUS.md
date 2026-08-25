# Production status and Mahoraga 7 candidate — 2026-08-25

This record separates repository candidate state from live production state.
Neither a manifest declaration nor this document proves that a Windows process
is running, healthy, or activated. Those claims require current process,
listener, status, canary, and verification evidence.

## Installed repository candidate

- Candidate version: `7.0.0-alpha.1`
- Runtime, API, and Control Center declaration: `7.0.0-alpha.1`
- Phase/environment: `alpha-candidate` / `candidate`
- Candidate branch: `agent/mahoraga-7-truth-containment`
- Loopback contract: `127.0.0.1:4782`; Task 11 uses inactive port `4783`
- Update authority: verified automatic activation with rollback
- OpenAI Platform API provider: disabled by default
- Production activation: **not performed**

The candidate implements authenticated sensitive surfaces, server-derived task
authority, typed capability receipts, evidence-backed routing, candidate-only
Codex execution cells, encrypted content references, repair incident
deduplication, and evidence-derived Control Center labels.

## Active production and rollback target

- Production predecessor: `3.6.0`
- Immutable baseline commit:
  `397acebf16766f44e3b4317f9d8b68b10de5f821`
- Rollback target: `3.6.0` until the alpha inactive-runtime canary and rollback
  drill pass
- Current live-process state: not asserted by this repository document

Historical acceptance evidence for the predecessor reported a loopback runtime,
current worker heartbeats, private attachment intake, bounded answer-quality
correction, and a passing suite. That evidence remains historical and is not
reused as Mahoraga 7 verification.

## Candidate capability truth

Configured or enabled is not synonymous with routable. Every route now exposes
five separate fields: process, provider, canary, routing decision, and evidence
level. A write-capable route requires a canary no older than 15 minutes;
deterministic read routes may use a 24-hour canary. Unknown or stale evidence
fails closed.

The manifest currently keeps optional or unproven providers disabled, including
LM Studio execution, GitHub Copilot execution, Workspace Agent cloud, Microsoft
queue polling, Copilot Studio delegation, Lenovo AI execution, and the metered
OpenAI API. Enabled declarations still require current provider and canary
evidence before dispatch.

## Pending release gates

1. Focused Truth and Containment integration gate.
2. Complete repository suite.
3. Release-baseline refresh and digest verification.
4. Inactive candidate smoke on loopback port `4783` with temporary state.
5. Malformed-receipt resilience check and three quiet healthy repair scans.
6. Inactive rollback drill to `3.6.0`.
7. Review-only GitHub Codex adversarial review against the exact verified SHA.

No production promotion recommendation exists until all gates produce receipts.

## Durable architecture retained

The candidate retains the Node supervisor, isolated worker processes, SQLite WAL
operational ledger, leases, heartbeats, crash recovery, bounded restarts,
durable objectives, and outbound-only repository coordination. Content-bearing
writes are stored in the encrypted local vault; SQLite stores bounded metadata,
hashes, classifications, expiry, and references. Healthy repair polling creates
no durable task or event noise.

## Portable and cloud coordination

- The Chromebook Control Plane is repository-hosted through GitHub Actions and
  supports `status`, `verify`, `gap-audit`, `secondary-assignment`, and
  `codex-cloud-task` operations.
- The Chromebook lane remains owner-gated and does not expose the Windows
  localhost runtime to the internet.
- Secondary Codex coordination remains outbound-only through the GitHub mailbox.
- Idle mailbox polls perform no Codex CLI call. Model execution is single-flight,
  receives one initial attempt, and requires an explicit bounded retry after a
  failure.
- Codex Cloud delegation uses repository task metadata and ChatGPT/Codex sign-in;
  it is not an OpenAI Platform API-key integration.
- Canonical CI runs `npm run verify` and the declared gap audit on Linux and
  Windows GitHub-hosted runners.
- Cloud Workspace task issues remain inert until an exact owner-authored gateway
  command selects Codex cloud or a registered desktop task area. The gateway
  revalidates the issue, writes one idempotent record, and posts bounded status
  back without copying attachment URLs into coordination JSON.
- The staged update workflow verifies authoritative `main`, packages an
  immutable archive, emits SHA-256 metadata, and records GitHub provenance.
  Publishing never installs or activates an update on a device.

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

The candidate manifest enables the Desktop contract, but routing remains blocked
without a current attended-session canary. Arbitrary executables, arbitrary
PowerShell, click/type
sequences, window titles, document content, and screenshots are not part of this
initial production contract.

## Microsoft durable queue readiness

The Dataverse queue implementation remains outbound-only and the production
feature flag remains disabled until authentication is proven on the Windows
host. The queue worker now distinguishes repository/configuration readiness from
unattended authentication readiness rather than treating the presence of `.env`
and a script as proof that polling can succeed.

`queue.status` performs a non-interactive `scripts/auth.py --diagnose` probe only
when the publisher prefix, Dataverse URL, tenant identifier, queue script, and
auth script are present. It marks the queue ready for unattended polling only
when the existing authentication chain reports a silent credential tier. It
never returns the Dataverse URL, tenant identifier, token, credential, or raw
diagnostic transcript in the worker receipt.

`queue.poll` also constrains the Python result to the expected relay identifier
and bounded `claimed`, `completed`, and `requeued` counts. Unexpected fields are
dropped before persistence. Live activation still requires one successful
Windows-host status probe and one outbound poll against the configured Dataverse
environment.

## Local provider readiness

Run `npm run providers:probe` on the authoritative Windows checkout to perform a
single non-activating readiness pass across the attended Desktop contract,
Dataverse queue authentication, LM Studio loopback provider, GitHub Copilot CLI,
Primary Codex Builder invocation, and Workspace Agent credential state.

The report is deliberately sanitized. It reduces each provider to bounded
availability/credential/readiness metadata and does not include document titles,
model identifiers, Dataverse tenant values, tokens, prompts, provider stdout,
or model responses. A successful readiness probe never flips a feature flag or
claims end-to-end task execution.

LM Studio now has a fixed read-only health probe at
`http://127.0.0.1:1234/v1/models`. It records only the number of available models.
Actual `reason.local` execution remains disabled until Mahoraga has a transient
result channel that can consume generated content without persisting prompts or
model responses in the runtime database.

## Remaining live capability gaps

The following declarations remain intentionally inactive until their provider or
machine prerequisites are proven:

- Desktop Worker: enabled as a candidate contract; a current attended-session
  provider observation and canary remain required before any route is eligible.
- Signed-in browser control: disabled pending an owned signed-session provider
  and deterministic verification receipts.
- Microsoft durable queue worker: code and unattended-auth diagnostics are
  prepared; a live Windows silent credential and successful outbound poll remain.
- LM Studio/local reasoner: loopback health diagnostics are prepared; a live
  model probe plus a non-persistent result channel remain before execution.
- Direct Primary Codex Builder: enabled only inside a candidate worktree and
  still requires a verified environment canary plus an integration lease.
- GitHub Copilot worker and Workspace Agent cloud trigger: optional declared
  providers that remain disabled until their live authentication/health
  prerequisites are satisfied.

Run `npm run gap:audit` for the machine-readable evidence-backed gap report.

## Historical note

Earlier versions of this document described the `3.2.0` and `3.5.x` production
lines. The rollback baseline for this alpha is `3.6.0`; none of those historical
records proves the current Windows process state or verifies the Mahoraga 7
candidate.
