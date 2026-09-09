# Mahoraga provider-adapter contracts

Mahoraga replicates useful capability patterns, not proprietary plugin code.
The runtime owns task durability, discourse, routing, isolation, and verification;
each execution surface is a replaceable provider adapter.

## Conversation admission policy

The unified workspace authorizes cost policy, not a provider identity. Its
automatic/default conversation policy is `zero-codex`: deterministic,
`local-model`, and independently verified zero-dollar generation lanes may be
admitted when their normal readiness evidence is fresh. `licensed-cloud`, paid
API, subscription-backed, stale-billing, and unknown-cost routes are never
silently substituted for that policy.

The transient Codex CLI-backed `question-model` is intentionally classified
`licensed-cloud`. It may answer only when the owner explicitly retries one
rejected answer as `licensed-approved`. The core accepts that policy only when
classification is exactly `assistant.respond`; objectives, `codex.execute`,
`self.evolve`, repository mutation, build, review, and other action capabilities
fail closed before persistence. A zero-credit rejection never triggers this
policy automatically, and the browser still cannot select the concrete provider.
## GitHub Copilot CLI execution lane

The `github-copilot` worker is an isolated, disabled-by-default licensed-cloud
provider. Its health probe runs only `copilot --version`; it never treats that
as proof of authentication or available quota. A live AI request is the only
authentication/quota confirmation and must be intentionally scheduled.

Every execution receives a bounded envelope containing task and correlation
identifiers, the declared task area, a fixed Mahoraga repository working
directory, and the requested outcome. The adapter uses JSONL output, a worker
timeout, an explicit tool allowlist, and bounded stdout/stderr capture with
hash/byte-count metadata. It disables remote session control/export, built-in
GitHub MCP tools, custom instructions, and temporary-directory access. It does
not use `--allow-all` or `--yolo`, does not push, and does not persist model
responses in the runtime database. The normal task receipt records deterministic
execution metadata; a separate validator must verify workspace changes.

## Primary Codex Builder boundary

Primary Codex is the interactive authority and is not a worker. The separate
`primary-codex-builder` contract carries only task ID, correlation ID, authority
session ID, and a generated task-scoped execution session ID. It stores no
prompts, responses, credentials, or interactive-session content. The installed
Codex Desktop AppX executable currently returns Access denied when started as a
direct process, so this provider is disabled and its health result reports that
exact boundary. No API key is required or created. A future supported local
invocation may return compact structured result metadata through the authenticated
Primary Codex intake/result endpoints; it cannot change Primary authority.

## Secondary Codex mailbox

The Secondary mailbox is a repository-native, account-neutral handoff record.
Mahoraga creates a concise READY assignment with its correlation ID, task area,
expected task, expected base commit, and expected `secondary/<assignment-id>`
return branch. It monitors that branch through the existing Repository Worker,
then validates the exact returned commit without checking it out: the expected
base must be an ancestor, `git diff --check` must pass, the changed-file list is
bounded, and the returned manifest must parse and pass canonical validation.
Only then can a return be marked validated. This flow never logs into, reads from, or automates a
separate person's ChatGPT/Codex account; that person may only pick up the READY
assignment and return an ordinary Git commit when separately authorized.

## Workspace Agent cloud execution lane

The `workspace-agent-cloud` provider is the programmatic trigger for a published
ChatGPT Workspace Agent. It uses Workspace Agent access-token credentials and
does not use an OpenAI Platform API key. The fixed API origin is
`https://api.chatgpt.com`; requests carry a stable assignment conversation key,
an idempotency key, and the beta run-status header. The provider persists only
bounded acceptance/status evidence and a hash of the returned conversation URL.
The adapter rejects `sk-...` Platform API keys and does not accept or copy the
ChatGPT Plus/Codex subscription authentication used by the local CLI runner.
Provisioning this optional lane requires the ChatGPT workspace admin token flow;
otherwise it remains disabled and the GitHub/Codex CLI mailbox is used.

Workspace Agent response content is not retrievable through the API. Therefore
`202 Accepted` or a completed run status never substitutes for a coding result.
The cloud agent must push the assignment's exact `secondary/<assignment-id>`
branch, and the existing repository mailbox remains the authoritative result and
validation plane. No desktop app, browser session, conversation transcript, or
credential from the secondary user's computer is required.

## Browser hierarchy

1. Purpose-built API, connector, or CLI when it covers the requested operation.
2. Browser-family adapter selected from explicit user intent or target URL.
3. DOM/DevTools observation and interaction.
4. Visual computer use only when structured browser state is insufficient.

The target contract includes tabs, open, navigate, read, inspect, click, type,
select, upload, download, wait, screenshot, network, console, and close. The
secondary runtime adapter now implements isolated Chrome health only; its former
loopback Control Center smoke and observation routes are retired with that UI.
Interactive browser work belongs to the approval-gated isolated cloud browser
in the unified browser workspace. The health worker rejects an unowned loopback
CDP endpoint rather than attaching to an existing user browser. Signed-session
Chrome and in-app-browser bindings remain disabled pending explicit one-time
user approval; the normal Chrome profile and cookies are never
copied or attached.

## Desktop hierarchy

1. Application or supported API.
2. Power Automate Desktop or application-specific automation.
3. Windows UI Automation.
4. Visual computer use.

The Desktop Worker process contract in `src/desktop-worker.mjs` is wired into the
isolated worker process and enabled in the canonical manifest. Its fixed application
allowlist covers Chrome, Edge, Excel, Word, PowerPoint, Visio, Outlook, and Teams.
`desktop.inspect` records only attended-session state plus bounded process/window
counts; it never stores window titles, document content, screenshots, or command lines.

`desktop.interact` remains intentionally narrow: `focus-window` requires exactly one
allowlisted top-level application window and re-verifies the foreground handle. The
v1.2 worker also exposes three bounded read/diagnostic surfaces: `desktop.powershell`
selects only fixed named diagnostics (`system-info` or `disk-free`),
`desktop.filesystem` hashes a bounded set of repository-relative files without
persisting their path or content, and `desktop.processes` returns capped telemetry only
for allowlisted applications. Filesystem inputs cross the PowerShell boundary through
an explicit process-environment envelope after Node-side path validation rather than
through shell interpolation.

Caller-selected executables, scripts, shell text, arbitrary filesystem roots, file
content, command lines, click/type sequences, and unrestricted UI automation remain
rejected. The attended Windows activation was verified with live canaries for session
inspection, both fixed diagnostics, repository-file hashing, and allowlisted process
telemetry; cross-platform GitHub verification remains the production promotion gate.
## Persistent discourse

Every assignment can own a conversation. Messages are durable, survive restart,
and travel with the worker envelope. A worker may request information and move
its task to `waiting_for_user`; a later user message resumes the same task. This
is the continuity layer needed for unattended assignments. Reasoning still
depends on whichever local, Microsoft, or optional OpenAI provider is healthy.
