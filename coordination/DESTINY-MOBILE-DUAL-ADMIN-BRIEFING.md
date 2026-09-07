# Destiny Mobile Dual-Administrator Handoff

Repository: `michaeljwilliams0123/mahoraga`
Last refreshed: 2026-09-07

## Use this as context, then verify live state

This briefing is the reusable mobile/ChatGPT Work handoff for Destiny's account. Before changing anything, inspect the live repository, open PRs/issues, Actions, current `main`, repository instructions, architecture/status documents, and relevant tests. Live verified GitHub state overrides stale details in this file.

## Administrator model

Mahoraga should support two independent administrator paths over the same GitHub repository:

1. Mike's ChatGPT / Work / Codex-side path.
2. Destiny's ChatGPT / Work / Codex-side path.

Both may administer the repository through their own authenticated connections. Never collapse the two OpenAI identities into a guessed shared executor. A Destiny-specific Codex task must not silently consume Mike's Codex usage, and vice versa.

GitHub is the common coordination/repository plane. ChatGPT Work is a valid primary execution surface for repository investigation, cleanup, issue/PR/file work, and other supported GitHub mutations. Use Codex only when a genuinely Codex-specific/local implementation step is needed.

## Current routing design

Preserve or improve these properties:

- account-side deterministic selection for Destiny-specific Codex execution;
- SHA-256 account/device/environment fingerprints rather than raw identifiers in GitHub;
- local Ed25519 receipt keys and signed readiness/ack evidence;
- owner-authored bounded GitHub machine tasks;
- `implementationOnly: true`, `codeReview: false`, and one-attempt binding behavior;
- a local-only private environment route for `codex cloud exec --env`;
- local deduplication of submitted task IDs;
- fail-closed behavior for missing, stale, ambiguous, or inconsistent identity evidence;
- outbound-only GitHub/OpenAI connectivity with no public inbound listener.

## Current work

- PR #181 is merged and established account/device/environment fingerprinting and signed-receipt trust primitives.
- Issue #183 remains the dormant Destiny binding probe. Opening it does not invoke Codex.
- Probe ID: `destiny-bind-pr181-20260907-a1b2c3d4`.
- Task ID: `dct-f7f65cb1ea8149db6d55ea5a`.
- The earlier #184 branch became heavily behind `main`; current hardening is being consolidated from the latest `main` rather than forcing stale branch history forward.

Re-check all of these facts before relying on them.

## Repository improvement mission

Assess the repository and make evidence-based improvements, not merely a summary. Prioritize:

- removing or consolidating obsolete, duplicated, superseded, or misleading paths after proving they are unused;
- one authoritative source of truth for architecture, status, routing, and operator instructions;
- deterministic dual-admin routing and explicit executor provenance;
- stronger idempotency, replay handling, dispatch locking, diagnostics, and crash recovery;
- strict validation of local private-route integrity;
- tests that prove account separation and fail-closed behavior;
- simpler mobile/Work handoffs and fewer unnecessary local steps;
- documentation that reflects actual repository state rather than aspirational behavior.

## Required constraints

- Do not use Codex for code review or trigger Codex review usage.
- Do not introduce an OpenAI API-key/paid Codex Action path merely to complete this work.
- Do not expose `auth.json`, tokens, API keys, raw account/install/environment IDs, or private receipt keys in GitHub or logs.
- Do not use ngrok, public tunnels, reverse proxies, or public inbound listeners.
- Do not weaken identity validation simply because repository rulesets are absent.
- Vercel is not a Mahoraga PR completion requirement; current repository verification is Ubuntu + Windows while dedicated Vercel workspace verification is frozen.
- Do not claim Destiny-specific Codex routing is proven until account-side evidence from Destiny's authenticated environment exists.

## Mobile / Work behavior

The initiating device may be Destiny's phone. Complete safe GitHub/Work-side progress even if her PC or Remote Codex host is offline. If a step genuinely needs Destiny-local state, finish everything else first and reduce the remaining local action to the smallest one-time step. Never substitute Mike's local Codex identity.

## Completion report

Report the live repo state assessed, branches/PRs/issues touched, files consolidated/removed/added, dual-admin changes, tests/checks, whether Codex execution occurred and under which verified path, whether #183 was used, whether Destiny-specific routing is actually proven, and the smallest remaining local-only action.
