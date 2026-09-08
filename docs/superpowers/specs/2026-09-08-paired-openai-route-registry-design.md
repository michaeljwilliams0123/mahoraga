# Paired OpenAI Route Registry Design

**Status:** Approved architecture, implementation not started

**Authoritative base:** `dbd7f0b43dd98ee1023c452196fde2821100c22c`

## Purpose

Mahoraga currently has one authoritative GitHub repository and a shared OpenAI GitHub App transport, but two independently authenticated OpenAI/Codex users can reach that same repository with equivalent GitHub authority. GitHub can identify the shared OpenAI application actor and repository event, but repository metadata does not expose the upstream consumer OpenAI account that caused a given action. Mahoraga therefore needs to stop treating the shared GitHub actor as executor identity and instead bind execution identity to account-side signed evidence.

This design introduces a **Paired OpenAI Route Registry** as a non-secret identity catalog and evidence adapter. It does not become a second routing authority. The existing Universal Capability Graph and delegated-work fabric remain the only runtime routing projection; a paired route is admitted into that graph only when its existing trust/readiness contracts prove the route is live.

The immediate goal is to distinguish and safely route between:

- `openai-primary` — Mike's independently authenticated OpenAI/Codex lane.
- `openai-destiny` — Destiny's independently authenticated OpenAI/Codex lane.

Both may share the same GitHub repository, owner identity, and OpenAI GitHub App transport. They must never be distinguished merely by GitHub username, bot login, or repository permissions.

## Observed current state

At the authoritative base:

- `main` is `dbd7f0b43dd98ee1023c452196fde2821100c22c`.
- `src/codex-connection-identity.mjs` already fingerprints Codex account, Codex installation, and Codex environment identifiers and can bind them to a Codex cloud task and receipt-key fingerprint.
- `scripts/bootstrap-destiny-codex.mjs` already derives a Destiny binding from account-side Codex state, emits signed readiness, and writes private route state outside Git.
- `scripts/destiny-codex-github-bridge.mjs` already verifies the current account fingerprint and route-v2 environment fingerprint before a cloud submission.
- `src/destiny-trigger-trust.mjs` already supports Ed25519 `signed-receipt` trust with canonical signatures, readiness freshness, zero-credit eligibility, correlation checks, monotonic receipt lifecycle, and replay rejection.
- `config/destiny-trigger-trust.json` intentionally remains `receiptTrust.mode = "unconfigured"`, so the Destiny route is not yet admitted as live trust.
- `src/destiny-github-task.mjs` contains both the issue-based `MAHORAGA_DESTINY_TASK_V1` Codex task contract and the pull-request-based `MAHORAGA_DESTINY_WORK_V1` Work event contract.
- The repository's current GitHub validation workflow wakes on qualifying pull-request events, not on the issue task created as #244.
- The Universal Capability Graph separates declared capabilities from routable live evidence and is already the correct place to expose a proven OpenAI route later.

## External platform constraint

OpenAI's GitHub integration is authorized per connected user/account, and event-triggered Work tasks are created in the recipient's own ChatGPT account using that recipient's own GitHub connection. Sharing a task does not transfer the sender's GitHub connection or credentials. This means Mike's and Destiny's OpenAI-side connections can be distinct even when both authorize the same GitHub account and repository.

GitHub, however, primarily observes the GitHub App installation/event actor. When two OpenAI users use the same GitHub account and the same repository installation, repository-visible actor metadata is not sufficient evidence of which OpenAI account executed the work. Mahoraga must therefore treat the GitHub App actor as **transport identity**, not **executor identity**.

## Design principles

1. **GitHub remains authority.** Code, task ledgers, candidate branches, receipts, and exact-head verification remain visible through the authoritative repository.
2. **OpenAI account identity is proven account-side.** GitHub bot identity alone never proves Mike or Destiny.
3. **No raw account identity enters Git.** Raw OpenAI account IDs, Codex installation IDs, environment IDs, OAuth material, tokens, credentials, private keys, and chat content remain outside the repository.
4. **Signed route identity is stronger than shared actor identity.** An execution counts as Destiny only when Destiny's bound receipt key signs a receipt whose account/environment fingerprints match Destiny's private route binding.
5. **Fail closed on cross-lane execution.** If Mike's Codex accidentally consumes a Destiny task, the result is rejected rather than silently accepted under shared GitHub authority.
6. **No paid connectivity probes.** Readiness and pairing checks must be deterministic or explicitly known to be zero-credit before any model-backed work is admitted.
7. **No second routing authority.** The route registry supplies identity/evidence. The Universal Capability Graph and delegated-work planner decide whether a route is usable.
8. **No custom GitHub App in v1.** A second App may later improve UI-visible provenance, but it is unnecessary for the first strong identity boundary and adds credential lifecycle without solving OpenAI-account wake-up by itself.

