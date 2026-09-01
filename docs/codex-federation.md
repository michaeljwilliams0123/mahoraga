Codex Federation & Low-Cost Orchestration (summary)

Goal
- Provide a low-credit, multi-provider orchestration pattern connecting Primary (Mike) Codex, Destiny, Copilot, ChatGPT Workspace Agent, Claude/Cursor/Grok via MCP adapters.

Key findings
- Providers: primary-codex-builder (codex CLI), github-copilot (copilot CLI), workspace-agent-cloud (ChatGPT trigger), microsoft365, secondary-codex-runner. Provider readiness: primary codex and copilot verified locally.
- Secondary runner and workspace agent handle bounded repo work (assignments + return branch model).

Low-credit pattern
1. Tiered routing: local/deterministic -> question-model (licensed-cloud, low-cost) -> primary codex (commit-ready) -> workspace-agent/destiny for cloud execution.
2. Summarize & cache: use question-model to create short summaries and fingerprints; reuse cached summary for repeated queries.
3. Batch & compress: group related prompts into single compact context; prefer structured metadata over raw transcripts.
4. Authority envelope: use coordination/dispatch (destiny/codex dispatch) for any commit or high-authority operation.

Quick next steps implemented
- Added src/codex-federation.mjs and scripts/codex-federation.mjs (lightweight federation helper) — quick narrow PR pushed.
- Added todos entry 'codex-federation' to track next work.
- Ran provider readiness and verified providers locally.

Recommended next work (optionally implement)
- Implement a small broker (native API) that: routes short queries to question-model, caches summaries, escalates commit tasks to primary codex via execution cell.
- Add a cheap token accounting middleware (per-session budgets) to cap spend.
- Wire federation records into coordination/assignments to reflect which controller authored changes.

If approved, implement the broker prototype (scripts/codex-broker.mjs) and a miniature token-cache using state/.
