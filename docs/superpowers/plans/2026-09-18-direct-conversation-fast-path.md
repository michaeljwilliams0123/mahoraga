# Mahoraga Direct Conversation Fast Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ordinary `assistant.respond` chat turns return a persisted Mahoraga answer inline in the initial authenticated chat response so the workspace can display it without `messages`/`tasks`/`message-content` polling.

**Architecture:** Preserve the existing worker/router/supervisor path as the authority for provider selection, admission, answer-quality evaluation, receipts, and content-vault persistence. For `assistant.respond` only, the server submits the same task it submits today, then waits inside the core request for that task to reach a terminal state and reads the persisted assistant message back through `listConversationMessagesForExecution()`. The browser receives an optional `assistant` result and renders it immediately; all non-answer work keeps the current asynchronous task/objective flow.

**Tech Stack:** Node.js 24 ESM, TypeScript 7, Node test runner, Next.js/React client code in `cloud-app`, SQLite runtime state, existing Mahoraga Supervisor/worker IPC, content vault.

**Spec:** `docs/superpowers/specs/2026-09-18-direct-conversation-fast-path-design.md`

## Global Constraints

- Canonical Railway service remains the cloud runtime; do not create a second listener or second public service.
- GitHub `main` remains source authority.
- Owner session authentication, same-origin mutation, CSRF, request nonce/timestamp replay protection remain unchanged.
- Provider/model credentials remain server-side; browser never chooses a provider.
- Zero-credit routing remains fail-closed and there is no automatic paid fallback.
- `licensed-approved` remains answer-only and must not authorize action/objective work.
- No database schema migration.
- No streaming in this tranche.
- Existing `messages`, `tasks`, and `message-content` APIs remain for history, async work, and recovery.
- Mirror runtime source changes into `state/release-baseline/` using the repository baseline refresh workflow before final verification.

---

## File Structure

- Create `src/direct-conversation-fast-path.mjs`: one responsibility — wait for an already-submitted `assistant.respond` task to complete and return the persisted assistant message or a public failure code.
- Modify `src/server.mjs`: enter the fast path only for `decision.execution === "task" && decision.capability === "assistant.respond"`; otherwise preserve current behavior.
- Modify `cloud-app/lib/runtime-relay.ts`: extend `RuntimeChatResult` with the optional persisted inline assistant contract.
- Create `cloud-app/lib/chat-result.ts`: pure client-side helper that decides whether a chat result is inline-complete or requires async polling.
- Modify `cloud-app/components/workspace.tsx`: render an inline answer and skip `pollRuntime()` for that turn.
- Create `test/direct-conversation-fast-path.test.mjs`: deterministic unit tests for wait/terminal/error semantics.
- Modify `test/chat-runtime.test.mjs`: end-to-end server acceptance with a local zero-credit model stub.
- Create `cloud-app/test/chat-result.test.mjs`: pure tests for inline-vs-async client decision logic.
- Modify `cloud-app/test/mahoraga-one-contract.test.mjs`: source contract guard that the workspace actually uses the helper and does not remove licensed-retry/security behavior.
- Refresh corresponding `state/release-baseline/...` files with `npm run baseline:refresh` after implementation.

---

### Task 1: Core wait primitive for a persisted assistant completion

**Files:**
- Create: `src/direct-conversation-fast-path.mjs`
- Test: `test/direct-conversation-fast-path.test.mjs`

**Interfaces:**
- Consumes: `database.getTask(taskId)` and `database.listConversationMessagesForExecution(conversationId)`.
- Produces: `awaitPersistedAssistantCompletion({ database, taskId, conversationId, timeoutMs?, pollIntervalMs?, sleep? }) -> Promise<{ ok: true, assistant } | { ok: false, status, error }>`.

- [ ] **Step 1: Write the failing unit tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { awaitPersistedAssistantCompletion } from "../src/direct-conversation-fast-path.mjs";

