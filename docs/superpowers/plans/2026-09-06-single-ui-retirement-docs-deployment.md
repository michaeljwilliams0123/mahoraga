# Single-UI Retirement, Documentation, and Deployment Consolidation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the Mahoraga UI consolidation so the canonical workspace is the only active/documented browser interface, duplicate UI code is retired after parity, repository instructions cannot recreate a second UI, and production metadata/deployment entry points all resolve to the canonical workspace.

**Architecture:** `cloud-app/` is the one browser application. The loopback runtime remains the authority/API and redirects to the canonical workspace. Vercel may produce immutable preview/deployment artifacts, but only the configured production workspace URL is a navigation target. Current docs and agent instructions describe only the canonical workspace. Historical Git history remains the audit trail; active documentation does not direct users or agents to a second Mahoraga UI.

**Tech Stack:** GitHub repository metadata and docs, Node contract tests, PowerShell launcher scripts, Next.js/Vercel canonical workspace, existing GitHub exact-head verification.

**Spec:** `docs/superpowers/specs/2026-09-06-canonical-workspace-admin-extensibility-design.md`

## Global Constraints

- Do not delete duplicate UI code until the replacement Operations/admin modules have parity and exact-head verification is green.
- Do not create redirects that expose the loopback API publicly.
- Vercel preview URLs may exist as deployment artifacts but must not appear as alternate user entry points.
- GitHub Pages and other retired hosting must not be restored.
- Current active documentation/instructions should use one canonical UI name and URL. Historical Git commits remain untouched.
- No Codex review; Vercel remains observational for PR completion.
- Update release-baseline mirrors only through the repository's existing release/evolution rules if those mirrors are in scope for changed active files.

---

## Task 1: Add a repository-wide canonical UI contract

**Files:**
- Create: `test/canonical-ui-contract.test.mjs`
- Modify: `package.json` only if test discovery does not already include `test/*.test.mjs`

### Contract

The test must assert:

- canonical URL is `https://mahoraga-cloud-workspace.vercel.app/` unless the repository has deliberately centralized it into a single config value during implementation;
- active docs/instructions identify `cloud-app/` as the one browser UI;
- active docs/instructions do not advertise a second browser UI or alternate navigation URL;
- no active GitHub Pages workflow exists;
- launcher/open scripts resolve to the canonical workspace;
- agent instructions prohibit creating/documenting parallel Mahoraga browser UIs.

Scan these active surfaces explicitly:

- `README.md`
- `AGENTS.md`
- `docs/ECOSYSTEM-LOCK.md`
- `docs/CLOUD-WORKSPACE.md`
- `docs/OPERATOR-CONSOLE.md` if it still exists during migration
- `cloud-app/README.md`
- `.github/copilot-instructions.md`
- `.github/ai-instructions.md`
- `.github/instructions/typescript-ui.instructions.md`
- `.github/agents/*.agent.md`
- supported launcher/open scripts under `scripts/`

Do not scan Git history or superseded design/implementation plan artifacts as runtime/user guidance.

- [ ] Write the test first using a deterministic allowlist of active files and prohibited alternate-UI patterns/URLs.
- [ ] Run `node --test test/canonical-ui-contract.test.mjs`; confirm RED against current two-surface instructions.
- [ ] Ensure failure output names exact offending files and patterns so future agents can self-repair drift.

**Acceptance:** Repository verification deterministically fails if an active instruction/document reintroduces a competing Mahoraga UI.

---

## Task 2: Rewrite active documentation to one canonical workspace

**Files:**
- Modify: `README.md`
- Modify: `cloud-app/README.md`
- Modify: `docs/CLOUD-WORKSPACE.md`
- Modify or delete after migration: `docs/OPERATOR-CONSOLE.md`
- Modify: `docs/ECOSYSTEM-LOCK.md`
- Modify: `AGENTS.md`

- [ ] Make the root README describe one Mahoraga browser workspace and its integrated Chat/Operations/Agents/Plugins/Files/Browser/Automations/Activity/Settings views.
- [ ] Remove language that describes separate conversation/operator browser products.
- [ ] Make `docs/CLOUD-WORKSPACE.md` the canonical current-state UI architecture document.
- [ ] Once Operations parity is green, delete `docs/OPERATOR-CONSOLE.md` or reduce it to a short non-navigational migration note and then remove it in the same retirement PR if no current references require it.
- [ ] Rewrite `docs/ECOSYSTEM-LOCK.md` `Surfaces` and hard rules so only `cloud-app/` is a browser UI. Preserve TypeScript/Node language locks, rollback, exact-head Verify, no-public-tunnel, and sovereign evolution rules.
- [ ] Update `AGENTS.md` to make single-UI preservation a standing agent constraint.
- [ ] Run the canonical UI contract after each documentation group.

**Acceptance:** A reader of any active top-level/current-state document receives one UI and one entry point, with no competing workflow.

---

## Task 3: Update all coding-agent instructions so they cannot recreate a second UI

**Files:**
- Modify: `.github/copilot-instructions.md`
- Modify: `.github/ai-instructions.md`
- Modify: `.github/instructions/typescript-ui.instructions.md`
- Modify: `.github/agents/mahoraga-experience.agent.md`
- Inspect/modify other `.github/agents/*.agent.md` containing surface/URL instructions
- Modify: `test/canonical-ui-contract.test.mjs`

- [ ] Replace current `cloud-app + operator-deck` instructions with `cloud-app/` as the sole browser implementation.
- [ ] Add explicit instruction: extend the canonical workspace with modules/components; never create another Mahoraga browser app/site/host as a feature shortcut.
- [ ] Preserve `src/*.mjs` core, exact-head verification, zero-credit review policy, and no JavaScript rewrite rules.
- [ ] Update the experience agent from `Two TypeScript browser surfaces` to ownership of the canonical workspace and integrated views.
- [ ] Add a test that fails if any active agent instruction contains a second browser-surface declaration.
- [ ] Run `node --test test/canonical-ui-contract.test.mjs`.

