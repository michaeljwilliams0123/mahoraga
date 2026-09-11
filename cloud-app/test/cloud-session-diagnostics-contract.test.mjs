import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (file) => readFile(new URL(file, root), "utf8");

test("cloud session exposes safe compatibility diagnostics before optional relay fallback", async () => {
  const [session, relay, workspace] = await Promise.all([
    read("app/api/runtime/session/route.ts"),
    read("lib/runtime-relay.ts"),
    read("components/workspace.tsx"),
  ]);

  assert.match(session, /cloudSessionCompatibility/);
  assert.match(session, /const connection = cloudSessionCompatibility/);
  assert.match(relay, /cloudSessionDiagnostic/);
  assert.match(relay, /cloud-runtime-contract-incompatible/);
  assert.match(workspace, /cloud-session-unavailable/);
  assert.match(workspace, /Windows 3\.6\.0 remains a rollback baseline/i);
  assert.doesNotMatch(`${session}\n${relay}\n${workspace}`, /MAHORAGA_PRIMARY_CODEX_TOKEN|MAHORAGA_CLOUD_SESSION_SECRET/);
});
