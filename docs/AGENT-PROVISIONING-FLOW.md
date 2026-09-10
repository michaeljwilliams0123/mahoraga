# Agent Provisioning Flow — Design Notes (No Auto-Deploy)

> Design-only. Nothing here provisions or deploys anything. No secrets in Git.

## Principle

An external `agent-provision-request` may only ever **draft a PR** into a Dev environment path.
It never deploys to Test or Prod. Promotion is a **human-approved Power Platform pipeline** step,
consistent with Microsoft ALM guidance.

## Flow

```
request (schema-validated)
  -> fail-closed checks (autoDeploy=false, requiresApproval=true, targetStage=dev)
  -> open DRAFT PR for owner review        <-- STOP. Human gate.
  -> [owner approves + merges]
  -> Power Platform pipeline promotion       <-- pipeline's own approval gate
       Dev -> Test -> Prod (one direction)
```

## Why the gate is not optional

- Solutions move **Dev → Test → Prod in one direction**; that ordering is what protects Prod.
- Power Platform pipelines let you **require approvals before a deployment proceeds** to the next
  stage. We rely on that gate rather than inventing our own deploy authority.
- Per-environment credentials use **connection references / environment variables**, bound at
  deploy time — never committed here.

## Hard limits

- `autoDeploy` is schema-pinned to `false`. A request that sets it true is rejected.
- `targetStage` accepts only `dev`. No request can target Test or Prod directly.
- No credentials, tokens, or connection values ever appear in this repo.

## First verification step (before any wiring)

Confirm a Dev/Test/Prod environment set exists and a pipeline with an **approval gate** is
configured. Until that exists, this remains a design contract only.