function sequenceDatabase(taskStates, messages) {
  let index = 0;
  return {
    getTask() { return taskStates[Math.min(index++, taskStates.length - 1)]; },
    listConversationMessagesForExecution() { return messages; },
  };
}

test("returns the persisted assistant message only after task completion", async () => {
  const database = sequenceDatabase(
    [{ id: "mhg-1", status: "running" }, { id: "mhg-1", status: "completed" }],
    [{ id: "msg-a", taskId: "mhg-1", role: "assistant", content: "Hello from Mahoraga.", contentReference: "vault:11111111-1111-1111-1111-111111111111", classification: "local-only" }],
  );
  const result = await awaitPersistedAssistantCompletion({ database, taskId: "mhg-1", conversationId: "con-1", timeoutMs: 100, pollIntervalMs: 0, sleep: async () => {} });
  assert.deepEqual(result, {
    ok: true,
    assistant: {
      messageId: "msg-a",
      content: "Hello from Mahoraga.",
      contentReference: "vault:11111111-1111-1111-1111-111111111111",
      classification: "local-only",
      verified: true,
    },
  });
});

test("fails closed when the answer task fails", async () => {
  const database = sequenceDatabase([{ id: "mhg-2", status: "failed", errorCode: "answer-quality-unresolved" }], []);
  assert.deepEqual(
    await awaitPersistedAssistantCompletion({ database, taskId: "mhg-2", conversationId: "con-2", sleep: async () => {} }),
    { ok: false, status: 422, error: "answer-quality-unresolved" },
  );
});

test("times out instead of inventing an answer", async () => {
  const database = sequenceDatabase([{ id: "mhg-3", status: "running" }], []);
  const result = await awaitPersistedAssistantCompletion({ database, taskId: "mhg-3", conversationId: "con-3", timeoutMs: 0, sleep: async () => {} });
  assert.deepEqual(result, { ok: false, status: 504, error: "assistant-response-timeout" });
});
```

- [ ] **Step 2: Run the new tests and verify RED**

Run:

```bash
node --test --test-isolation=none test/direct-conversation-fast-path.test.mjs
```

Expected: FAIL because `src/direct-conversation-fast-path.mjs` does not exist.

- [ ] **Step 3: Implement the minimal wait primitive**

```js
const ACTIVE = new Set(["queued", "claimed", "running", "verifying"]);
const FAILURE_STATUS = Object.freeze({ waiting: 409, waiting_for_user: 409, failed: 422, cancelled: 409, rejected: 422 });

export async function awaitPersistedAssistantCompletion({
  database, taskId, conversationId,
  timeoutMs = 60_000,
  pollIntervalMs = 25,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const task = database.getTask(taskId);
    if (!task) return { ok: false, status: 404, error: "task-not-found" };
    if (task.status === "completed") {
      const message = database.listConversationMessagesForExecution(conversationId)
        .find((item) => item.taskId === taskId && item.role === "assistant");
      if (!message?.content) return { ok: false, status: 500, error: "assistant-response-missing" };
      return {
        ok: true,
        assistant: {
          messageId: message.id,
          content: message.content,
          contentReference: message.contentReference ?? null,
          classification: message.classification ?? "local-only",
          verified: true,
        },
      };
    }
    if (!ACTIVE.has(task.status)) {
      return { ok: false, status: FAILURE_STATUS[task.status] ?? 422, error: task.errorCode ?? `assistant-response-${task.status}` };
    }
    if (Date.now() >= deadline) return { ok: false, status: 504, error: "assistant-response-timeout" };
    await sleep(pollIntervalMs);
  }
}
```

- [ ] **Step 4: Run tests and verify GREEN**

```bash
node --test --test-isolation=none test/direct-conversation-fast-path.test.mjs
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/direct-conversation-fast-path.mjs test/direct-conversation-fast-path.test.mjs
git commit -m "feat(chat): add direct answer completion wait"
```

---

### Task 2: Return `assistant.respond` inline from the core chat request

**Files:**
- Modify: `src/server.mjs` around `executeChatTurn()` and imports
- Modify: `test/chat-runtime.test.mjs`

**Interfaces:**
- Consumes: `awaitPersistedAssistantCompletion(...)` from Task 1.
- Produces: for an ordinary answer turn, `executeChatTurn()` returns `{ status: 200, value: { decision, conversation, task: null, objective: null, assistant } }` only after the worker/supervisor has persisted the verified assistant message.

- [ ] **Step 1: Add a deterministic zero-credit model server helper and a failing end-to-end chat test**

Add to `test/chat-runtime.test.mjs`:

```js
import { createServer } from "node:http";

