# Cloudflare-Native `assistant.respond` Design

**Date:** 2026-09-22  
**Status:** Approved design, implementation not started  
**Base:** `main` at `16ce13354a73479eeabd1f1b3d4e9c2615e4daf6`  
**Primary objective:** Make `assistant.respond` genuinely routable from the Cloudflare execution runtime while preserving Mahoraga's existing zero-credit and one-turn licensed-admission semantics.

## 1. Context

PR #717 moved the browser bridge and owner-authenticated control surface onto Cloudflare. The owner gateway now intercepts `/`, `/api/runtime/pages-bridge/frame`, `/api/runtime/pages-bridge/action`, and `/api/runtime/pages-bridge/artifacts` before the legacy Railway proxy. The current capability response intentionally advertises:

```text
assistant.respond
routable: false
enabled: false
provider: cloudflare-native
providerReasonCode: cloudflare-native-provider-pending
```

This is the correct fail-closed state: Cloudflare transport and authentication can be healthy without claiming that a cognition provider is available.

The remaining blocker is to turn that placeholder into evidence-backed runtime capability state and execute one real conversational turn without using Railway as a normal-path dependency.

## 2. Goals

1. Route `assistant.respond` through the Cloudflare execution runtime.
2. Keep Cloudflare Access and the owner gateway responsible only for identity and transport.
3. Preserve exact-SHA admission, idempotency, lease protection, and replay semantics in the execution Durable Object.
4. Preserve the existing credit policy:
   - `zero-codex` first;
   - no automatic metered or licensed fallback;
   - `licensed-approved` only after explicit owner action and only for one `assistant.respond` turn.
5. Persist conversation/task/provider state durably in Cloudflare.
6. Keep plaintext prompt/answer content out of ordinary operational receipt rows.
7. Make capability readiness evidence-driven rather than hard-coded.
8. Keep Railway out of the normal chat path. Railway remains rollback-only infrastructure.

## 3. Non-goals

This tranche does not:

- move repository/build/browser/desktop capabilities into Cloudflare;
- create a new UI or expand the Pages surface;
- reinterpret Cloudflare authentication as cognition readiness;
- make `licensed-approved` authorize actions other than `assistant.respond`;
- use Railway as a required upstream for browser chat;
- silently treat free-tier quota as proof of hard-zero billing;
- expose provider credentials, prompts, responses, or secrets in GitHub receipts or logs.

## 4. Target architecture

```text
GitHub Pages
   |
   v
Cloudflare Access
   |
   v
Mahoraga Owner Gateway
   |  authenticated native bridge
   v
Cloudflare Execution Runtime
   |
   +--> policy / provider selector
   |       |
   |       +--> verified zero-credit provider
   |       |
   |       +--> explicit one-turn licensed provider
   |
   +--> Durable Object state
           |
           +--> conversations / turns / provider state
           +--> leases / idempotency / receipts
           +--> encrypted content vault records
```

### Responsibility boundaries

**GitHub Pages**
- presentation only;
- no credentials;
- no execution authority.

**Cloudflare Access**
- owner identity and session protection only;
- does not imply provider readiness.

**Owner gateway**
- authenticates the owner through Access;
- exposes the native Pages bridge;
- forwards approved bridge actions to the execution runtime;
- projects runtime capability evidence back to the UI;
- does not contain model-selection logic.

**Execution runtime**
- owns `assistant.respond` admission;
- owns provider selection;
- owns provider health/canary evidence;
- owns execution, replay, idempotency, lease control, and state persistence.

## 5. Provider contract

Cloudflare-native provider implementations conform to a small runtime contract rather than embedding provider-specific logic throughout the Worker.

Conceptually:

```ts
interface AssistantProvider {
  id: string;
  costClass: "cloud-open-weight" | "local-model" | "licensed-cloud" | "metered-cloud";
  probe(context): Promise<ProviderProbe>;
  executeAssistantTurn(request, context): Promise<AssistantTurnResult>;
}
```

`ProviderProbe` must include enough evidence for Mahoraga to distinguish:

- provider availability;
- model identity;
- cost class;
- zero-credit eligibility;
- billing-state evidence;
- canary freshness;
- failure reason;
- observed/verified timestamps.

`AssistantTurnResult` must include:

- verified answer;
- bounded usage metadata;
- selected provider ID;
- cost class;
- admission mode;
- receipt metadata;
- no raw credential material.

## 6. Credit and authority policy

### 6.1 `zero-codex`

The default browser request remains `zero-codex`.

A provider is eligible only when all required evidence is present and fresh. Existing Mahoraga semantics are preserved:

- `metered === false`;
- `priceUsd === 0`;
- `spendUsd === 0`;
- `billingState === "verified-zero"` or another explicitly permitted zero-cost state;
- `zeroDollarStopGuaranteed === true`;
- provider ready;
- fresh capability canary.

