# Mahoraga 3.3 — Production runtime

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
- Control Center 5.2 uses a ChatGPT-style chat-first workspace with conversation
  history, automatic worker routing, durable message threads, worker receipts in
  the conversation, and a bottom composer. Task, worker, connection, improvement,
  and diagnostic controls remain available as compact workspace views. A
  dedicated Coordination console now exposes the Primary-led repository mailbox
  lifecycle, bounded Secondary return branches, and deterministic validation
  state plus a sanitized outbound-runner heartbeat without exposing chats,
  credentials, local checkout paths, or model output.
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
& 'C:\Users\MikeWilliams\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' src\cli.mjs validate
& 'C:\Users\MikeWilliams\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --test --test-isolation=none
```

## Current connection state

The 3.3.0 runtime and Control Center 5.2.0 are staged for local deployment on
2026-08-23. The per-user `Mahoraga Production Runtime` launcher is registered,
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
