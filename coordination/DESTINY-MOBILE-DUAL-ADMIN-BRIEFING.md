# Destiny Mobile Dual-Administrator Handoff

Last refreshed: 2026-09-07
Repository: `michaeljwilliams0123/mahoraga`

## Purpose

This file is a reusable handoff brief for Destiny's ChatGPT account, especially when she opens the task from the ChatGPT mobile app and uses ChatGPT Work plus her connected GitHub access. It is context, not a substitute for live verification.

Before changing anything, re-read the live repository, open pull requests, issues, Actions runs, branches, repository instructions, and relevant tests. If this briefing conflicts with current GitHub state, current verified repository state wins.

## Administrator model

Mahoraga is intended to support two independent administrator paths over the same GitHub repository:

1. Mike's ChatGPT / Work / Codex-side administrator path.
2. Destiny's ChatGPT / Work / Codex-side administrator path.

Preserve the separation between the two OpenAI account identities while allowing both to administer the same GitHub project through their own authenticated connections. Do not collapse the identities into a single guessed actor and do not silently fall back from Destiny's account to Mike's account.

GitHub is the common coordination and repository plane. ChatGPT Work is a valid primary execution surface for repository-side investigation, cleanup, organization, issue/PR work, and supported GitHub mutations. Codex or Remote Codex may be used for implementation when useful and available, but the workflow must not depend on Codex semantics when Work can perform the task directly.

For any execution path that claims to be specifically Destiny's Codex, maintain deterministic account-side routing and provenance. The existing design uses hashed account/device/environment metadata plus locally bound Ed25519 signed receipts rather than GitHub-visible bot metadata alone.

## Verified status at this briefing refresh

- PR #181, `feat: bind Destiny Codex by account fingerprint`, is merged. Merge commit: `d6389ed8fb5cef4a18cb054db11232cbbec0d415`.
- PR #184, `feat: add deterministic GitHub-to-Destiny Codex bridge`, is open and draft at head `dcf1ca36741bd42f5723a6e01d723b5e68e7cec7` before this briefing-file commit.
- Verify Mahoraga run `34084023862` for that PR head completed successfully.
- Issue #183 remains open and dormant as the bounded Destiny binding probe.
- Probe ID: `destiny-bind-pr181-20260907-a1b2c3d4`.
- Machine task ID: `dct-f7f65cb1ea8149db6d55ea5a`.

Re-check all of the above before relying on it. Adding this briefing file advances the PR head and requires fresh verification.

## Mission

Perform a repository-wide assessment and then make evidence-based improvements. The goal is not merely to inspect the repository; improve it where justified.

Focus on:

- cleanup of obsolete, redundant, superseded, duplicated, or misleading files and instructions;
- consolidation of overlapping implementations, documentation, configuration, coordination artifacts, and workflows;
- clearer source-of-truth ownership for architecture, status, policy, task routing, and operational instructions;
- stronger module boundaries and naming consistency;
- simpler operator and mobile handoffs;
- removal of dead paths after proving they are unused or superseded;
- reduction of split-brain behavior between old and current Mahoraga architectures;
- deterministic task routing and administrator provenance;
- better idempotency, deduplication, retry boundaries, failure diagnostics, and recovery behavior;
- better tests for dual-administrator and account-routing behavior;
- documentation that reflects what actually exists in the repository rather than aspirational state;
- elimination of unnecessary manual steps where GitHub/Work can safely do the work directly;
- preservation of local-first/outbound-only architecture where local execution is required.

Treat "review the repository" here as architectural and implementation assessment. Do not invoke Codex code-review workflows.

## Dual-administrator requirements

Enhancements should move Mahoraga toward the following operating model:

- Mike and Destiny each retain an independent authenticated administrator path.
- Either administrator can use ChatGPT Work with their own connected GitHub access for repository-side administration.
- Work should be able to inspect current state, manage bounded multi-step tasks, update issues/PRs/files when permitted, and coordinate implementation without requiring the other administrator to be online.
- When Codex execution is specifically requested, the intended OpenAI account must be selected deterministically rather than inferred from the shared GitHub identity.
- A task intended for Destiny must never silently consume Mike's Codex usage, and vice versa.
- GitHub author identity is authorization/coordination evidence, not proof of which OpenAI account executed a Codex task.
- Executor provenance should be explicit in receipts/results wherever practical.
- Repeated delivery of the same machine task should be idempotent and should not consume duplicate Codex tasks.
- Bound account fingerprints must be revalidated before account-specific post-binding dispatches.
- Trust should fail closed when identity evidence is missing, ambiguous, stale, or inconsistent.
- Work-only repository tasks do not need to pretend to be Codex tasks; use the least complicated authenticated execution surface that can safely accomplish the work.