async function startZeroCreditModel(t, answer = "Hello. Mahoraga is online.") {
  const server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
      response.writeHead(404).end();
      return;
    }
    for await (const _chunk of request) {}
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      choices: [{ message: { content: answer } }],
      usage: { prompt_tokens: 3, completion_tokens: 5 },
    }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const { port } = server.address();
  return `http://127.0.0.1:${port}/v1/chat/completions`;
}
```

Then add a test that temporarily sets and restores these environment variables before `startRuntime()`:

```js
const env = {
  MAHORAGA_ZERO_CREDIT_MODEL_URL: await startZeroCreditModel(t),
  MAHORAGA_ZERO_CREDIT_MODEL_ID: "mahoraga-test-model",
  MAHORAGA_ZERO_CREDIT_METERED: "false",
  MAHORAGA_ZERO_CREDIT_PRICE_USD: "0",
  MAHORAGA_ZERO_CREDIT_SPEND_USD: "0",
  MAHORAGA_ZERO_CREDIT_BILLING_STATE: "verified-zero",
  MAHORAGA_ZERO_CREDIT_ZERO_DOLLAR_STOP_GUARANTEED: "true",
};
for (const [key, value] of Object.entries(env)) process.env[key] = value;
t.after(() => { for (const key of Object.keys(env)) delete process.env[key]; });

const response = await fetch(`${base}/api/chat`, {
  method: "POST",
  headers: AUTH,
  body: JSON.stringify({ mode: "auto", content: "Hello", creditPolicy: "zero-codex", idempotencyKey: "direct-hello" }),
});
assert.equal(response.status, 200);
const body = await response.json();
assert.equal(body.task, null);
assert.equal(body.objective, null);
assert.equal(body.assistant.content, "Hello. Mahoraga is online.");
assert.equal(body.assistant.verified, true);
const persisted = runtime.database.listConversationMessagesForExecution(body.conversation.id);
assert.deepEqual(persisted.map((item) => item.role), ["user", "assistant"]);
assert.equal(persisted.at(-1).id, body.assistant.messageId);
```

Also retain existing assertions that action/objective prompts still return 202/asynchronous work and that `licensed-approved` rejects non-answer actions.

- [ ] **Step 2: Run the focused runtime tests and verify RED**

```bash
node --test --test-isolation=none test/chat-runtime.test.mjs test/direct-conversation-fast-path.test.mjs
```

Expected: the new `Hello` test fails because `assistant.respond` still returns 202 with a task receipt.

- [ ] **Step 3: Wire the fast path in `src/server.mjs`**

Add the import:

```js
import { awaitPersistedAssistantCompletion } from "./direct-conversation-fast-path.mjs";
```

Immediately after the existing `assistant.respond` task is submitted in `executeChatTurn()`, add:

```js
if (decision.execution === "task" && decision.capability === "assistant.respond") {
  const completion = await awaitPersistedAssistantCompletion({
    database,
    taskId: task.id,
    conversationId: conversation.id,
  });
  if (!completion.ok) return { status: completion.status, value: { error: completion.error } };
  return {
    status: 200,
    value: {
      decision,
      conversation,
      task: null,
      objective: null,
      assistant: completion.assistant,
    },
  };
}
```

Keep the existing task receipt return unchanged for other capabilities. Do not add provider logic to `server.mjs`; the existing Supervisor continues to route the submitted task, enforce authority/billing/provider readiness, evaluate answer quality, and persist `conversationContent` through `completeTaskWithReceipt()`.

- [ ] **Step 4: Run the focused runtime tests and verify GREEN**

```bash
node --test --test-isolation=none test/chat-runtime.test.mjs test/direct-conversation-fast-path.test.mjs test/answer-quality.test.ts
```

Expected: all PASS, including concise greeting quality behavior from #584.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/server.mjs test/chat-runtime.test.mjs
git commit -m "feat(chat): return persisted answer inline"
```

