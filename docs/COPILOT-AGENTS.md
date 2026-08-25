# Mahoraga GitHub Copilot agents

Mahoraga defines four repository-scoped custom agent profiles under
`.github/agents/`. They are specialized implementation surfaces, not new trust
authorities.

| Agent | Purpose | Explicit boundary |
| --- | --- | --- |
| `mahoraga-coordinator` | Decompose bounded repository work and select specialists. | No overlapping edits, merge, release, visibility, or device activation. |
| `mahoraga-relay` | Task protocol, idempotency, leases, fencing, and outbound runners. | No tunnels, public listeners, or persisted model content. |
| `mahoraga-assurance` | Privacy, security, supply chain, recovery, and adversarial tests. | Emit paths, classes, counts, and hashes—not sensitive values. |
| `mahoraga-experience` | Cloud workspace, accessibility, task visualization, and approvals. | GitHub Pages remains static and public-safe. |

All profiles require explicit selection and expose only repository read, search,
edit, execution, and—in the coordinator's case—specialist delegation tools.
They read `AGENTS.md` and may return pull requests, but never merge them or
approve their own production activation.

## Cloud-agent availability

The profiles become generally selectable after they reach the repository's
default branch. A successful profile definition does not prove that the account
or repository currently permits a Copilot cloud-agent session. Launch readiness
must be confirmed independently through GitHub's assignable actor or agent-task
API. A `403` is treated as an unavailable provider state; Mahoraga does not copy
credentials or weaken authentication to bypass it.

Copilot-ready backlog issues may be prepared while the provider is unavailable.
Assignment occurs only after `copilot-swe-agent` is returned as an assignable
actor or a supported `gh agent-task create` request succeeds.

## Credit and privacy policy

Opening or updating a backlog issue is deterministic. A Copilot cloud-agent
session consumes GitHub Copilot/Actions resources and therefore requires an
explicit owner action. Issue bodies contain repository-only tasks and never
contain ChatGPT conversations, personal documents, credentials, tenant content,
browser history, or raw plugin output.