## Existing Destiny routing design to preserve or improve

The current architecture established by the #181/#184 work includes or proposes:

- SHA-256 fingerprinting of the ChatGPT/Codex account identifier rather than storing the raw identifier;
- local installation/device fingerprinting;
- environment fingerprinting as supporting routing metadata;
- local Ed25519 receipt keys and signed readiness/ack evidence;
- `signed-receipt` trust integration;
- exact/unique Codex task correlation and `cd_*` task reference validation;
- a local private route that retains the raw Codex environment ID only where required for local `codex cloud exec --env`;
- owner-authored bounded GitHub machine tasks;
- `implementationOnly: true`, `codeReview: false`, and a single-attempt default for the binding path;
- local task deduplication;
- outbound-only GitHub/OpenAI connectivity, with no inbound public listener.

Do not discard these controls casually. Simplify or replace them only when the new approach demonstrably preserves or improves deterministic identity, provenance, privacy, and reliability.

## Cleanup rules

When cleaning or consolidating:

- inspect references/usages before deleting files, directories, branches, scripts, workflows, or configuration;
- distinguish superseded artifacts from active compatibility layers;
- prefer one authoritative implementation over parallel copies;
- preserve useful history in Git rather than keeping dead duplicate files solely as an archive;
- do not delete active branches or open-PR branches;
- do not modify unrelated production behavior merely to make the tree look cleaner;
- update documentation and tests in the same change when source-of-truth behavior moves;
- break large changes into coherent commits/PRs when that improves verification and reversibility.

## Required constraints

- Do not use Codex for code review.
- Do not request or trigger Codex review activity that consumes Codex credits.
- Do not introduce OpenAI API-key / paid API Codex activation merely to complete this work.
- Do not expose `auth.json`, access tokens, API keys, raw ChatGPT/Codex account IDs, installation IDs, raw environment IDs, private receipt keys, or other secrets in GitHub, comments, logs, or generated documentation.
- Do not use ngrok, public tunnels, reverse proxies, or public inbound listeners for the Destiny/Mike bridge.
- Do not weaken branch protections, repository security controls, or identity validation merely to make automation easier.
- Do not treat Vercel as a Mahoraga PR completion requirement. Existing Vercel checks may be observed, but Vercel quota/failure alone must not trigger unrelated code fixes or block otherwise valid Mahoraga completion.
- Do not guess actor identity when evidence is ambiguous.

## Execution approach

1. Confirm the account is Destiny's ChatGPT account and use her connected GitHub/Work permissions for this task.
2. Fetch this repository and re-establish current state from GitHub.
3. Read relevant repository-level agent/instruction files before modifying code.
4. Inspect #181, #184, #183, recent commits, open PRs/issues, workflows, current architecture/status docs, and tests.
5. Build a concise map of duplicate/superseded/unclear areas and prioritize high-value cleanup and enhancements.
6. Implement the improvements using the connected GitHub and Work capabilities. Use a feature branch/PR when appropriate. Continue #184 if it is still the correct vehicle; otherwise use the current correct branch/PR rather than forcing stale assumptions.
7. Add or update tests for behavior changed.
8. Run or inspect the relevant verification checks. Treat fresh evidence as the basis for completion claims.
9. Consolidate documentation so future ChatGPT Work sessions can discover the authoritative architecture and administrator-routing contract without relying on chat history.
10. Report what was changed, what was removed/consolidated, verification results, current dual-admin status, and any truly unavoidable one-time local action.

## Mobile / Work behavior

The initiating device may be Destiny's cell phone. That is acceptable. Use ChatGPT Work and connected GitHub capabilities as the primary repository-management plane. Do not block repository-side progress merely because her PC or a Remote Codex host is offline.

If a particular step genuinely requires local Codex state from Destiny's PC (for example the local private route, account fingerprint bootstrap, or receipt private key), complete every safe GitHub/Work-side task first and identify only that local step as pending. Never substitute Mike's local Codex identity for the unavailable Destiny identity.

## Completion standard

A strong result should leave Mahoraga simpler and more coherent than before, with fewer overlapping sources of truth, clearer current-state documentation, stronger deterministic dual-administrator routing, appropriate tests, and a practical mobile-first path for Destiny to administer the project with capabilities comparable to Mike's repository-side administrator workflow.

The final report should explicitly state:

- live repository state assessed;
- branches/PRs/issues touched;
- files or paths consolidated/removed/added;
- dual-admin connection changes;
- tests and checks used as verification;
- whether any Codex execution occurred and under which verified administrator path;
- whether issue #183 was used;
- whether Destiny-specific deterministic Codex routing is proven or still pending local evidence;
- any remaining local-only action, reduced to the smallest practical step.