---

### Task 3: Teach the cloud workspace to render inline chat results without polling

**Files:**
- Create: `cloud-app/lib/chat-result.ts`
- Create: `cloud-app/test/chat-result.test.mjs`
- Modify: `cloud-app/lib/runtime-relay.ts`
- Modify: `cloud-app/components/workspace.tsx`
- Modify: `cloud-app/test/mahoraga-one-contract.test.mjs`

**Interfaces:**
- Produces `RuntimeInlineAssistant` and optional `assistant` on `RuntimeChatResult`.
- Produces pure helper `chatResultPresentation(result)` returning `{ inlineAssistant, shouldPoll }`.

- [ ] **Step 1: Write the failing pure client-contract tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { chatResultPresentation } from "../lib/chat-result.ts";

test("inline persisted answer suppresses runtime polling", () => {
  const assistant = { messageId: "msg-1", content: "Hello", contentReference: null, classification: "local-only", verified: true };
  assert.deepEqual(chatResultPresentation({ conversation: { id: "con-1" }, task: null, objective: null, decision: {}, assistant }), {
    inlineAssistant: assistant,
    shouldPoll: false,
  });
});

test("async task result keeps polling", () => {
  assert.deepEqual(chatResultPresentation({ conversation: { id: "con-1" }, task: { id: "mhg-1", conversationId: "con-1", status: "queued" }, objective: null, decision: {} }), {
    inlineAssistant: null,
    shouldPoll: true,
  });
});
```

- [ ] **Step 2: Run tests and verify RED**

```bash
node --test --test-isolation=none cloud-app/test/chat-result.test.mjs
```

Expected: FAIL because `cloud-app/lib/chat-result.ts` does not exist.

- [ ] **Step 3: Extend the relay type and add the pure helper**

In `cloud-app/lib/runtime-relay.ts`:

```ts
export type RuntimeInlineAssistant = {
  messageId: string;
  content: string;
  contentReference: string | null;
  classification: string;
  verified: true;
};

export type RuntimeChatResult = {
  conversation: { id: string };
  task: RuntimeTask | null;
  objective: { id?: string } | null;
  decision: { mode?: string; execution?: string };
  assistant?: RuntimeInlineAssistant;
};
```

Create `cloud-app/lib/chat-result.ts`:

```ts
import type { RuntimeChatResult, RuntimeInlineAssistant } from "./runtime-relay";

