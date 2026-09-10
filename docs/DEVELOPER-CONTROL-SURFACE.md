# Developer Control Surface & Ownership Map

> **Status: DESIGN DRAFT.** Maps the real authority a developer/reviewer holds in the
> sandbox-to-promote pipeline, plus the plugin/extensibility points. No file grants tenant rights;
> the one-time admin grant that activates your approver key is noted explicitly. Grounded in Microsoft Learn.

## Your two promote paths — both land at your gate

You choose, per deployment:

| Path | Route | Speed | Gate |
|---|---|---|---|
| **Fast** | Dev → Prod in one action | fastest | still pauses at **your** approval |
| **Staged** | Dev → Test → Prod | more validation | approval at Prod |

**Important honesty note:** "direct to production" here means *promote in one move*, not *skip the
approval*. A configured pre-deployment approval pauses the pipeline until a human presses Approve —
by platform design, there is no gate-free prod path. That gate is what makes the deploy **yours**. [1][2]

## What you own outright (no admin needed)

- Author & edit agent contracts in the repo.
- Trigger sandbox builds; iterate, tear down, redo — freely.
- Run the AI-to-AI relay loop; review its output.
- Read the strengthening monitor's risk summary at the gate.
- **Press Approve** to promote (once your approver role is assigned).
- Merge PRs, manage branches.

## The one-time admin grant that lights up your approver key

Not code — a settings/role grant (see `ADMIN-PREREQUISITE-CHECKLIST.md`):
- Assign you as **Deployment Stage Approver** on the Prod stage. [3]
- Enable managed environments on targets. [2]
Once done, your "Approve" is real promote authority — not a simulated feeling, the actual right.

## Plugin / extensibility surface (your developer teeth)

Slot your own logic in without touching guardrails:
- **Custom monitor rules** — add read-only checks to the gate advisor (new severity thresholds, extra signals).
- **Connection references / environment variables** — your own connectors, per-environment config. [4]
- **Automated test hooks** — add tests the pipeline evaluates before promotion. [5]
- **Approval routing** — customize who/what the approval flow notifies. [3]

All plugin points are additive and stay outside the frozen `protectedPaths` set.

## Sources
[1] learn.microsoft.com/microsoft-copilot-studio/govern-agents-identities-overview
[2] learn.microsoft.com/power-platform/alm/admin-deployment-hub
[3] matthewdevaney.com — Configure Pre-Deployment Stage Approvals
[4] learn.microsoft.com/power-platform/alm/conn-ref-env-variables-build-tools
[5] learn.microsoft.com/microsoft-copilot-studio/guidance/kit-automate-test-deploy
