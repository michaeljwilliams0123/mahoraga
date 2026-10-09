import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("same universal Connections screen invokes cloud.inspect only through authenticated broker", () => {
  const client = read("lib/runtime-relay.ts");
  const connections = read("components/workspace/connections-view.tsx");
  const gateway = read("../deploy/cloudflare-owner-gateway/worker.mjs");
  const runtime = read("../deploy/cloudflare-execution-runtime/worker.ts");
  assert.match(client, /async inspectCloudflareDeployment\(\)/);
  assert.match(client, /if \(!this\.bridgeAuthenticated && !this\.cloudSession\) throw relayError\("cloud-inspection-owner-auth-required"\)/);
  assert.match(client, /this\.call<\{/);
  assert.match(client, /"execute", \{/);
  assert.match(client, /requiredCapability: "cloud\.inspect"/);
  assert.match(client, /requestedPermission: "read"/);
  assert.match(client, /authorityScopes: \["cloud:read"\]/);
  assert.match(client, /requireZeroCredit: true/);
  assert.match(client, /receipt\.verified !== true \|\| receipt\.readOnly !== true/);
  assert.match(connections, /cloudInspectReady = coreReady/);
  assert.match(connections, /item\.capability === "cloud\.inspect" && item\.routable/);
  assert.match(connections, /await relay\.inspectCloudflareDeployment\(\)/);
  assert.match(connections, /Inspect Cloudflare/);
  assert.match(gateway, /NATIVE_ACTIONS = new Set\(\["chat"/);
  assert.match(runtime, /input\?\.type === "execute"/);
  assert.doesNotMatch(connections, /CLOUDFLARE_AUDIT_TOKEN|GITHUB_APP_PRIVATE_KEY|api\.cloudflare\.com|localStorage/);
});
