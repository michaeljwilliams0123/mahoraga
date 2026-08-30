# Mahoraga 7.0 — Truth and Containment alpha

This branch stages Mahoraga `7.0.0-alpha.1`. It is an isolated candidate, not the
active Windows production runtime. The last verified production and rollback
target remains `3.6.0` at commit
`397acebf16766f44e3b4317f9d8b68b10de5f821` until the focused gate, full suite,
inactive-runtime smoke, and rollback drill are recorded.

The alpha preserves the Node.js supervisor, process-isolated workers, SQLite WAL
ledger, loopback API, and browser Control Center while adding authenticated
sensitive surfaces, server-derived authority, typed receipts, evidence-backed
routing, isolated Codex worktrees, an encrypted local content vault, and
incident-only repair records.

## Release truth

- Installed candidate metadata: `7.0.0-alpha.1` / Control Center
  `7.0.0-alpha.1` / API `7.0.0-alpha.1`.
- Active production baseline: `3.6.0`; this document does not claim it has been
  replaced or restarted.
- Verification state: implementation complete through the release-metadata
  slice; focused and release gates are pending.
- Provider state: declarations do not imply readiness. A route requires a live
  process, ready provider, and fresh verified capability canary.
- Rollback target: `3.6.0` until the alpha canary and rollback drill pass.

## Candidate capabilities

- Canonical `mahoraga.manifest.json` for workers, connections, cost routing, and
  update authority.
- Explainable capability registry and ranked routing using interface type, live
  availability, health, cost, permissions, reliability, latency, workload,
  execution type, attended-desktop requirements, and explicit fallback workers.
- Localhost-only control server at `http://127.0.0.1:4782`.
- Permanent supervisor with worker heartbeats, crash restart, bounded retry, and
  durable task leases.
- SQLite task, worker, event, and improvement state using the Node 24 runtime.
- Isolated `local-core`, `repository`, `browser`, and `self-healer` worker processes.
- A Mahoraga-owned headless Chrome process on loopback for deterministic browser
  health and bounded Control Center observation receipts (DOM title hash,
  screenshot digest/dimensions, network counts, and console counts). No public
  debugging endpoint is exposed; an unowned loopback CDP endpoint is rejected.
- A bounded Repository Worker for status, inspection, recent history, and the
  repository's fixed verification command.
- Ordinary response-requesting conversation turns create a durable autonomous
  objective with propose, challenge, synthesis, implementation, verification,
  and integration nodes. Journal-style messages can explicitly remain notes,
  while worker questions still survive restart and resume in the same thread.
- Provider-neutral browser, signed-Chrome, and Windows desktop capability
  contracts. Mahoraga maps supported behavior without copying proprietary
  plugin implementations.
- Control Center 7.0 uses a ChatGPT-style chat-first workspace with conversation
  history, automatic worker routing, durable message threads, worker receipts in
  the conversation, and a bottom composer. Task, worker, connection, improvement,
  and diagnostic controls remain available as compact workspace views. A
  dedicated Coordination console now exposes Primary-led authority, the
  assignment-and-return mailbox lifecycle, bounded Secondary branches,
  deterministic validation, GitHub assurance cards, and a sanitized
  outbound-runner heartbeat without exposing chats, credentials, local checkout
  paths, or model output. Operations views are bookmarkable and background tabs
  stop polling until visible again.
- Cloud Workspace 2.0 adds a ChatGPT-style GitHub Pages launcher, installed
  Skills catalog, approvals queue, release dashboard, and read-only activity
  status. Authenticated task submission, image paste, and file
  attachment use GitHub's own signed-in issue form; the page stores no token,
  prompt, attachment, or chat history. An exact owner-authored gateway command
  idempotently routes an approved issue to Codex cloud or the outbound desktop
  poller. Deterministic Actions remain visibly separated from explicit model
  work. See [`docs/CLOUD-WORKSPACE.md`](docs/CLOUD-WORKSPACE.md).
- A successful exact-`main` verification automatically packages an immutable beta
  release with a strict SHA-256 manifest and GitHub provenance, without repeating
  the same full gate. Releases never install themselves; the local runtime may
  activate one only after verification and a rollback checkpoint. See
  [`docs/UPDATE-CHANNEL.md`](docs/UPDATE-CHANNEL.md).
