# Mahoraga 3.1 — Production runtime

Mahoraga v2 is the production local runtime for Project Mahoraga. It replaces
the PowerShell/WPF application host with a Node.js supervisor, process-isolated
workers, a durable SQLite task store, lease-based recovery, heartbeats, a local
control API, and a browser-based cockpit.

The supplied v1 projects remain untouched. Their deterministic adapters and test
suites are source material for later worker migration.

## Production capabilities

- Canonical `mahoraga.manifest.json` for workers, connections, cost routing, and
  update authority.
- Localhost-only control server at `http://127.0.0.1:4782`.
- Permanent supervisor with worker heartbeats, crash restart, bounded retry, and
  durable task leases.
- SQLite task, worker, event, and improvement state using the Node 24 runtime.
- Isolated `local-core`, `repository`, `browser`, and `self-healer` worker processes.
- A dedicated headless Chrome process on loopback for deterministic browser health
  and Control Center rendering receipts. No public debugging endpoint is exposed.
- A bounded Repository Worker for status, inspection, recent history, and the
  repository's fixed verification command.
- A sleek local cockpit showing workers, connections, tasks, failures, and
  improvement candidates.
- Candidate improvements that cannot be approved without a candidate-specific
  user approval header. Approval records a decision; this phase intentionally
  implements no automatic activation path.
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

- LM Studio: declared but disabled until a fresh local runtime probe passes.
- Copilot Studio: General Mahoraga, Mahorago Tenant Health Reader, and Mahorago
  Enterprise Core are published. The two requested Mahorago agents use the
  audited production read-only MCP surface. Researcher and App Builder remain
  isolated Microsoft connected-agent 404 failures.
- Lenovo AI Now: the supplied project has a bounded legacy adapter; the linked
  Lenovo page is a device user guide and provides no supported AI automation API.
- Browser Worker: enabled in production. Desktop Worker remains off pending its
  process contract and application-specific receipts.
- Microsoft 365 queue: Dataverse is selected; activation awaits explicit
  confirmation of the exact environment URL and solution before schema creation.

## Update model

Mahoraga may observe incidents, propose a candidate, write a regression test,
and report verification evidence. Only the user may approve and separately
activate an update. The v2 runtime contains no autonomous activation method.