## Identity model

Mahoraga distinguishes four identity layers:

### 1. Transport identity

Repository-observable GitHub metadata such as:

- GitHub App slug / App ID,
- event type,
- repository,
- sender login / numeric sender ID,
- GitHub installation ID where the event payload exposes one,
- delivery/event identifier where available.

Transport identity answers: **which GitHub integration carried the event?**

It does not answer: **which OpenAI user executed the task?**

### 2. Route identity

A stable Mahoraga route ID:

- `openai-primary`
- `openai-destiny`

The route ID is repository-safe metadata. It names a logical execution lane and does not encode credentials or personal identifiers.

### 3. Account-side binding identity

Private, non-Git state already modeled by the Destiny bootstrap:

- `codexAccountFingerprint`
- `codexInstallationFingerprint`
- `codexEnvironmentFingerprint`
- `receiptKeyFingerprint`
- bound environment ID in private route state

These values are derived on the authenticated executor side. Raw identifiers never enter Git.

### 4. Signed execution identity

A canonical Ed25519 receipt signed by the route's private receipt key and verifiable by the route's admitted public-key fingerprint.

The receipt binds the logical route and immutable repository/task correlation. This is the authoritative evidence that a specific paired route answered the task.

## Paired route registry

Create a new non-secret registry module and checked-in manifest whose sole purpose is to describe allowed logical OpenAI routes and their evidence requirements.

The manifest is **not** allowed to assert that a route is live. It may only declare route metadata and the public trust material required to verify a live observation.

Conceptual schema:

```json
{
  "schemaVersion": 1,
  "kind": "openai-route-registry",
  "repository": "michaeljwilliams0123/mahoraga",
  "transport": {
    "githubAppSlug": "chatgpt-codex-connector",
    "githubAppId": 1144995
  },
  "routes": [
    {
      "routeId": "openai-primary",
      "executorLane": "primary-cloud-codex",
      "receiptTrustMode": "signed-receipt",
      "bindingState": "unconfigured"
    },
    {
      "routeId": "openai-destiny",
      "executorLane": "destiny-codex",
      "receiptTrustMode": "signed-receipt",
      "bindingState": "unconfigured"
    }
  ]
}
```

When a route is legitimately paired, a reviewed manifest update may replace `bindingState: "unconfigured"` with a bounded public trust record containing the Ed25519 public-key fingerprint and key ID. The manifest still does not store raw account, installation, or environment identifiers.

A route with `bindingState: "unconfigured"`, missing public trust, stale readiness, account/environment mismatch, invalid signature, or zero-credit ineligibility is not routable.

## Private paired-route state

Authenticated executor-side state remains outside Git under Mahoraga's local/private state root. For each paired route, private state contains:

```json
{
  "schemaVersion": 1,
  "kind": "openai-private-route-binding",
  "routeId": "openai-destiny",
  "repository": "michaeljwilliams0123/mahoraga",
  "codexAccountFingerprint": "<sha256>",
  "codexInstallationFingerprint": "<sha256>",
  "codexEnvironmentFingerprint": "<sha256>",
  "receiptKeyFingerprint": "<sha256>",
  "boundAt": "<timestamp>"
}
```

The actual implementation must use validated values produced by the existing Codex binding helpers; this example defines the shape, not literal runtime values.

The private binding is the reference used to reject cross-account or cross-environment execution. A GitHub actor match without this private binding match is insufficient.

## Pairing handshake

The first pairing of a route is a one-time cryptographic enrollment, not an ongoing manual handoff.

### Pairing input

A bounded GitHub wake object contains:

- route ID,
- repository,
- exact current `main` SHA,
- immutable task/envelope digest,
- one-use pairing nonce,
- `implementationOnly: true`,
- `codeReview: false`,
- `attempts: 1`.

