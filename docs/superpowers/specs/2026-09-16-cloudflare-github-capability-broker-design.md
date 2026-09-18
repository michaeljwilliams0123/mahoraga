# Cloudflare GitHub Capability Broker — Design

**Status:** Owner approved on 2026-09-16; implementation plan written at `docs/superpowers/plans/2026-09-16-cloudflare-github-capability-broker.md`.

**Date:** 2026-09-16

**Baseline:** `8f521d27a8c870ce0f06e43fc0896b15859859df`

## 1. Decision

Mahoraga will add a policy-driven **Cloudflare → GitHub Capability Broker** so Cloudflare-hosted agents can perform bounded GitHub mutations without receiving permanent, unrestricted repository credentials.

Cloudflare remains the always-on coordination/control fabric. GitHub `main` remains canonical source authority. Railway remains the canonical execution core until separately superseded. The broker extends Mahoraga's existing authority model; it does not create a second authorization system.

## 2. Primary goals

The broker must let authorized Cloudflare agents dynamically perform repository work such as:

- read repository, issue, PR, check, and release state;
- create and update issues, comments, labels, and assignments;
- create branches and modify repository files;
- create, update, and close pull requests;
- rerun failed CI jobs where GitHub permissions allow it;
- merge verified pull requests when current Mahoraga authority and branch rules allow it;
- perform bounded direct writes to explicitly permitted branches and paths;
- acquire temporary elevated authority for one objective when explicitly authorized.

The system must be customizable at runtime without replacing code for every policy change.

## 3. Credential model

Use a dedicated GitHub App installed only on repositories Mahoraga is allowed to mutate.

The GitHub App private key and App ID are stored only in Cloudflare protected secret storage. Agents never receive the private key. The broker exchanges the App credential for short-lived GitHub installation tokens only when an admitted action needs one.

Installation tokens must be narrowed to the target repository and the minimum permission set required by the admitted capability. Long-lived personal access tokens are not the preferred execution path.

No GitHub credential may be committed to Git, returned to the browser, written to task/event content, or exposed to an agent prompt/model output.

## 4. Capability profiles

Policy defines reusable profiles rather than one all-or-nothing permission level.

### Observe

Read repository, branches, files, commits, PRs, issues, checks, releases, and deployment evidence.

### Operator

Includes Observe plus comments, labels, assignments, issue lifecycle actions, and permitted CI reruns.

### Builder

Includes Operator plus branch creation, bounded contents writes, commits, and PR creation/update.

### Integrator

Includes Builder plus verified merges, branch updates, review-thread resolution, and other integration actions permitted by current repository rules.

### Maintainer

Includes Integrator plus explicitly configured operational/configuration paths such as `docs/**`, `deploy/**`, `.github/**`, or other owner-approved scopes.

### Direct-write

Allows writes without a PR only to explicitly configured branch/path combinations. This is never implied by Builder or Integrator.

### Elevated session

Temporarily widens one objective's allowed actions for a bounded time window. Elevation has an expiry, objective ID, reason, allowed capabilities, repositories, branches, paths, and maximum action count. It cannot silently become permanent policy.

## 5. Runtime policy model

The canonical policy is versioned and auditable. A representative shape is:

```yaml
github_policy:
  repo: michaeljwilliams0123/mahoraga
  default_profile: builder

  allow:
    - issues.write
    - comments.write
    - labels.write
    - branches.create
    - contents.write
    - pull_requests.write
    - checks.read
    - actions.rerun
    - merges.verified

  direct_write:
    enabled: true
    branches:
      - automation/*
      - maintenance/*
    paths:
      - docs/**
      - deploy/**
      - .github/**
    main:
      mode: verified-only

  elevation:
    enabled: true
    max_minutes: 60
    max_actions: 50
    requires_owner_or_authority_decision: true
```

Policy evaluation must additionally support repository, branch, path, action, trigger source, data class, cost ceiling, verification requirement, time window, and maximum attempts/actions.

Policy may become more permissive only through an authorized policy mutation. A missing, stale, malformed, or unverifiable policy fails closed.

## 6. Authority and admission flow

Every GitHub mutation uses the following sequence:

```text
Cloudflare Agent
    ↓
GitHub Capability Request
    ↓
Mahoraga AuthorityDecision + policy evaluation
    ↓
GitHub Capability Broker
    ↓
short-lived repository-scoped installation token
    ↓
GitHub API mutation
    ↓
independent verification
    ↓
content-minimized mutation receipt
```

The agent proposes intent; the broker executes only the admitted action. Agents cannot choose broader OAuth/App scopes, alternate repositories, unrestricted paths, or a different credential source.

## 7. Mutation envelope

Every requested action is normalized into a typed envelope containing at minimum:

- objective ID;
- action ID and idempotency key;
- requested capability;
- repository;
- branch/base/head as applicable;
- bounded path set when contents may change;
- expected source SHA where applicable;
- actor/profile;
- authority decision reference;
- cost/data classification;
- expiry/deadline;
- maximum attempts;
- verification contract.

Unknown fields do not widen authority. Duplicate idempotency keys must not perform the mutation twice.

## 8. Direct-write behavior

Direct writes are customizable but intentionally narrower than PR-based work.

