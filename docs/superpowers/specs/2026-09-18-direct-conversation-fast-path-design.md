# Mahoraga Direct Conversation Fast Path Design

Date: 2026-09-18
Status: Design approved in chat; implementation not started
Baseline: `main` at `541342add10f9faceb7e826e4cfe57bec3181f25`

## Problem

Mahoraga's cloud workspace can authenticate, submit chat work, poll runtime state, and persist conversation content, but ordinary conversational turns are still handled like asynchronous work. The browser sends `chat`, then polls `messages` and `tasks`, then performs a separate `message-content` dereference before it can render an assistant reply.

That flow is appropriate for long-running objectives and tool work, but it is too indirect and failure-prone for normal dialogue. A simple prompt such as `Hello` should behave like a normal conversational exchange: one authenticated request enters the Mahoraga core, the core selects and invokes the approved provider, persists the assistant answer, and returns the answer in the same response.

PR #584 removed one answer-quality rejection for concise greetings. It did not change the architectural fact that direct conversational execution remains disabled and that the browser depends on later polling and vault dereference to display the response.

## Goals

1. Make ordinary `assistant.respond` turns execute synchronously through the Mahoraga core.
2. Return the completed assistant answer inline in the successful `chat` response.
3. Persist that answer to the existing conversation journal/content-vault boundary before returning success.
4. Render the inline answer immediately in the existing Next.js workspace without requiring `messages`, `tasks`, or `message-content` polling for that turn.
5. Keep action-oriented, capability-oriented, and objective-oriented prompts on the current asynchronous execution path.
6. Preserve the current owner-auth, CSRF, replay-protection, provider-admission, zero-credit, and repository/deployment authority boundaries.
7. Add deterministic tests that prevent regression back to a polling-only conversational path.

## Non-goals

- No second UI, second public listener, Vite/SPA rewrite, or Windows activation.
- No browser-side provider selection or browser-visible model credentials.
- No automatic paid fallback.
- No change to autonomous objective execution, repository mutation policy, approval policy, or long-running task semantics.
- No streaming in this tranche. Streaming can follow after the synchronous contract is proven stable.
- No removal of `messages`, `tasks`, or `message-content`; those remain required for history, asynchronous work, and recovery.

## Existing Flow

For an ordinary answer turn the current path is effectively:

1. Browser workspace calls `RuntimeRelay.chat()`.
2. Same-origin `/api/runtime/action` forwards `type: "chat"` to the core.
3. Core classifies the turn as `assistant.respond` and submits a task.
4. Browser receives the conversation/task receipt but not the assistant answer.
5. Browser polls `messages(conversationId)` and `tasks(conversationId)`.
6. When an assistant message appears with a vault reference, browser calls `messageContent(...)`.
7. Only then can the workspace render the answer.

The extra polling/dereference chain creates unnecessary latency and introduces additional failure points for the most common interaction.

## Target Architecture

The core remains the single authority for classification, provider routing, execution, persistence, and security.

For a normal conversational turn:

1. Browser sends the existing authenticated `chat` action.
2. Core classifies the turn.
3. If the decision is exactly `execution: "task"` and `capability: "assistant.respond"`, the core enters the synchronous conversation fast path.
4. The core derives and validates the same provider/admission decision used by the current worker path.
5. The core invokes the selected answer provider server-side.
6. The returned answer passes the existing answer-quality gate.
7. The core creates or reuses the conversation and persists the user message and assistant message using the existing database/content-vault boundary.
8. The core returns a 200 response containing the conversation plus an inline assistant result.
9. The workspace renders that inline result immediately and does not start runtime polling for that turn.

All other decisions continue through the current task/objective path and return their current asynchronous receipts.

## Chat Result Contract

The current chat result remains backward-compatible and gains an optional inline answer field.

Conceptually:

```ts
{
  decision,
  conversation,
  task: null,
  objective: null,
  assistant?: {
    messageId: string,
    content: string,
    classification: string,
    contentReference: string | null,
    verified: true
  }
}
```

Rules:

- `assistant` is present only after a verified `assistant.respond` completion has been persisted successfully.
- The browser may render `assistant.content`, but the durable source of truth remains the persisted conversation message.
- `task` and `objective` remain unchanged for asynchronous flows.
- A synchronous conversational response must not claim success if provider execution, answer-quality validation, persistence, or content-vault storage fails.

## Core Execution Design

### Classification Boundary

`classifyChatTurn()` remains authoritative. The fast path is entered only when:

```text
decision.execution === "task"
decision.capability === "assistant.respond"
```

No action/objective prompt is converted into synchronous answer execution merely to make the UI feel responsive.

### Provider Boundary

The synchronous path must reuse the core-owned admission and provider-selection rules already used for `assistant.respond` work. It must not duplicate browser-side provider logic.

For `zero-codex` policy:

- A verified zero-credit provider must be selected and admitted.
- The zero-dollar evidence requirements remain fail-closed.
- If no valid zero-credit route exists, return the existing public error such as `zero-credit-provider-unavailable`.
- The browser may continue to offer the explicit one-message licensed escalation only after that rejection.

For `licensed-approved` policy:

- The existing restriction remains: only `assistant.respond` may use the licensed path.
- No action, objective, repository mutation, or tool work may inherit that authorization.

### Provider Invocation