No prompt content beyond the bounded repository objective is persisted in route health metadata.

### Account-side response

The authenticated target lane:

1. confirms its current OpenAI/Codex account fingerprint;
2. confirms its Codex installation fingerprint;
3. confirms its selected environment fingerprint;
4. creates or reuses the lane's Ed25519 receipt key;
5. signs a pairing receipt containing route ID, repository, exact base SHA, task digest, pairing nonce, the three identity fingerprints, receipt-key fingerprint, and timestamp;
6. returns only the signed content-free receipt and public key needed for verification.

### Admission

Mahoraga verifies:

- exact route ID,
- exact repository,
- exact base SHA and task digest,
- nonce freshness and one-time use,
- canonical signature,
- public-key fingerprint,
- private account/installation/environment binding consistency,
- zero-credit readiness policy.

Only after those checks may the repository trust manifest be intentionally promoted from unconfigured to the route's public signed-receipt trust.

Pairing does not grant merge authority and does not bypass exact-head verification.

## Wake path

### Durable task ledger

Issues may remain the durable objective/task ledger. Issue #244 is an example of a bounded objective record. Creating an issue alone is not treated as proof that an external OpenAI account was awakened.

### Native wake surface

For the current architecture, **pull-request activity is the native account wake surface** because the repository already has a pull-request event contract and OpenAI supports account-persistent Work tasks triggered by connected GitHub PR activity.

A wake PR must be owner-authored or otherwise use a repository event class that the current delivery matrix explicitly admits. It must bind:

- route ID,
- exact `main` SHA observed before creation,
- source issue/task ID,
- immutable task digest,
- one attempt,
- implementation-only policy,
- code-review disabled.

The wake PR is a transport object, not the implementation candidate. It should contain only the minimum machine envelope/receipt scaffolding required by the event contract.

### Why not issue-created wake in v1

The current repository workflow and existing event-trigger contract are pull-request-centric. Adding a second issue-event wake mechanism before proving the existing PR path would duplicate event semantics and increase ambiguity. V1 therefore reuses the existing PR event path and keeps issues as ledgers.

## Signed route receipt

A paired-route execution receipt extends the existing signed-receipt trust concept with route and binding correlation.

Required fields:

```json
{
  "schemaVersion": 1,
  "kind": "openai-route-result",
  "routeId": "openai-destiny",
  "repository": "michaeljwilliams0123/mahoraga",
  "sourceTaskId": "dct-...",
  "taskDigest": "<sha256>",
  "baseSha": "<40-hex>",
  "candidateHeadSha": "<40-hex-or-null-for-no-code-result>",
  "codexAccountFingerprint": "<sha256>",
  "codexInstallationFingerprint": "<sha256>",
  "codexEnvironmentFingerprint": "<sha256>",
  "receiptKeyFingerprint": "<sha256>",
  "status": "completed",
  "observedAt": "<timestamp>",
  "signature": "<canonical-ed25519-signature>"
}
```

The canonical implementation may split lifecycle receipts (`acked`, `running`, `result`) from the final route-result shape, but every accepted terminal result must bind the same immutable route/task/base correlation.

The receipt must never contain model output, chat content, OAuth material, raw OpenAI account IDs, raw installation IDs, raw environment IDs, or private keys.

## Cross-lane rejection

Before accepting a result for `openai-destiny`, Mahoraga must compare the signed receipt against Destiny's admitted route:

- signer/public-key fingerprint must match Destiny trust;
- account fingerprint must match Destiny private binding;
- installation fingerprint must match Destiny private binding;
- environment fingerprint must match Destiny private binding;
- route ID must equal `openai-destiny`;
- task/base correlation must match exactly.

If Mike's account receives the task and signs it with the primary key, the Destiny verifier rejects it even if:

- the same GitHub username authored the repository action,
- the same `chatgpt-codex-connector` App transported it,
- the same repository permissions were available,
- the implementation itself is valid.

The work can be retried only through a new explicitly admitted task attempt; Mahoraga does not silently reclassify it as Destiny work.

## Transport fingerprint probe

Before assuming GitHub exposes no useful distinction, implementation should add a deterministic, zero-model transport observation function for supported GitHub event payloads.

