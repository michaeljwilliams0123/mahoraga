# Workspace Agent cloud execution lane

This lane triggers a published ChatGPT Workspace Agent from Mahoraga without an
OpenAI Platform API key and without installing software on the secondary user's
computer. It uses `AGENT_ACCESS_TOKEN` and `WORKSPACE_AGENT_TRIGGER_ID` only.
Secrets remain outside Git in the operating-system or deployment secret store.

The trigger is deliberately coupled to the GitHub coordination mailbox. Main
Codex creates and pushes a structured assignment on `main`; the cloud agent may
push only its declared `secondary/<assignment-id>` branch. Mahoraga treats the
API's `202 Accepted` and beta run status as execution evidence, not as a coding
result. Completion still requires the matching Git result record and repository
validation because Workspace Agent response content is not retrievable by API.

Operator commands:

```powershell
node scripts/workspace-agent.mjs health
node scripts/workspace-agent.mjs trigger --assignment-id <sec-id>
node scripts/workspace-agent.mjs status --run-id <apirun-id>
```

The adapter is disabled until both credential variables are stored securely.
Its task envelope contains only assignment metadata, declared repository paths,
the bounded requested outcome, and the privacy prohibitions already enforced by
`docs/github-codex-coordination.md`. It never imports ChatGPT conversations,
credentials, browser history, personal files, or unrelated user context.
