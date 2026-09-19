import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appRoot = new URL("../", import.meta.url);
const repoRoot = new URL("../../", import.meta.url);
const readApp = (file) => readFile(new URL(file, appRoot), "utf8");
const readRepo = (file) => readFile(new URL(file, repoRoot), "utf8");

test("canonical cloud HTTP calls use the provider-neutral API origin", async () => {
  const [relay, workspace] = await Promise.all([
    readApp("lib/runtime-relay.ts"),
    readApp("components/workspace.tsx"),
  ]);
  assert.match(relay, /import \{ mahoragaApiUrl \} from "\.\/api-origin"/);
  assert.match(relay, /mahoragaApiUrl\("\/api\/runtime\/session"\)/);
  assert.match(relay, /mahoragaApiUrl\("\/api\/runtime\/action"\)/);
  assert.match(relay, /mahoragaApiUrl\("\/api\/runtime\/artifacts"\)/);
  assert.match(workspace, /mahoragaApiUrl\("\/api\/health"\)/);
  assert.match(workspace, /mahoragaApiUrl\("\/api\/runtime\/login"\)/);
});

test("encrypted recovery transport remains independent from the cloud API origin", async () => {
  const relay = await readApp("lib/runtime-relay.ts");
  assert.match(relay, /wss:\/\/mahoraga-relay\.mahoraga-mjw0123\.workers\.dev\/pair/);
  assert.doesNotMatch(relay, /RELAY_ORIGIN\s*=\s*mahoragaApiUrl/);
});

test("Pages workflow injects only the public API origin and no Railway launcher target", async () => {
  const workflow = await readRepo(".github/workflows/pages.yml");
  assert.match(workflow, /NEXT_PUBLIC_MAHORAGA_API_ORIGIN/);
  assert.doesNotMatch(workflow, /MAHORAGA_CANONICAL_WORKSPACE_URL/);
});


test("public health request does not send cross-origin credentials", async () => {
  const workspace = await readApp("components/workspace.tsx");
  assert.match(workspace, /fetch\(mahoragaApiUrl\("\/api\/health"\), \{ cache: "no-store" \}\)/);
});