If no eligible generation provider exists, the runtime returns a specific zero-credit rejection. It must not silently fall through to a licensed or metered provider.

### 6.2 Cloudflare Workers AI

Workers AI is a candidate Cloudflare-native inference provider because it can be bound directly to a Worker with an `AI` binding.

However, free allocation alone is not sufficient evidence for Mahoraga's hard-zero policy. Workers AI may be admitted to `zero-codex` only when the deployment can prove that the current account/configuration cannot incur paid inference for this route. Otherwise it may exist as a healthy provider while remaining ineligible for zero-credit selection.

### 6.3 `licensed-approved`

`licensed-approved` remains a separate authorization path.

Rules:

1. It can be requested only after the same turn has been rejected by the zero-credit policy.
2. It applies to exactly one `assistant.respond` turn.
3. It cannot authorize Build, Ship, repository writes, browser actions, Codex Builder work, external communication, or child delegation.
4. It must name or resolve to a cloud-callable licensed provider. The existing local Codex CLI question model cannot be treated as Cloudflare-native merely because it is already classified `licensed-cloud` in the Node runtime.
5. If no licensed provider is configured, the route remains fail-closed.

## 7. Runtime request flow

### 7.1 Capability probe

The owner gateway's `capabilities` bridge action calls the execution runtime.

The execution runtime probes provider state and returns a projection such as:

```json
{
  "capability": "assistant.respond",
  "routable": true,
  "enabled": true,
  "provider": "cloudflare-workers-ai",
  "costClass": "cloud-open-weight",
  "canary": "verified",
  "evidenceLevel": "verified",
  "routingReason": null,
  "providerReasonCode": null
}
```

If provider evidence is absent or stale, `routable` remains false and a bounded reason code is returned.

### 7.2 Chat turn

1. Pages sends the normal `chat` bridge action.
2. Owner gateway verifies the Access-authenticated owner and forwards a bounded request to the execution runtime.
3. Runtime validates exact target SHA and request schema.
4. Runtime assigns/validates conversation ID, turn ID, and idempotency key.
5. Runtime loads provider state and evaluates credit/authority policy.
6. Runtime selects an eligible provider or returns a bounded rejection.
7. Runtime acquires an execution lease.
8. Runtime invokes the provider.
9. Runtime validates and bounds the provider answer.
10. Runtime persists encrypted content and operational metadata atomically.
11. Runtime stores an idempotent receipt.
12. Runtime returns the answer projection to the gateway/UI.
13. Duplicate submission of the same turn returns the persisted answer without invoking the provider again.

## 8. Durable persistence

The existing `ExecutionDurableObject` remains the first Cloudflare state authority for this tranche.

### 8.1 Operational tables

Extend the existing SQLite schema with records equivalent to:

```text
conversations
- id
- owner_id_hash
- created_at
- updated_at

turns
- id
- conversation_id
- request_digest
- response_digest
- provider_id
- cost_class
- credit_policy
- status
- content_id_user
- content_id_assistant
- created_at
- completed_at

provider_state
- provider_id
- availability
- zero_credit_eligible
- reason_code
- observed_at
- verified_at
- canary_expires_at

execution_receipts
leases
```

Existing idempotency and lease behavior remains authoritative.

### 8.2 Content vault records

Prompt and answer content should not be stored as plaintext in the operational tables.

Use encrypted content records equivalent to:

```text
conversation_content
- content_id
- conversation_id
- role
- ciphertext
- iv
- content_hash
- created_at
```

Encryption requirements:

- AES-GCM or equivalent authenticated encryption available in Workers;
- key supplied as a protected Worker secret;
- unique IV per record;
- conversation/content identity included as AAD;
- decryption failure is fail-closed;
- no key material in receipts, logs, or API responses.

Operational tables store only references, hashes, status, provider metadata, and timing.

## 9. Gateway/API surface

The native owner gateway should support at least these bridge actions without Railway:

- `capabilities`
- `chat`
- `tasks`
- `messages`
- `message-content`

Artifacts may remain unavailable until a separate bounded artifact design is approved.

Unmatched legacy routes may continue to retain the explicit Railway rollback proxy, but normal browser conversation must not depend on it.

## 10. Readiness semantics

The UI must continue to separate transport/authentication from cognition.

| Signal | Meaning |
| --- | --- |
| Pages loaded | presentation available |
| Access authenticated | owner identity established |
| bridge attached | transport available |
| execution runtime ready | Cloudflare execution state reachable |
| `assistant.respond` routable | a valid provider is admitted for the requested policy |
| all required signals | Brain may display Ready |

Authentication or bridge connectivity alone must never promote the brain to Ready.

## 11. Failure behavior

The following remain fail-closed:

