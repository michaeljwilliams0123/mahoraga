import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (file) => readFile(new URL(file, root), "utf8");

test("workspace automatically prefers authenticated same-origin attach", async () => {
  const [workspace, relay] = await Promise.all([read("components/workspace.tsx"), read("lib/runtime-relay.ts")]);
  assert.match(workspace, /transport\.attach\(\).*transport\.resume\(\)/s);
  assert.match(relay, /fetch\("\/api\/runtime\/session"/);
  assert.match(relay, /x-mahoraga-csrf/);
  assert.match(relay, /x-mahoraga-request-nonce/);
  assert.match(relay, /x-mahoraga-request-timestamp/);
  assert.doesNotMatch(workspace, /licensed-approved[\s\S]{0,200}catch[\s\S]{0,200}submitCore/);
});

test("gateway exposes bounded liveness and readiness without model invocation", async () => {
  const [live, ready, session] = await Promise.all([read("app/api/live/route.ts"), read("app/api/ready/route.ts"), read("app/api/runtime/session/route.ts")]);
  assert.match(live, /modelInvocations: 0/);
  assert.match(ready, /modelInvocations: 0/);
  assert.match(session, /establishOwnerSession/);
  assert.match(session, /cloudSessionCompatibility/);
  assert.match(session, /state: connection\.state === "ready" \? "Idle" : "Degraded"/);
});
