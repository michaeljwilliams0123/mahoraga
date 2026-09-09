import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8").catch(() => "");

test("browser relay persists only scoped reconnect state and can remotely reattach", async () => {
  const [store, relay] = await Promise.all([read("lib/relay-session-store.ts"), read("lib/runtime-relay.ts")]);
  assert.match(store, /indexedDB\.open\("mahoraga-relay",\s*1\)/);
  assert.match(store, /CryptoKey/);
  assert.match(store, /resumeCredential/);
  assert.match(store, /saveRelaySession/);
  assert.match(store, /clearRelaySession/);
  assert.match(relay, /async resume\(\)/);
  assert.match(relay, /action:\s*"reattach-remote"/);
  assert.match(relay, /saveRelaySession/);
  assert.match(relay, /clearRelaySession/);
  assert.doesNotMatch(store + relay, /github_pat_|ghp_|AI_GATEWAY_API_KEY|MAHORAGA_PRIMARY_CODEX_TOKEN/);
});

test("workspace resumes the relay on startup and does not revoke on reload cleanup", async () => {
  const workspace = await read("components/workspace.tsx");
  assert.match(workspace, /\.resume\(\)/);
  assert.match(workspace, /\.disconnect\(\)/);
  assert.doesNotMatch(workspace, /useEffect\(\(\) => \(\) =>[\s\S]{0,180}\.revoke\(\)/);
});