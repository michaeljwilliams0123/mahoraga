# Architecture Guidance — Future Tracks (Design Notes, Not Committed Capability)

> These are **design notes for separately-reviewed future PRs**. Nothing here is wired.
> No secrets appear in Git under any of these patterns.

## Track A — Provisioning a Copilot Studio agent from an external trigger (no auto-deploy)

The Microsoft-aligned mechanism is **Power Platform ALM**, not a raw "create agent" call:

- Agents travel between environments inside a **solution** (the unit of deployment), moving
  **Dev → Test → Prod** in one direction only.
- Promotion happens through **Power Platform pipelines**, which can **require approvals before a
  deployment proceeds to the next stage** — this is the human gate we want.
- Environment-specific values use **environment variables**; per-environment credentials use
  **connection references**, so credentials are bound per environment and never hardcoded.

**Safe pattern:** an inbound `agent-provision-request` envelope opens a **PR for owner approval**;
approval triggers a pipeline promotion with its own approval gate. **No auto-deploy.**

**First verification step:** confirm a Dev/Test/Prod environment set and a pipeline with an
approval gate exist before designing any trigger.

## Track B — Connecting a Copilot Studio agent to Microsoft Teams

Key facts that shape the design:

- The agent must be **published at least once** before it can be used in Teams/M365.
- **Org-wide** distribution (the "Built for your org" store section) requires **admin approval** —
  a maker submits, an **admin approves**. Maker-only paths (direct install / "Built with Power
  Platform") are limited in reach.
- The org must **allow Power Platform apps in Teams**; that is a **Teams admin** setting.
- Copilot Studio **automatically manages the agent identity** (Entra Agent ID); makers **cannot
  bring their own** app registration, and **no one — including tenant admins — can mint tokens**
  for that identity. This is why we do **not** try to hold agent credentials ourselves.
- Connector scopes on the agent identity are **connector-level**, not raw `Mail.Read`-style
  Graph permissions, and **Conditional Access is enforced at runtime only in the Teams channel**.

**Safe pattern:** **Teams ⇄ server-side connector (holds any Graph/tenant credentials) ⇄ GitHub
receipts.** GitHub only ever sees **content-free receipts**; no secret touches the repo.

**First verification step:** confirm whether **tenant-admin consent** and the **"allow Power
Platform apps in Teams"** setting are available to you. That answer determines whether org-wide
Teams distribution is even open before any wiring is designed.

## What stays true across both tracks
- No secrets in Git. No broadened authority folded into unrelated work. Fail-closed on unknowns.