Default behavior:

- feature and repair work uses branches + PRs;
- automation/maintenance branches may receive direct writes when policy permits;
- `main` direct write is `verified-only` and still subject to GitHub branch/ruleset enforcement;
- broker must never bypass repository protection, required checks, or required review through credential tricks;
- if GitHub rejects the action, Mahoraga records the concrete denial and reroutes to a lawful alternative such as a PR.

`verified-only` means the mutation must carry an expected source SHA and satisfy Mahoraga's configured deterministic verification/evidence requirements before the write is attempted.

## 9. Elevated sessions

Elevation is objective-scoped, explicit, and temporary.

An elevation grant includes:

- objective ID;
- issuing authority;
- permitted profiles/capabilities;
- repository/branch/path restrictions;
- issuance and expiration timestamps;
- maximum actions;
- reason and correlation digest.

Expired grants are unusable. Elevation never suppresses GitHub's own protection rules and never authorizes secret exfiltration, credential disclosure, billing changes, or unrelated account administration unless separately defined by a different capability contract.

## 10. Receipts and auditability

Every attempted mutation emits a bounded receipt containing:

- objective/action IDs;
- repository and action type;
- target branch/path summary;
- pre-action source SHA when meaningful;
- resulting commit/PR/issue/run identifier;
- admitted profile/capability;
- installation identity fingerprint or installation ID, never token material;
- GitHub response class/status;
- verification result;
- timestamp and latency;
- retry/idempotency disposition.

Receipts contain no private key, installation token, PAT, raw model prompt, or arbitrary private repository payload.

## 11. Failure and recovery

The broker distinguishes concrete causes such as:

- `policy-denied`;
- `authority-stale`;
- `token-mint-failed`;
- `github-auth-rejected`;
- `branch-protection-denied`;
- `source-sha-mismatch`;
- `path-out-of-scope`;
- `verification-failed`;
- `rate-limited`;
- `transient-provider-error`.

Transient failures may use bounded retry/backoff. Authority, path, SHA, or protection failures are not retried blindly. The planner may reroute a denied direct write into a branch/PR flow without widening the original objective.

## 12. Cloudflare components

Use focused units rather than embedding GitHub write logic directly into the owner gateway:

- **GitHub Capability Broker Worker/module** — validates admitted envelopes, obtains scoped installation tokens, executes GitHub API actions.
- **Policy store** — versioned, integrity-checked policy document/configuration with bounded runtime overrides.
- **Secrets** — GitHub App ID/private key and any installation metadata required for token minting.
- **Objective coordinator / Workflow integration** — dispatches admitted actions and waits for receipts without holding secrets.
- **Queue integration** — optional asynchronous dispatch for non-interactive work, with idempotent messages.

The existing `mahoraga-owner-gateway` remains owner ingress and identity projection; it must not become the GitHub credential holder or general repository executor.

## 13. Security boundaries

- No unrestricted generic command execution is introduced.
- No arbitrary URL proxy is introduced.
- No agent/model receives GitHub credentials.
- No token is persisted in Git, browser storage, receipts, prompts, or normal logs.
- GitHub App installation is restricted to approved repositories.
- Permission requests are minimum-necessary per capability.
- Branch/ruleset protections remain authoritative.
- Policy and AuthorityDecision are checked before token minting, not after mutation.
- Repository mutations remain attributable to a dedicated installation identity rather than masquerading as the human owner.

## 14. Acceptance criteria

1. A Cloudflare-hosted Mahoraga agent can read the target private repo through the broker without user PAT exposure.
2. A Builder-profile agent can create a branch, write a bounded file change, and open a PR.
3. An Integrator-profile agent can merge only when required GitHub/Mahoraga verification is satisfied.
4. A forbidden path/repository/action is denied before a GitHub mutation occurs.
5. Replaying the same admitted mutation does not duplicate the external effect.
6. A short-lived installation token is minted only after admission and is never surfaced to the requesting agent.
7. Direct writes work only for configured branch/path combinations; an out-of-scope direct write falls back to an allowed PR route or fails closed.
8. `main` protection is never bypassed; GitHub's own rules remain effective.
9. An elevated session expands authority only for its objective and expires automatically.
10. Every attempt emits a content-minimized receipt sufficient to reconcile what changed and why.
11. Cloudflare outage or credential failure does not corrupt canonical GitHub state; pending work is resumable/reconcilable.
12. Existing owner gateway, Railway runtime, AuthorityDecision, zero-cost policy, and release verification remain intact.

## 15. Initial implementation tranche

The first implementation tranche should prove the smallest real vertical:

1. GitHub App installation identity and protected Cloudflare secret bindings;
2. policy parser/evaluator with Observe, Builder, and Integrator profiles;
3. short-lived installation-token minting;
4. broker actions for repository read, branch create, one bounded contents write, PR open/update, and verified merge;
5. idempotency + typed mutation receipts;
6. one live Cloudflare-agent → GitHub branch/PR round trip against `michaeljwilliams0123/mahoraga`;
7. a negative test proving direct write to an unapproved target fails closed.

Operator, Maintainer, runtime policy editing, direct-write expansion, and elevated-session UI may follow as separate independently testable tranches after the first vertical is proven.