export function chatResultPresentation(result: RuntimeChatResult): {
  inlineAssistant: RuntimeInlineAssistant | null;
  shouldPoll: boolean;
} {
  const assistant = result.assistant?.verified === true && result.assistant.content.trim()
    ? result.assistant
    : null;
  return {
    inlineAssistant: assistant,
    shouldPoll: assistant === null,
  };
}
```

- [ ] **Step 4: Modify `Workspace.submitCore()` to short-circuit polling on an inline answer**

Import the helper:

```ts
import { chatResultPresentation } from "@/lib/chat-result";
```

After `const conversationId = result.conversation.id;`:

```ts
const presentation = chatResultPresentation(result);
setRuntimeConversationId(conversationId);
if (presentation.inlineAssistant) {
  renderedRuntimeMessages.current.add(presentation.inlineAssistant.messageId);
  appendMessage(
    "assistant",
    presentation.inlineAssistant.content,
    `runtime-${presentation.inlineAssistant.messageId}`,
  );
  activeRuntimeTask.current = null;
  return;
}
activeRuntimeTask.current = result.task;
await pollRuntime(transport, conversationId, Boolean(result.task || result.objective), pollGeneration);
```

Do not remove `pollRuntime()` or `syncRuntimeMessages()`; they remain the async/history path.

- [ ] **Step 5: Add the source contract guard**

Append to `cloud-app/test/mahoraga-one-contract.test.mjs`:

```js
test("ordinary persisted answers render inline while async work retains polling", async () => {
  const [workspace, relay, presentation] = await Promise.all([
    read("components/workspace.tsx"),
    read("lib/runtime-relay.ts"),
    read("lib/chat-result.ts"),
  ]);
  assert.match(relay, /assistant\?: RuntimeInlineAssistant/);
  assert.match(workspace, /chatResultPresentation/);
  assert.match(workspace, /renderedRuntimeMessages\.current\.add/);
  assert.match(workspace, /presentation\.inlineAssistant/);
  assert.match(workspace, /pollRuntime/);
  assert.match(presentation, /shouldPoll/);
});
```

- [ ] **Step 6: Run cloud focused tests and TypeScript checking**

```bash
node --test --test-isolation=none cloud-app/test/chat-result.test.mjs cloud-app/test/mahoraga-one-contract.test.mjs
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add cloud-app/lib/chat-result.ts cloud-app/lib/runtime-relay.ts cloud-app/components/workspace.tsx cloud-app/test/chat-result.test.mjs cloud-app/test/mahoraga-one-contract.test.mjs
git commit -m "feat(ui): render direct Mahoraga answers inline"
```

---

### Task 4: Harden error semantics and prove async behavior did not regress

**Files:**
- Modify: `test/direct-conversation-fast-path.test.mjs`
- Modify: `test/chat-runtime.test.mjs`
- Modify only if required by RED tests: `src/direct-conversation-fast-path.mjs`, `src/server.mjs`

**Interfaces:**
- The fast path never silently falls back to async after provider/quality/terminal failure.
- Objective/capability work remains 202 and client-polled.

- [ ] **Step 1: Add failing edge-case tests**

Add tests for:

```js
// waiting-for-user must return a public 409, not a fake assistant answer
assert.deepEqual(
  await awaitPersistedAssistantCompletion({
    database: sequenceDatabase([{ id: "mhg-wait", status: "waiting_for_user", errorCode: "owner-input-required" }], []),
    taskId: "mhg-wait", conversationId: "con-wait", sleep: async () => {},
  }),
  { ok: false, status: 409, error: "owner-input-required" },
);

// completed task without a persisted assistant message is a server integrity failure
assert.deepEqual(
  await awaitPersistedAssistantCompletion({
    database: sequenceDatabase([{ id: "mhg-missing", status: "completed" }], []),
    taskId: "mhg-missing", conversationId: "con-missing", sleep: async () => {},
  }),
  { ok: false, status: 500, error: "assistant-response-missing" },
);
```

In `test/chat-runtime.test.mjs`, explicitly assert the existing action path still returns `202`, still returns an objective/task receipt, and does not contain `assistant`.

- [ ] **Step 2: Run focused tests and verify RED only if behavior is missing**

```bash
node --test --test-isolation=none test/direct-conversation-fast-path.test.mjs test/chat-runtime.test.mjs
```

Expected: either PASS immediately if Task 1 already covered the semantics, or FAIL only on the newly documented edge case.

- [ ] **Step 3: Make the smallest correction needed**

Do not alter routing policy. Only update the terminal-state mapping or integrity handling in `awaitPersistedAssistantCompletion()` if the new test proves it necessary.

- [ ] **Step 4: Re-run focused tests**

```bash
node --test --test-isolation=none test/direct-conversation-fast-path.test.mjs test/chat-runtime.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4 if code or tests changed**

```bash
git add src/direct-conversation-fast-path.mjs src/server.mjs test/direct-conversation-fast-path.test.mjs test/chat-runtime.test.mjs
git commit -m "test(chat): harden direct answer boundaries"
```

