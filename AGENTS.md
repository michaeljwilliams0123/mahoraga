# Mahoraga v2 working rules

These instructions apply to this repository and everything below it.

- `mahoraga.manifest.json` is the canonical declaration of runtime, workers, connections, cost routing, and update authority.
- The user is the only authority that may activate a core update to Mahoraga itself. Known operational repairs may run automatically under the manifest's bounded repair policy; structural changes remain staged candidates until the user authorizes a production cutover.
- Keep the control API bound to `127.0.0.1`. Do not introduce inbound tunnels or public listeners.
- Capabilities belong to isolated workers. Do not add a generic unrestricted shell or a caller-selected executable path to the supervisor.
- Cloud connectors must be opt-in and data-class aware. Enterprise data stays in the Microsoft tenant; local-only data stays on the device.
- Never store credentials, prompts, model responses, browser history, or document content in the runtime database. Store bounded task and diagnostic metadata.
- GitHub coordination records contain only bounded task metadata and repository evidence. Never copy ChatGPT conversations, Destiny's chats, credentials, personal files, or unrelated user context into assignments, results, commits, branches, issues, or pull requests.
- GitHub is a dual-primary coordination surface. `primary-local-codex` and `primary-cloud-codex` have equal authority to architect, decompose, create bounded assignments, implement, test, review, and integrate. Only one primary may hold the bounded integration lease at a time; overlapping paths are made visible and coordinated rather than categorically prohibited. Secondary Codex remains a bounded implementation lane and pushes only `secondary/<assignment-id>` branches; it must not push or merge `main`. Preserve attribution and deterministic evidence.
- GitHub `@codex` cloud tasks receive only validated repository task metadata through pull-request comments. Cloud Codex may act as `primary-cloud-codex` when the validated record grants that lane; otherwise it returns changes for primary review. It may not change repository settings, auto-merge, or activate a core update.
- Public issue intake never invokes a model by itself. Only an exact owner-authored `/mahoraga dispatch codex` or `/mahoraga dispatch desktop <task-area>` command may create a validated execution record; retries must reuse the same idempotent record.
- Published update artifacts remain stage-only. Verification, SHA-256 evidence, provenance, rollback readiness, and a separate user activation decision are mandatory; a release workflow may never install or activate code on a device.
- Automated secondary execution must use the secondary machine's local Codex authentication, an ephemeral workspace-write sandbox, explicit task-area project registration, actual changed-path enforcement, and bounded retries. It may implement scoped project work and is not limited to review or QA.
- Preserve task idempotency, leases, crash recovery, worker heartbeats, and the append-only event ledger.
- Add focused tests for behavior changes and run `npm run verify`.
