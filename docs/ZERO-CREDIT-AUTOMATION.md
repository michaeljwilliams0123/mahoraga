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

These paths use GitHub-hosted compute or local deterministic processes. They do
not send a prompt to ChatGPT, Codex, Copilot, or an OpenAI Platform endpoint.

## Explicit model-spend boundary

A model may run only after one of these deliberate actions:

- a new validated Secondary assignment reaches a registered local runner;
- the operator explicitly retries a failed Secondary assignment;
- the owner deliberately creates a Codex cloud task; or
- the owner invokes another declared model-backed provider capability.

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