**Acceptance:** Future agents are instructed to add capabilities inside Mahoraga rather than spawning another UI.

---

## Task 4: Consolidate launchers, repo metadata, and canonical URL references

**Files:**
- Modify: `scripts/open-workspace.ps1`
- Inspect/modify any other launcher scripts that open a browser UI
- Modify: `src/server.mjs` only if canonical URL centralization requires it
- Modify corresponding server/launcher tests
- Repository setting: GitHub repository homepage

- [ ] Add/extend tests for `canonicalWorkspaceUrl()` and the open-workspace launcher so the only supported browser target is canonical HTTPS root.
- [ ] Make `scripts/open-workspace.ps1` open the canonical workspace directly and reject accidental preview/alternate URLs unless the owner explicitly sets the existing supported canonical override for deployment migration.
- [ ] Search active scripts/config for Pages, alternate Vercel app names, alternate UI hosts, and local/static frontend launch commands; remove those entry points.
- [ ] Update the GitHub repository homepage to `https://mahoraga-cloud-workspace.vercel.app/` using the connected repository administration capability if available. If the active GitHub connection cannot mutate repository metadata, report that single setting as an explicit owner-side action; do not invent a second config file as a substitute.
- [ ] Re-run canonical UI contract and server tests.

**Acceptance:** README, repo homepage, runtime redirect, and supported launcher all lead to the same canonical URL.

---

## Task 5: Verify parity, then remove the standalone duplicate UI implementation

**Files:**
- Delete after parity: `operator-deck/**`
- Modify any build/workspace config that still references `operator-deck/`
- Modify any tests/workflows that target it as a deployable UI
- Modify: `test/canonical-ui-contract.test.mjs`

### Parity gate before deletion

Confirm the canonical workspace already provides, through core-owned contracts:

- repository/exact-head status
- GitLab assurance/repair state where core evidence exposes it
- fleet/workers/tasks/objectives
- owner routine operations actions
- agent management
- plugins/connections management
- activity/receipts
- update/rollback state

- [ ] Write a parity checklist test or deterministic fixture mapping old operator capabilities to canonical module capability/action IDs.
- [ ] Run focused Operations/admin tests and require all parity assertions green.
- [ ] Delete `operator-deck/` only after the parity gate passes.
- [ ] Remove build/deployment config references that attempt to deploy the standalone operator deck.
- [ ] Remove active documentation links to deleted operator-deck paths.
- [ ] Re-run canonical UI contract and repository tests.

**Acceptance:** There is physically one browser UI implementation in the active repository, not merely one preferred link.

---

## Task 6: Remove other retired/alternate UI references and hosting entry points

**Files:**
- Modify active docs/config/scripts identified by `test/canonical-ui-contract.test.mjs`
- Inspect: `.github/workflows/**`
- Inspect: root/current deployment config

- [ ] Confirm no GitHub Pages deployment workflow exists; if one exists, remove it in this PR and add a regression assertion.
- [ ] Remove active references that present Google Workspace/App surfaces, Wix experiments, local/static UI, Vercel aliases/previews, or other hosts as Mahoraga UI entry points.
- [ ] Keep Google Workspace, GitHub, GitLab, Vercel, GitBook, and other legitimate products documented only in their actual roles (identity/integration/repo/assurance/hosting/docs), not as competing Mahoraga browser interfaces.
- [ ] Ensure Vercel is described as the host of the canonical app, while preview URLs remain non-canonical deployment artifacts.
- [ ] Run the canonical UI contract.

**Acceptance:** No active repo guidance can reasonably send the owner to a different Mahoraga UI.

---

## Task 7: Production deployment and observable health verification

**Files:** no product edits unless deployment verification finds a defect.

- [ ] Run `cd cloud-app && npm run verify`.
- [ ] Run repository `npm run verify` once on the exact candidate head.
- [ ] Open the consolidation PR and wait for exact-head Ubuntu/Windows Verify green. `Verify unified Vercel workspace` remains observational.
- [ ] After integration through normal repository policy, inspect the connected Vercel `mahoraga-cloud-workspace` production deployment and confirm the production alias resolves to the exact integrated commit.
- [ ] Verify `GET /api/health` on the canonical deployment returns the expected client/core boundary without claiming unavailable capabilities ready.
- [ ] Confirm repository homepage and supported launcher resolve to the canonical URL.
- [ ] Confirm GitLab exact-head assurance observes the new GitHub `main` SHA and remains green; if unhealthy, use the already-implemented repair bridge rather than weakening checks.
- [ ] Do not treat preview deployment URLs as new canonical addresses.

**Acceptance:** One integrated commit is green in GitHub, independently observed by GitLab, and represented by the canonical production Vercel workspace.

---

## Task 8: Final drift-prevention verification

- [ ] Run `node --test test/canonical-ui-contract.test.mjs`.
- [ ] Run a repository text search for active alternate-UI names/URLs and inspect every hit.
- [ ] Confirm any remaining hit is either a non-UI integration role or an intentionally historical implementation artifact excluded from active guidance.
- [ ] Run `git status --short` and ensure no generated build output or secret file is staged.
- [ ] Record final exact-head verification, deployment SHA, canonical URL, GitLab assurance state, and operator-deck retirement in the PR completion evidence.

**Acceptance:** The active repository, deployment metadata, and agent instructions converge on one authorized Mahoraga workspace and have a deterministic regression test preventing UI fragmentation from returning.