- Candidate improvements pass candidate-specific verification before the local
  runtime activates them. Activation records a receipt and restores the prior
  release automatically if post-activation checks fail.
- Authenticated loopback-only Primary Codex intake with server-generated
  correlation IDs and immutable execution receipts. The local token is runtime
  state and is never kept in Git or SQLite.
- Owner-gated, event-driven Destiny Codex dispatch through a hash-bound GitHub
  pull-request envelope. Trusted `main` validates the immutable base commit,
  allowed paths, fixed verification profiles, and privacy declaration before
  work proceeds; `[DESTINY-CODEX:ACK]` is the delivery receipt. See
  [`docs/DESTINY-CODEX-RELAY.md`](docs/DESTINY-CODEX-RELAY.md).
- Operational and core repair remain automatic; missing core files are restored
  from the verified release baseline with receipts and rollback checkpoints.
- VS Code prompt files for health review, repository drift review, and tested
  improvement-candidate creation.

## Choose the right UI

- **Operate Mahoraga on this Windows machine:** open
  `http://127.0.0.1:4782`. This is the live Control Center for conversations,
  workers, tasks, connections, improvements, diagnostics, and Primary/Secondary
  coordination. Start the supervised runtime first if the page is unavailable.
- **Test GitHub Copilot cloud agent:** open the repository's **Agents** tab,
  select `mahoraga`, choose `main` as the base branch, and start with a
  read-only prompt such as `Inspect main and report current health; do not
  modify files or create a pull request.` Use an issue assigned to Copilot when
  a task should deliberately create a pull request.
- **Use the Cloud Workspace launcher:** GitHub Pages is optional and public.
  Mahoraga skips its Pages deployment while the repository is private. In
  private mode, use GitHub's signed-in Agents, Issues, Pull requests, Actions,
  and Deployments views instead; the private repository is not a secure
  private-hosting mechanism for a personal-account Pages site.
- **Call the Destiny-authenticated Codex:** open an owner-authored pull request
  to `main` with the exact title `[DESTINY-CODEX] <envelope title>` and one
  generated envelope under `coordination/destiny-dispatches/`. GitHub delivers
  the event without an inbound tunnel. Wait for both the read-only validation
  check and a matching `[DESTINY-CODEX:ACK]` comment before treating it as connected.


## Candidate lifecycle

Do not use `scripts/start-production.ps1` for this branch before release
verification. Task 11 starts the candidate against a temporary state copy on
alternate loopback port `4783`, leaving the `3.6.0` process and state untouched.

After promotion, the production launcher remains the supported start path and
verifies the declared runtime and Control Center versions before reporting
readiness.

## Verify

```powershell
$node = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
& $node src\cli.mjs validate
& $node --test --test-isolation=none
```

GitHub verification, Dependabot, CodeQL, secret scanning, and idle mailbox
polling are deterministic automation and do not invoke Codex or consume model
credits. See [`docs/ZERO-CREDIT-AUTOMATION.md`](docs/ZERO-CREDIT-AUTOMATION.md)
for the exact trigger boundary.

## Current candidate state

The repository declares enabled workers, but routability is derived from current
runtime evidence. An enabled flag or historical connection check is never
presented as a verified route.

- Deterministic local, repository, repair, browser, Desktop, Microsoft 365, and
  Primary Codex Builder contracts are present; each remains unroutable when its
  process, provider, canary, attended-session, or integration-lease evidence is
  absent or stale.
- LM Studio, GitHub Copilot, Workspace Agent cloud, Microsoft queue, Copilot
  Studio delegation, Lenovo AI, and metered OpenAI API routes remain disabled or
  blocked by their declared prerequisites.
- New content-bearing writes use the encrypted local vault; SQLite retains
  bounded references and operational evidence only.
- Healthy repair scans do not create durable polling tasks or events. Incident
  transitions are recorded only when the observed condition changes.

## Update model

Mahoraga may observe incidents, propose a candidate, write a regression test,
and report verification evidence. Its declared policy permits verified automatic
activation with rollback after the required gates; this alpha branch itself is
not activated and cannot use documentation as promotion evidence.
