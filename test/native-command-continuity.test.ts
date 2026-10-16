import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const CANONICAL_NOT_IMPLEMENTED = ["task-action", "operations-snapshot", "operations-action"] as const;

const base = new URL("../", import.meta.url);
const get = (path: string) => readFile(fileURLToPath(new URL(path, base)), "utf8");

test("canonical owner gateway and durable-object action lists do not advertise unsupported UI operations", async () => {
  const [gateway, worker, relay] = await Promise.all([
    get("deploy/cloudflare-owner-gateway/worker.mjs"),
    get("deploy/cloudflare-execution-runtime/worker.ts"),
    get("cloud-app/lib/runtime-relay.ts"),
  ]);
  for (const action of CANONICAL_NOT_IMPLEMENTED) {
    assert.doesNotMatch(gateway, new RegExp('"'+action+'"'));
    assert.doesNotMatch(worker, new RegExp('input\\?\\.type === "'+action+'"'));
    assert.match(relay, new RegExp('canonical-action-unavailable'));
  }
});
test("the persisted turn has independently captured source SHA, not current-runtime backfill", async () => {
  const [storage, runtime] = await Promise.all([
    get("deploy/cloudflare-execution-runtime/storage.ts"), get("deploy/cloudflare-execution-runtime/worker.ts"),
  ]);
  assert.match(storage, /source_sha/);
  assert.match(runtime, /sourceSHA/);
  assert.match(storage, /ALTER TABLE turns ADD COLUMN source_sha/);
});
test("compound /repo admin status text cannot be silently certified as completed",async()=>{
  // @ts-expect-error Existing canonical runtime-neutral JS parser has no TypeScript declaration.
  const { parseRepositoryAdminCommand } = await import("../src/repository-chat-intent.mjs");
  assert.deepEqual(parseRepositoryAdminCommand("run /repo admin status"),{action:"status",proposal:null});
  for(const text of ["run /repo admin status, then create a PR","execute /repo admin status and reconnect","/repo admin status; deploy","run /repo admin status now"]) {
    assert.throws(()=>parseRepositoryAdminCommand(text),/repository-admin-command-invalid/);
  }
});

test("first-send conversation identity is fixed client-side before ambiguous retries",async()=>{
 const ui=await get("cloud-app/components/workspace.tsx");
 assert.match(ui,/runtimeConversationId \?\? crypto\.randomUUID\(\)/);
 assert.match(ui,/conversationId: commandConversation/);
 assert.match(ui,/idempotencyKey,\s*\}\);/);
 assert.match(ui,/retry \? retry\.conversationId/);
});