It may capture only bounded non-secret fields such as:

- GitHub App slug and App ID,
- installation ID when present in the event payload,
- sender login and numeric sender ID,
- event/action type,
- repository ID,
- PR/issue number,
- GitHub delivery/event identifier when available.

The observation is hashed/canonicalized and used diagnostically.

If Mike-originated and Destiny-originated events unexpectedly expose distinct installation IDs or another stable GitHub-visible discriminator, Mahoraga may use that value as an additional transport signal. It must remain **supplemental**; signed account-side route identity is still required because transport configuration can be reinstalled or changed independently of the OpenAI account.

If the values are identical, that result formally confirms the shared-transport hypothesis without consuming model credits.

## Capability-graph integration

The Paired OpenAI Route Registry does not directly route tasks.

A new projection adapter produces bounded live capability routes only after trust/readiness passes. A route projection includes:

- `workerId`: `openai-primary` or `openai-destiny`,
- execution plane,
- capability set,
- routability,
- evidence level,
- routing reason,
- cost class,
- workload/availability metadata,
- no prompts, responses, credentials, raw account identifiers, or private route state.

The existing Universal Capability Graph then decides whether that worker can satisfy an objective. Declaring a route in the registry does not make it routable.

This preserves the Level 8 rule: **declaration is not liveness**.

## Economic routing interaction

The future resource-meter/economic-router layer may rank `openai-primary` and `openai-destiny` separately because they have distinct account capacity and health. This design supplies the identity needed for that ranking but does not implement credit accounting itself.

Default economic policy remains:

1. reusable evidence/cache;
2. deterministic repository/native tools;
3. local/zero-credit workers;
4. external zero-cost capacity;
5. included licensed AI only when justified;
6. metered fallback locked unless separately authorized.

A paired OpenAI route being healthy does not make it the default route.

## Code-review suppression

`codeReview: false` remains mandatory for Destiny implementation tasks. Route pairing does not enable Codex code review, automatic PR reviews, or review comments.

Repository-owned task and workflow logic must reject any paired-route task that requests review authority. Externally generated `chatgpt-codex-connector` review comments are non-authoritative and cannot satisfy readiness, receipt, verification, or merge evidence.

Account-side Automatic Review settings remain external provider controls and should be disabled where accessible, but repository correctness must not depend on that UI setting staying disabled.

## Error handling and lifecycle

Required fail-closed states include:

- `route-unconfigured`
- `readiness-missing`
- `readiness-stale`
- `transport-unrecognized`
- `signature-invalid`
- `public-key-mismatch`
- `account-binding-mismatch`
- `installation-binding-mismatch`
- `environment-binding-mismatch`
- `route-mismatch`
- `task-digest-mismatch`
- `base-head-mismatch`
- `pairing-nonce-replay`
- `submission-in-progress`
- `submission-conflict`
- `cross-lane-result`
- `zero-credit-not-eligible`

A failure must not fall through to another OpenAI account automatically. Economic routing may choose another worker only by issuing a separate, explicitly correlated assignment through the normal delegated-work planner.

## Submission durability

The current Destiny GitHub bridge writes its submitted-task ledger after the Codex cloud command returns, so a crash between external submission and ledger persistence can create uncertainty. Implementation must harden this boundary before the paired route is considered reliable.

The durable submission state machine is:

`pending -> submitting -> submitted | failed-closed`

The ledger key binds both `taskId` and immutable task digest. Conflicting reuse of a task ID with a different digest fails. A process restart observing `submitting` must not spend another attempt automatically; it reports an indeterminate submission requiring deterministic reconciliation against the account's cloud task list.

Writes must be atomic and exclusive enough to reject concurrent duplicate submissions on one bound route.

## Repository/head locking

Every wake, candidate, receipt, review decision, and merge decision is bound to an exact repository SHA.

Before creating a wake PR or implementation branch:

`observed main HEAD == expected base HEAD`

Before inspecting or integrating a candidate:

`observed candidate HEAD == expected candidate HEAD`

If either value changes, prior admission/review evidence is stale and the operation stops. No force update or implicit rebase is allowed.

## Verification

Implementation uses test-first development.

Focused tests must prove at least:

