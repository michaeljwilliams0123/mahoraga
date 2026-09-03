# Workspace Agent cloud execution lane

This lane triggers a published ChatGPT Workspace Agent from Mahoraga without an
OpenAI Platform API key and without installing software on the secondary user's
computer. It uses `AGENT_ACCESS_TOKEN` and `WORKSPACE_AGENT_TRIGGER_ID` only.
Secrets remain outside Git in the operating-system or deployment secret store.

`AGENT_ACCESS_TOKEN` means a Workspace-Agent-scoped token created through the
ChatGPT workspace admin access-token flow. An OpenAI Platform API key (including
an `sk-...` key) is rejected. This is also separate from the ChatGPT Plus/Codex
subscription sign-in used by the local Codex CLI runner: those credentials are
neither accepted by this adapter nor copied between computers. If the workspace
admin token flow is unavailable, leave this optional worker disabled and use the
authenticated outbound GitHub/Codex CLI mailbox instead.

The trigger is deliberately coupled to the GitHub coordination mailbox. Main
Codex creates and pushes a structured assignment on `main`; the cloud agent may
push only its declared `secondary/<assignment-id>` branch. Mahoraga treats the
API's `202 Accepted` and beta run-status metadata (status only, never response
content) as execution evidence, not as a coding
result. Completion still requires the matching Git result record and repository
validation because Workspace Agent response content is not retrievable by API.

GitHub now has an actual cloud receiver at
`.github/workflows/workspace-agent-receiver.yml`. A newly added, validated
assignment on `main` invokes it automatically when the push is eligible to
start workflows. The Cloud Task Gateway explicitly dispatches this receiver
after publishing its assignment, because GitHub intentionally prevents a push
made with the workflow `GITHUB_TOKEN` from recursively starting another
workflow. The gateway never receives the Workspace Agent secrets and never
invokes a model itself. An owner can retry delivery
of one existing assignment from **Actions → Receive Workspace Agent Assignment**
or with this exact issue command:

```text
/mahoraga receive workspace-agent sec-...
```

The receiver is read-only in GitHub, accepts no batch, validates the canonical
repository and assignment record before delivery, skips an assignment whose
result is already on `main`, and reuses the adapter's stable idempotency key.
Untrusted issue comments and pull-request comments cannot activate it. If the
two receiver secrets are absent, it records `unconfigured` without making a
network or model request.

Store `AGENT_ACCESS_TOKEN` and `WORKSPACE_AGENT_TRIGGER_ID` as GitHub Actions
repository or environment secrets. Never put either value in an issue, commit,
workflow input, Vercel variable exposed to the browser, or chat message. The
published Workspace Agent must have its own bounded GitHub connection capable
of returning only the declared `secondary/<assignment-id>` branch.

Operator commands:

```powershell
node scripts/workspace-agent.mjs health
node scripts/workspace-agent.mjs trigger --assignment-id <sec-id>
node scripts/workspace-agent.mjs status --run-id <apirun-id>
```

The general runtime router keeps this optional adapter disabled until both
credential variables are stored securely. The dedicated receiver is separately
fail-closed and can prove configuration without enabling paid fallback for
ordinary conversation.
Its task envelope contains only assignment metadata, declared repository paths,
the bounded requested outcome, and the privacy prohibitions already enforced by
`docs/github-codex-coordination.md`. It never imports ChatGPT conversations,
credentials, browser history, personal files, or unrelated user context.
