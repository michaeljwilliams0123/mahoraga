# GitHub → Copilot Studio: Sandbox-to-Promote Pipeline (Design)

> **Status: DESIGN DRAFT.** Nothing here deploys, grants permissions, or runs. It describes a
> gated ALM pipeline where AI works freely in a sandbox and **the human reviewer holds the promote key**.
> Grounded in Microsoft Learn (citations at end).

## The reviewer holds elevated rights — by design

The whole model routes promotion authority to **you, the human reviewer**:

- The sandbox (Dev) is where the AI systems build freely — no gate.
- Promotion Dev → Test → Prod runs through a **Power Platform pipeline** whose stages require a
  **pre-deployment approval**. The pipeline pauses until you press Approve.
- Only you (as the assigned Deployment Stage Approver) can release. The agents cannot self-promote.

This is not a restriction on you — it is the mechanism that *gives* you the elevated control.
Your rights are switched on by an admin via security roles + managed environments (see the
prerequisite checklist doc); they are not, and cannot be, granted by a file in this repo.

## Topology

| Stage | Role | Who acts |
|---|---|---|
| **Dev (sandbox)** | AI builds, iterates, self-heals — freely | AI systems (you barely in the loop) |
| **Test** | Automated validation + your optional review | Pipeline + you |
| **Prod** | Live agents | **You approve → pipeline promotes** |

Agents are carried as a **custom solution** (the solution is the carrier that moves between
environments). [1]

## Flow

1. AI designs an agent contract in the repo; coding agent implements in the **Dev sandbox**.
2. A **deployment request** is raised for the solution. [2]
3. The pipeline **pauses and runs automated tests**, evaluating results before proceeding. [2]
4. The **strengthening monitor** (separate spec) posts a read-only risk summary for your review.
5. **You approve** at the pre-deployment gate → pipeline promotes toward Prod. [3]

## Hard constraints (why this is safe to run hands-off up to the gate)

- **No self-promotion.** A configured pre-deployment approval pauses the pipeline until a human
  presses Approve. [3]
- **Agents cannot mint their own credentials.** Copilot Studio agent identities are
  Microsoft-controlled; no one in the tenant can generate their tokens. [4]
- **Managed environments required** for all pipeline targets. [5]

## Sources
[1] learn.microsoft.com/microsoft-copilot-studio/authoring-solutions-overview
[2] learn.microsoft.com/microsoft-copilot-studio/guidance/kit-automate-test-deploy
[3] matthewdevaney.com — Configure Pre-Deployment Stage Approvals
[4] learn.microsoft.com/microsoft-copilot-studio/govern-agents-identities-overview
[5] learn.microsoft.com/power-platform/alm/admin-deployment-hub
