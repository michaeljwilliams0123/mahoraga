# Mahoraga provider-adapter contracts

Mahoraga replicates useful capability patterns, not proprietary plugin code.
The runtime owns task durability, discourse, routing, isolation, and verification;
each execution surface is a replaceable provider adapter.

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

## Browser hierarchy

1. Purpose-built API, connector, or CLI when it covers the requested operation.
2. Browser-family adapter selected from explicit user intent or target URL.
3. DOM/DevTools observation and interaction.
4. Visual computer use only when structured browser state is insufficient.

The target contract includes tabs, open, navigate, read, inspect, click, type,
select, upload, download, wait, screenshot, network, console, and close. The
current production local adapter implements isolated Chrome health and verified
Control Center smoke. Signed-session Chrome and in-app-browser bindings remain
provider work, not claims of current completion.

## Desktop hierarchy

1. Application or supported API.
2. Power Automate Desktop or application-specific automation.
3. Windows UI Automation.
4. Visual computer use.

Each desktop action uses: select exactly one returned window, observe current
state, perform one bounded action, re-observe, then verify. The Desktop Worker
remains disabled until its application allowlist and production receipt land.

## Persistent discourse

Every assignment can own a conversation. Messages are durable, survive restart,
and travel with the worker envelope. A worker may request information and move
its task to `waiting_for_user`; a later user message resumes the same task. This
is the continuity layer needed for unattended assignments. Reasoning still
depends on whichever local, Microsoft, or optional OpenAI provider is healthy.