The implementation should extract or reuse a small core helper for synchronous `assistant.respond` execution instead of bypassing worker/provider contracts. The helper should return a normalized verified answer object and enough provider health/evidence for existing quality checks, without exposing secrets to the client.

### Answer Quality

The synchronous result must pass the same deterministic answer-quality policy as the asynchronous worker result. PR #584's concise greeting allowance remains part of that policy.

If quality validation fails, the turn fails closed rather than persisting/rendering a low-quality completion as successful.

## Persistence Design

Persistence is part of the synchronous transaction boundary from the user's perspective.

For a new conversation:

1. Create conversation with the user message using the existing `local-only` default classification.
2. Execute and verify the answer.
3. Persist an assistant message using `database.addConversationMessage(...)`.
4. Return the newly persisted message identity plus inline text.

For an existing conversation:

1. Validate the conversation exists.
2. Add the new user message.
3. Execute and verify the answer.
4. Add the assistant message.
5. Return the persisted assistant identity plus inline text.

The existing content vault remains authoritative. If vault-backed storage is enabled, persisted message content may be represented internally by `contentReference`; returning inline text in the immediate authenticated response does not change the durable storage boundary.

## Workspace Design

`Workspace.submitCore()` inspects the `chat` result.

If `result.assistant` is present:

- set/update the runtime conversation id,
- mark the returned persisted message id as already rendered,
- append the assistant text immediately,
- do not call `pollRuntime()` for this turn,
- clear busy state normally.

If `result.assistant` is absent:

- keep the current asynchronous behavior,
- track task/objective state,
- poll `messages` and `tasks`,
- dereference `message-content` when required.

This keeps one UI and one transport while making the common answer path direct.

## Security and Authority Invariants

The change must preserve all of the following:

- canonical Railway service remains the cloud runtime,
- GitHub `main` remains source authority,
- owner session authentication remains required,
- same-origin mutation protection remains required,
- CSRF and request nonce/timestamp replay protection remain required,
- browser never receives provider/model credentials,
- browser never selects providers directly,
- provider/admission decisions remain core-owned,
- zero-credit routes remain fail-closed,
- no automatic paid fallback,
- action/objective prompts retain existing task policy and approval rules,
- persisted content continues through the existing content-vault/data-classification boundary.

## Error Handling

Synchronous `assistant.respond` failures return a normal public runtime error and do not return a partial `assistant` object.

Expected classes include:

- provider unavailable,
- provider admission rejected,
- provider request/response failure,
- answer-quality rejection,
- conversation missing,
- content-vault/persistence failure.

The client continues to map public error codes through `runtimeErrorMessage()`.

A failed synchronous answer must not silently fall back to the asynchronous task path, because that would hide provider/admission failures and reintroduce ambiguous behavior.

## Testing Strategy

### Core unit tests

Add tests proving:

1. `assistant.respond` + zero-credit admitted provider returns a synchronous verified answer.
2. The assistant message is persisted before success is returned.
3. The returned `messageId` matches the persisted assistant message.
4. Existing-conversation turns persist user then assistant messages in order.
5. Missing/unhealthy zero-credit provider fails closed.
6. Licensed approval remains restricted to `assistant.respond`.
7. Mutation/objective prompts do not enter the fast path.
8. Answer-quality rejection does not persist a successful assistant message.

### Workspace tests

Add tests proving:

1. A `chat` result containing `assistant` renders immediately.
2. Immediate answer rendering does not invoke `messages`, `tasks`, or `message-content` for that turn.
3. A chat result without `assistant` still uses the existing polling path.
4. The returned assistant message id is added to the rendered-message set to prevent duplicate rendering during later history synchronization.

### End-to-end regression

Add or extend an integration test that proves:

```text
owner-authenticated session
→ POST chat("Hello")
→ HTTP 200
→ persisted assistant message exists
→ response contains assistant.content
→ no message-content request is required to obtain that answer
```

The test should use a deterministic stubbed provider and must not consume paid model credits.

## Deployment and Verification

1. Implement on a feature branch based on the current authoritative `main`.
2. Run focused direct-conversation tests first.
3. Run the required repository Verify suite on supported platforms.
4. Open/update a single PR for this tranche.
5. Merge only after required deterministic checks are green.
6. Promote only the existing canonical Railway service from merged `main`.
7. Verify `/api/live` and `/api/ready` report the merged SHA.
8. Perform one authenticated production conversation acceptance check using `Hello`.
9. Confirm the answer is visible without a follow-up `message-content` request for that turn.

## Rollback

The change is structurally low-risk because the asynchronous path remains intact for all non-inline results. Rollback is the normal Git/Railway rollback to the preceding known-good `main` deployment.

No database migration is required by this design. The implementation must avoid schema changes unless a test proves they are unavoidable; if that occurs, the design must be revisited before implementation proceeds.

## Acceptance Criteria

The tranche is complete only when all of the following are true:

1. A normal authenticated `Hello` receives a verified Mahoraga assistant response in the initial chat request.
2. That assistant response is persisted in the existing conversation store/content vault before success is returned.
3. The cloud workspace renders that response immediately.
4. The workspace does not need `messages`, `tasks`, or `message-content` polling to display that synchronous answer.
5. Action/objective prompts continue to use the existing asynchronous execution architecture.
6. Zero-credit and licensed-provider policy behavior remains fail-closed and unchanged in authority.
7. Required CI is green.
8. Canonical Railway production is deployed from the merged `main` SHA and passes one authenticated end-to-end conversational proof.
