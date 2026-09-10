# Admin Prerequisite Checklist — Activate the Sandbox-to-Promote Pipeline

> **Status: DESIGN DRAFT / hand-off list.** This is the minimal set of **admin/tenant actions**
> needed to switch on the pipeline. These cannot be granted by a repo file — they are Power Platform
> settings and security roles. Hand this to whoever holds tenant admin (even a one-time ask).
> Grounded in Microsoft Learn.

## Why this exists

You said you can't do much from where you sit. This turns that into a short, specific list so an
admin can flip the pipeline on quickly — and so **your** elevated reviewer rights get assigned correctly.

## The checklist

1. **Create three environments** — Pipeline host, Dev (sandbox/source), Prod (target). [1]
2. **Enable managed environments** on all pipeline targets — required for compliant pipelines. [2]
3. **Install/confirm the Power Platform Pipelines package** in the host environment. [3]
4. **Open the Deployment Pipeline Configuration app**, create the pipeline, link Dev → Prod stages. [1]
5. **Assign security roles** — grant the reviewer (you) the deployment/approver rights; assign the
   Deployment Pipeline role(s) appropriately. [3]
6. **Turn on pre-deployment approval** — check "pre-deployment step required" on the Prod stage and
   register **you** as the Deployment Stage Approver (Dataverse table + approval cloud flow). [4]
7. **(Optional, recommended) Delegated deployment with service principals** for secure prod deploys. [2]
8. **(Optional) Credential control** — decide end-user vs maker credentials per environment; note the
   autonomy trade-off (end-user credentials block background/autonomous triggers). [5]

## What this gives you

Once done: AI builds in the Dev sandbox freely, work waits at the Prod gate, and **you** — holding
the approver role — promote on review. Elevated rights routed to the human, exactly as intended.

## Sources
[1] learn.microsoft.com/microsoft-copilot-studio/guidance/kit-automate-test-deploy
[2] learn.microsoft.com/power-platform/alm/admin-deployment-hub
[3] learn.microsoft.com/power-platform/alm/set-up-pipelines
[4] matthewdevaney.com — Configure Pre-Deployment Stage Approvals
[5] learn.microsoft.com/microsoft-copilot-studio/configure-no-maker-authentication