1. shared GitHub transport cannot satisfy executor identity by itself;
2. two route IDs with distinct signed keys remain distinguishable even with identical GitHub actor metadata;
3. a primary-signed result is rejected for Destiny;
4. a Destiny-signed result is rejected for primary;
5. account, installation, and environment drift each fail independently;
6. task digest/base SHA mismatch fails;
7. pairing nonce replay fails;
8. unconfigured route is not routable;
9. stale or non-zero-credit readiness is not routable;
10. transport fingerprint capture remains content-free and deterministic;
11. concurrent/indeterminate submission does not spend another attempt automatically;
12. capability graph exposes only a verified route and never gains liveness from registry declaration alone;
13. `codeReview: true` is rejected;
14. external Codex review comments cannot become route evidence.

Full `npm run verify` must pass on the exact candidate head on Ubuntu and Windows before merge. No Codex review is requested or used as completion evidence.

## Implementation boundaries

In scope:

- route identity manifest/validator;
- account-side signed pairing/result evidence using existing Ed25519 trust helpers;
- deterministic transport observation;
- route readiness projection into the existing capability graph;
- crash-safe/digest-bound Destiny cloud submission state;
- tests and current architecture documentation;
- one bounded wake-path proof using the existing PR event lane once the route prerequisites exist.

Out of scope for v1:

- creating a new GitHub user;
- creating a custom GitHub App merely to distinguish UI actors;
- copying or transferring ChatGPT/Codex credentials or subscription credits;
- reading Destiny's conversations;
- bypassing provider authentication boundaries;
- enabling Codex code review;
- broad changes to twin federation, model admission, Cloudflare relay, or UI;
- automatic paid fallback;
- direct writes to `main`.

## Rollout

### Phase 1 — contract and deterministic identity tests

Add the registry, validators, transport observation, route receipt contract, and cross-lane tests. Keep both routes unconfigured/routing-disabled unless existing live evidence already satisfies the new contract.

### Phase 2 — primary lane observation

Use Mike's already accessible environment only to validate that private binding and transport-observation logic work without exposing raw identifiers. This phase must not pretend to establish Destiny identity.

### Phase 3 — Destiny pairing admission

When a genuine Destiny account-side signed observation appears through an already authorized lane, verify it and update only the public trust material required to admit `openai-destiny`. No additional text-message handoff is required by the repository protocol.

If no Destiny account-side signed observation can be produced from the existing platform surfaces, the route remains `unconfigured`; Mahoraga reports the missing external wake capability explicitly rather than assigning the task to Mike.

### Phase 4 — capability projection and bounded live task

Expose the verified route to the Universal Capability Graph, create one exact-head bounded wake task, verify the signed result belongs to the intended lane, then subject any candidate implementation to the normal exact-head Ubuntu/Windows gates.

## Success criteria

The design is successful when:

1. Mahoraga can represent Mike and Destiny as separate OpenAI logical routes without storing raw account identity in Git.
2. A shared `chatgpt-codex-connector` GitHub actor is never accepted as sufficient executor identity.
3. A signed Destiny result cannot be produced by or substituted with Mike's paired route without deterministic rejection.
4. GitHub-visible transport metadata is captured and compared where available, but remains supplemental to signed account-side identity.
5. Destiny can be awakened through the existing account-specific PR event path without another out-of-band text-message handoff once that external Work/Codex trigger is genuinely enrolled.
6. A route with missing/stale/unconfigured evidence is absent from the routable capability graph.
7. No automatic cross-account fallback occurs.
8. No Codex review is consumed by repository policy.
9. Exact-head repository verification remains the merge gate.
10. The architecture remains compatible with future smart-meter/economic routing, which can treat each paired account as independently scarce capacity.

## Self-review

- No raw account, installation, environment, token, credential, or private-key value is required in Git.
- The registry is identity/evidence metadata only and does not duplicate the Universal Capability Graph's routing authority.
- The design reuses the existing Destiny signed-receipt, binding, Work-event, task-envelope, and Level 8 capability contracts instead of creating parallel replacements.
- The wake path is intentionally PR-first because that is the existing repository and provider-supported event surface.
- Custom GitHub Apps are deferred until they provide value beyond cryptographic account-side identity.
- The design contains no placeholder implementation decisions required for v1; unknown real-world Destiny binding values remain runtime enrollment data, not specification placeholders.
