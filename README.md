# Mahoraga 3.5 — Production runtime

Mahoraga v2 is the production local runtime for Project Mahoraga. It replaces
the PowerShell/WPF application host with a Node.js supervisor, process-isolated
workers, a durable SQLite task store, lease-based recovery, heartbeats, a local
control API, and a browser-based cockpit.

The supplied v1 projects remain untouched. Their deterministic adapters and test
suites are source material for later worker migration.

## Production capabilities

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
- Durable assignment conversations, worker questions, and user replies. A task
  can enter `waiting_for_user`, survive restart, and resume without losing its
  correlation ID or conversation history.
- Provider-neutral browser, signed-Chrome, and Windows desktop capability
  contracts. Mahoraga maps supported behavior without copying proprietary
  plugin implementations.
- Control Center 5.3 uses a ChatGPT-style chat-first workspace with conversation
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
- The staged update channel packages immutable source, verifies it, publishes a
  strict SHA-256 manifest, and attaches GitHub provenance. Beta and stable
  releases never install or activate themselves; user-only activation and
  rollback evidence remain mandatory. See
  [`docs/UPDATE-CHANNEL.md`](docs/UPDATE-CHANNEL.md).
- Candidate improvements that cannot be approved without a candidate-specific
  user approval header. Approval records a decision; this phase intentionally
  implements no automatic activation path.
- Authenticated loopback-only Primary Codex intake with server-generated
  correlation IDs and immutable execution receipts. The local token is runtime
  state and is never kept in Git or SQLite.
- Operational repair remains automatic; missing core files are staged as repair
  candidates with verification evidence and a user-only activation boundary.
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


## Production lifecycle

Start the runtime in the background:

```powershell
& '.\scripts\start-production.ps1'
```

Then open `http://127.0.0.1:4782`.

Stop it with `scripts/stop-production.ps1`. The launcher prevents duplicate
instances, writes only bounded process logs under `state/`, and waits for the
localhost health endpoint before returning.

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

## Current connection state

The 3.5.1 repository contract, Control Center 5.3.1, and Cloud Workspace 2.0.0 are staged for deployment on
2026-08-24. The per-user `Mahoraga Production Runtime` launcher is registered,
and the four enabled isolated workers are supervised on loopback.

- LM Studio: declared but disabled until a fresh local runtime probe passes.
- Copilot Studio: General Mahoraga, Mahorago Tenant Health Reader, and Mahorago
  Enterprise Core are published. The two requested Mahorago agents use the
  audited production read-only MCP surface. Researcher and App Builder remain
  isolated Microsoft connected-agent 404 failures.
- Lenovo AI Now: the supplied project has a bounded legacy adapter; the linked
  Lenovo page is a device user guide and provides no supported AI automation API.
- Browser Worker: enabled for isolated Control Center status, smoke, and observe
  checks only. Browser screenshots stay in local runtime state for at most 24
  hours; signed-in browsing remains disabled pending explicit user approval.
  Desktop Worker remains off pending its process contract and application-specific receipts.
- Microsoft 365 queue: Vaco (default) (Upgrade), MahoragaPlatform, and the
  permanent `mhg_` publisher are confirmed. Activation awaits completion of the
  reusable Dataverse CLI authentication now in progress.

## Update model

Mahoraga may observe incidents, propose a candidate, write a regression test,
and report verification evidence. Only the user may approve and separately
activate an update. The v2 runtime contains no autonomous activation method.
