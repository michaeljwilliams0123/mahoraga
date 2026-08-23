# Mahoraga v2 working rules

These instructions apply to this repository and everything below it.

- `mahoraga.manifest.json` is the canonical declaration of runtime, workers, connections, cost routing, and update authority.
- The user is the only authority that may activate a core update to Mahoraga itself. Known operational repairs may run automatically under the manifest's bounded repair policy; structural changes remain staged candidates until the user authorizes a production cutover.
- Keep the control API bound to `127.0.0.1`. Do not introduce inbound tunnels or public listeners.
- Capabilities belong to isolated workers. Do not add a generic unrestricted shell or a caller-selected executable path to the supervisor.
- Cloud connectors must be opt-in and data-class aware. Enterprise data stays in the Microsoft tenant; local-only data stays on the device.
- Never store credentials, prompts, model responses, browser history, or document content in the runtime database. Store bounded task and diagnostic metadata.
- GitHub coordination records contain only bounded task metadata and repository evidence. Never copy ChatGPT conversations, Destiny's chats, credentials, personal files, or unrelated user context into assignments, results, commits, branches, issues, or pull requests.
- The main Codex owns assignments on `main`. A secondary Codex returns only `secondary/<assignment-id>` branches and never pushes directly to `main`.
- Preserve task idempotency, leases, crash recovery, worker heartbeats, and the append-only event ledger.
- Add focused tests for behavior changes and run `npm run verify`.
