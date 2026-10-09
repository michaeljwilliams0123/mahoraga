import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CloudflareDOSQLiteAdapter } from "../deploy/cloudflare-execution-runtime/storage.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("owner-scoped conversation listing binds owner identity and enforces a bounded limit", () => {
  const calls = [];
  const fake = { storage: { sql: {
    exec(sql, ...values) {
      calls.push({ sql, values });
      return { toArray: () => [
        { id: "own-conversation", owner_id_hash: "owner-a", created_at: 10, updated_at: 20 },
      ] };
    },
  } } };
  const adapter = new CloudflareDOSQLiteAdapter(fake);
  assert.deepEqual(adapter.listConversations("owner-a", 500), [
    { id: "own-conversation", ownerIdHash: "owner-a", createdAt: 10, updatedAt: 20 },
  ]);
  assert.match(calls[0].sql, /WHERE owner_id_hash = \? ORDER BY updated_at DESC, id DESC LIMIT \?/);
  assert.deepEqual(calls[0].values, ["owner-a", 50]);
});

test("history routes enforce existing verified owner and do not trust browser identity", () => {
  const gateway = read("deploy/cloudflare-owner-gateway/worker.mjs");
  const runtime = read("deploy/cloudflare-execution-runtime/worker.ts");
  const client = read("cloud-app/lib/runtime-relay.ts");
  const ui = read("cloud-app/components/workspace.tsx");
  assert.match(gateway, /"conversations", "conversation-history"/);
  assert.match(gateway, /ctx\.access\.getIdentity\(\)/);
  assert.match(runtime, /const ownerHash = await digestText\(owner\)/);
  assert.match(runtime, /this\.storage\.listConversations\(ownerHash\)\.map\(\(\{ id, createdAt, updatedAt \}\)/);
  assert.match(runtime, /conversation\.ownerIdHash !== ownerHash/);
  assert.match(runtime, /Object\.keys\(payload\)\.length !== 1 \|\| !boundedId\(payload\.conversationId\)/);
  assert.match(runtime, /decryptConversationContent\(user, this\.env\.CONTENT_VAULT_KEY\)/);
  assert.match(client, /async conversationHistory\(conversationId: string\)/);
  assert.match(client, /if \(!this\.bridgeAuthenticated && !this\.cloudSession\) throw relayError\("cloud-history-unavailable"\)/);
  assert.match(ui, /setRuntimeConversationId\(conversationId\)/);
  assert.match(ui, /historyEpoch\.current/);
  assert.doesNotMatch(ui, /localStorage\.|sessionStorage\./);
});

test("history reads the newest thirty successful turns in chronological order", () => {
  const calls = [];
  const adapter = new CloudflareDOSQLiteAdapter({ storage: { sql: {
    exec(sql, ...values) {
      calls.push({ sql, values });
      return { toArray: () => [{ id: "newest" }, { id: "middle" }, { id: "oldest" }] };
    },
  } } });
  adapter.getTurn = (id) => ({ id });
  assert.deepEqual(adapter.listRecentSuccessfulTurns("owner-conversation", 500).map(({ id }) => id), ["oldest", "middle", "newest"]);
  assert.ok(calls[0].sql.includes("status = 'SUCCESS' AND content_id_assistant IS NOT NULL"));
  assert.ok(calls[0].sql.includes("ORDER BY created_at DESC, id DESC LIMIT ?"));
  assert.deepEqual(calls[0].values, ["owner-conversation", 30]);
  assert.ok(read("deploy/cloudflare-execution-runtime/worker.ts").includes("this.storage.listRecentSuccessfulTurns(conversationId)"));
});

test("fresh pairing restores history without reopening it after New Conversation", () => {
  const ui = read("cloud-app/components/workspace.tsx");
  const pairing = ui.slice(ui.indexOf("async function pairRuntime()"), ui.indexOf("async function revokeRuntime()"));
  assert.ok(pairing.includes("resetConversation({ allowInitialHistoryRestore: true })"));
  assert.ok(ui.includes("historyInitialized.current = !options.allowInitialHistoryRestore"));
  assert.ok(ui.includes("function resetConversation(options: { allowInitialHistoryRestore?: boolean } = {})"));
});

test("failed or busy initial history load remains recoverable without background polling", () => {
  const ui = read("cloud-app/components/workspace.tsx");
  assert.doesNotMatch(ui, /historyInitialized\.current = true;\s*if \(conversations\[0\]/);
  assert.match(ui, /setRuntimeConversationId\(conversationId\);\s*historyInitialized\.current = true/);
  assert.match(ui, /if \(!transport\?\.connected \|\| runtimeBusy\) return false/);
  assert.match(ui, /if \(!historyInitialized\.current && conversations\[0\] && generation === runtimePollGeneration\.current\)/);
  assert.match(ui, /window\.addEventListener\("focus", retryOnFocus\)/);
  assert.match(ui, /window\.removeEventListener\("focus", retryOnFocus\)/);
  assert.doesNotMatch(ui, /setInterval\(.*history/);
});