- stale or mismatched target SHA;
- absent provider credentials/binding;
- missing or stale provider canary;
- zero-credit provider without hard-zero evidence;
- quota exhaustion under zero-credit;
- missing explicit licensed authorization;
- licensed authorization replay on another turn;
- provider response failing normalization;
- vault encryption/decryption failure;
- concurrent duplicate request while a lease is active;
- invalid conversation/turn ownership;
- attempted provider fallback to Railway.

Provider failure must not implicitly change cost class.

## 12. Security and privacy invariants

1. Cloudflare Access remains the owner-authentication boundary.
2. The gateway strips/rejects forged owner assertion headers as today.
3. Provider credentials live only in protected Cloudflare bindings/secrets.
4. GitHub Actions receives only credentials required for deployment/acceptance, never conversation content.
5. Prompts and answers are not emitted in deployment receipts.
6. Idempotency receipts contain bounded metadata and/or encrypted-content references, not plaintext conversation bodies.
7. No provider may gain authority beyond `assistant.respond` from a chat turn.
8. No automatic cost escalation is allowed.

## 13. Deployment/configuration changes

Expected Cloudflare execution-runtime changes include:

- optional Workers AI binding (`env.AI`) when selected as a provider;
- protected vault encryption secret;
- provider-specific credentials only where required;
- provider/billing policy configuration represented as bounded bindings, not hard-coded secrets;
- generated TypeScript bindings updated accordingly.

The deployment workflow remains exact-main and must continue to verify target SHA before promotion.

## 14. Acceptance tests

The implementation is not complete until all of the following are proven.

### Provider/policy

- bridge may authenticate while `assistant.respond` remains unroutable;
- absent provider evidence yields `cloudflare-native-provider-pending` or a more specific bounded reason;
- zero-credit provider without hard-zero evidence is rejected;
- zero-credit quota exhaustion does not call a licensed or metered provider;
- explicit `licensed-approved` authorizes exactly one `assistant.respond` turn;
- licensed authorization cannot authorize other capabilities;
- provider health/canary expiry makes the capability unroutable.

### Execution/idempotency

- stale target SHA is rejected;
- duplicate turn/idempotency key returns the same answer without a second provider call;
- concurrent duplicate submissions execute the provider at most once;
- failed provider calls do not create a successful receipt;
- provider failure does not fall through to Railway.

### Persistence/privacy

- conversation and answer survive browser reload/new bridge attachment;
- operational rows contain no plaintext prompt/answer;
- encrypted content round-trips successfully;
- ciphertext/AAD tampering fails closed;
- logs/receipts do not expose provider secrets or raw conversation bodies.

### End-to-end production acceptance

From the real GitHub Pages UI:

```text
Cloudflare Access            PASS
Owner bridge                 PASS
Execution runtime            PASS
assistant.respond canary     PASS
credit policy                PASS
real user question           PASS
real generated answer        PASS
page reload                  PASS
conversation recovered       PASS
provider call replay guard   PASS
Railway normal-path calls    ZERO
```

A single production conversation is required as final evidence.

## 15. Implementation boundaries

Primary implementation files are expected to include:

- `deploy/cloudflare-execution-runtime/worker.ts`
- `deploy/cloudflare-execution-runtime/storage.ts`
- `deploy/cloudflare-execution-runtime/wrangler.jsonc`
- execution-runtime binding/type declarations
- new Cloudflare provider/policy module(s)
- `deploy/cloudflare-owner-gateway/worker.mjs`
- `.github/workflows/cloudflare-execution-runtime.yml`
- focused Cloudflare provider/persistence/gateway tests

Existing Node-side semantics in these files should be treated as behavioral reference, not copied blindly into the Worker runtime:

- `src/native-cloud-model.mjs`
- `src/zero-credit-provider-selector.mjs`
- `src/question-model.mjs`
- `src/worker-process.mjs`
- existing `licensed-approved` browser/server contracts

## 16. Rollout sequence

1. Add provider contract and tests.
2. Add provider health/canary projection.
3. Add conversation/vault persistence.
4. Add zero-credit admission in the execution runtime.
5. Add explicit one-turn licensed admission without enabling a provider unless one is truly available.
6. Add native gateway `chat/tasks/messages/message-content` actions.
7. Make capability response evidence-driven.
8. Extend exact-main acceptance workflow.
9. Deploy to Cloudflare exact verified `main`.
10. Run one real Pages conversation and replay/reload proof.
11. Keep Railway untouched as rollback-only infrastructure.

## 17. Completion criterion

This tranche is complete when Mahoraga can answer a real Pages-originated owner question through Cloudflare, persist and recover the conversation, prove the selected provider and credit policy from runtime evidence, replay idempotently, and complete the entire transaction without Railway or an unapproved paid fallback.