---

### Task 5: Refresh release baseline and run the repository gates

**Files:**
- Generated/updated by baseline workflow under `state/release-baseline/`

**Interfaces:**
- Release baseline mirrors the source implementation exactly enough for `baseline:verify` and the full `verify` script.

- [ ] **Step 1: Refresh the baseline**

```bash
npm run baseline:refresh
```

Expected: mirrors the touched runtime/cloud files and tests according to `scripts/create-release-baseline.mjs`.

- [ ] **Step 2: Run baseline verification**

```bash
npm run baseline:verify
```

Expected: PASS.

- [ ] **Step 3: Run focused conversation/cloud tests**

```bash
node --test --test-isolation=none \
  test/direct-conversation-fast-path.test.mjs \
  test/chat-runtime.test.mjs \
  test/answer-quality.test.ts \
  cloud-app/test/chat-result.test.mjs \
  cloud-app/test/mahoraga-one-contract.test.mjs
```

Expected: PASS.

- [ ] **Step 4: Run the full deterministic repository gate**

```bash
npm run verify
```

Expected: PASS on the local supported environment. Do not merge on a known deterministic Verify failure.

- [ ] **Step 5: Commit generated baseline updates**

```bash
git add state/release-baseline
git commit -m "chore: refresh direct conversation release baseline"
```

---

### Task 6: Open one PR, verify CI, merge, and prove canonical Railway production

**Files:**
- No source changes unless CI reveals a real regression; any fix must restart the relevant TDD cycle.

**Interfaces:**
- One feature branch/PR; existing canonical Railway service only.

- [ ] **Step 1: Rebase/merge current `main` into the feature branch if `main` advanced**

```bash
git fetch origin
git merge --no-edit origin/main
```

Expected: no authority fork; resolve only genuine conflicts, then rerun focused tests + `npm run verify`.

- [ ] **Step 2: Push the implementation branch and open one PR**

PR title:

```text
feat(chat): add direct persisted conversation fast path
```

PR body must call out:

```text
- ordinary assistant.respond waits inside the authenticated core request
- provider routing/admission/quality remains Supervisor-owned
- persisted assistant content is returned inline only after completion
- action/objective work remains async
- zero-credit remains fail-closed; no automatic paid fallback
- browser no longer needs message-content to display an inline answer
```

- [ ] **Step 3: Wait for required Ubuntu/Windows Verify jobs and inspect failures**

Expected: deterministic Verify jobs PASS. Treat optional AI/Codex/Vercel advisory activity as non-blocking unless repository policy explicitly says otherwise.

- [ ] **Step 4: Merge only after deterministic gates are green**

Use the repository's normal merge method; do not bypass a failing required gate.

- [ ] **Step 5: Verify canonical Railway deploys the merged `main` SHA**

Check:

```text
GET /api/live  -> HTTP 200
GET /api/ready -> HTTP 200 and gitSha == merged main SHA
```

Do not create a replacement Railway service.

- [ ] **Step 6: Run the production acceptance transaction**

Using the existing owner-authenticated workspace:

```text
send: Hello
expect: one visible persisted Mahoraga assistant response from the initial chat action
expect: no follow-up message-content request is required to obtain that answer
```

Record the merged SHA, Railway deployment ID, `/api/ready` SHA, and the chat request status as final evidence.

---

## Plan Self-Review

- Spec coverage: synchronous answer, persistence-before-success, immediate UI rendering, async task/objective preservation, zero-credit/licensed boundaries, deterministic tests, baseline refresh, CI, Railway exact-head proof, and production `Hello` proof are all assigned to tasks.
- Placeholder scan: no TBD/TODO/"implement later" steps remain.
- Type consistency: the inline result uses the same field names throughout — `messageId`, `content`, `contentReference`, `classification`, `verified` — and `RuntimeChatResult.assistant` matches the core response shape.
- Scope: no schema migration, streaming, second UI, provider rewrite, or unrelated refactor is included.
