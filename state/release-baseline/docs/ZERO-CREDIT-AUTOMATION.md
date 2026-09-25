# Zero-credit automation boundary

Mahoraga separates deterministic coordination from model execution. Background
health, security, and mailbox automation must not invoke Codex merely to decide
whether work exists.

## Runs without model credits

| Automation | Trigger | Result |
| --- | --- | --- |
| Verify Mahoraga | Pull request or push to `main` | Manifest, mailbox, repository audit, and Node tests on Linux and Windows |
| Dependabot | GitHub weekly schedule and advisory events | Dependency update or security pull requests |
| CodeQL default setup | Push, pull request, and GitHub schedule | Actions, JavaScript/TypeScript, and Python security analysis |
| Secret scanning and push protection | Git object publication | Blocks or alerts on supported credential patterns |
| Secondary runner poll | Local Windows scheduled task | Fetches and validates bounded metadata; an idle poll stops before Codex |
| Repository status, verify, and gap audit | Owner-started GitHub workflow | Deterministic status or test evidence only |
| Cloud task intake and validation | Issue submission and owner review | No model; validates metadata and waits for an exact owner dispatch command |
| Destiny relay envelope validation | `[DESTINY-CODEX]` pull request event | No model; trusted `main` validates the immutable envelope and changed paths |
| Staged update packaging | Owner-started release workflow | Verification, archive, SHA-256 manifest, and provenance only |
| Unified workspace ordinary route | Owner sends a turn through an explicitly paired runtime | Deterministic/local-model capability only; relay forces `zero-codex` and rejects a paid fallback |

These paths use GitHub-hosted compute or local deterministic processes. They do
not send a prompt to ChatGPT, Codex, Copilot, or an OpenAI Platform endpoint.

The GitHub Pages browser and Cloudflare execution runtime do not make inference
free by themselves. General-language generation on the ordinary route is
available only when a separately admitted provider has verified zero-credit
billing evidence and a fresh capability canary. Without that evidence, Mahoraga reports
`zero-credit-provider-unavailable`; it never substitutes the installed Codex CLI
or AI Gateway. Deterministic registered capabilities remain usable.

## Request dispatch and recovery

The supervisor checks the canonical route before claiming a request. Requests
assigned to other workers keep their execution attempts. Available authorized
workers can handle independent requests concurrently; a request whose eligible
workers are all busy stays queued until capacity returns. The supervisor checks
authority and readiness again after claiming and before dispatch.

Objective reconciliation selects active objectives before applying its bounded
500-objective batch, ordered by least recent update. Completed history cannot
hide active work. Replanning preserves original exclusions and every previously
failed worker. If recovery would exceed the 16-worker exclusion bound, the
objective fails with recovery evidence instead of cycling back to rejected
workers.

## Zero-credit answer admission

Zero-credit policy applies whether supplied by the request mode or routing
context. Answer admission binds billing and readiness evidence to the selected
provider identity. A matching cost class alone cannot admit a different worker.
When the cloud provider is excluded or busy, a verified local provider can take
the request. If the only verified provider is busy, the request stays queued;
an idle provider without evidence cannot consume it. Ambiguous duplicate provider
evidence fails closed regardless of input order.
When provider evidence is temporarily absent, the supervisor leaves the answer
queued with its execution attempts intact. A later admitted provider can run
that same request without resubmission or a paid fallback.

## Explicit model-spend boundary

A model may run only after one of these deliberate actions:

- a new validated Secondary assignment reaches a registered local runner;
- the operator explicitly retries a failed Secondary assignment;
- the owner deliberately creates a Codex cloud task; or
- the owner opens or updates a valid `[DESTINY-CODEX]` dispatch pull request; or
- the owner posts an exact `/mahoraga dispatch codex` or registered desktop-lane command; or
- the owner invokes another declared model-backed provider capability; or
- the owner selects **Cloud Pro · explicit** in the unified workspace.

Idle polling, provider readiness checks, CI, security scanning, dependency
updates, branch monitoring, and repository metadata synchronization never cross
that boundary. Failed or interrupted Secondary work remains paused; automatic
retry is prohibited.

## Connection design

GitHub is the durable coordination ledger. Authorized Codex instances exchange
only branches, pull requests, bounded assignment/result records, check results,
and commit identifiers. Neither instance needs inbound network access to the
Windows host. The local runner polls outbound and retains its own authentication.

No automation may copy chat history, model output, browser data, credentials,
personal files, or unrelated context into GitHub. Repository visibility remains
a separate user-controlled setting.
