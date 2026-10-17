import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFile(fileURLToPath(new URL(path, root)), "utf8");

test("canonical transports fail closed for UI actions they do not implement", async () => {
  const [gateway, worker, relay] = await Promise.all([
    read("deploy/cloudflare-owner-gateway/worker.mjs"),
    read("deploy/cloudflare-execution-runtime/worker.ts"),
    read("cloud-app/lib/runtime-relay.ts"),
  ]);
  for (const action of ["task-action", "operations-action"]) {
    assert.doesNotMatch(gateway, new RegExp('"'+action+'"'));
    assert.doesNotMatch(worker, new RegExp('input\\?\\.type === "'+action+'"'));
  }
  // Cloud snapshot is now a strictly owner-scoped read; supervisor mutations remain blocked.
  assert.match(worker, /input\?\.type === "operations-snapshot"/);
  assert.match(worker, /owner_id_hash = \?/);
  assert.match(relay, /async operationsSnapshot\(\) \{\s*return this.call<RuntimeOperationsSnapshot>/);
  assert.match(relay, /async operationsAction[\s\S]*canonical-action-unavailable/);
});

test("native command retry fixes identity before delivery and clears on reset", async () => {
  const workspace = await read("cloud-app/components/workspace.tsx");
  assert.match(workspace, /runtimeConversationId \?\? crypto\.randomUUID\(\)/);
  assert.match(workspace, /conversationId: commandConversation/);
  assert.match(workspace, /idempotencyKey,/);
  assert.match(workspace, /retry\?\.conversationId/);
  assert.match(workspace, /ambiguousTransportFailure\(code\)/);
  assert.match(workspace, /canSubmitNativeRepositoryChat\(coreReady, requestText, 0\)/);
  assert.match(workspace, /pendingCommandRetry\.current = null/);
});

test("compound admin prose cannot be silently certified as completed", async () => {
  // @ts-expect-error Canonical runtime-neutral JavaScript parser has no TypeScript declaration.
  const { parseRepositoryAdminCommand } = await import("../src/repository-chat-intent.mjs");
  assert.deepEqual(parseRepositoryAdminCommand("run /repo admin status"), { action: "status", proposal: null });
  assert.deepEqual(parseRepositoryAdminCommand("please run /repo admin status."), { action: "status", proposal: null });
  for (const text of ["run /repo admin status, then create a PR", "execute /repo admin status and reconnect", "/repo admin status; deploy", "run /repo admin status now"]) assert.throws(() => parseRepositoryAdminCommand(text), /repository-admin-command-invalid/);
});
