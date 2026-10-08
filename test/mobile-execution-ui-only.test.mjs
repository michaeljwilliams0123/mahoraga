import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = p => readFileSync(join(root, p), "utf8");
test("mobile owner cockpit shows real route state and read-only limits without fake availability", () => {
  const chat = read("cloud-app/components/workspace/chat-view.tsx");
  const css = read("cloud-app/app/globals.css");
  const family = read("cloud-app/lib/capability-families.ts");
  assert.match(chat, /Every verified route/);
  assert.match(chat, /capabilityObservation\?\.phase === "ready" \? runtimeCapabilities : \[\]/);
  assert.match(chat, /data-testid="execution-provider-gap"/);
  assert.match(chat, /Action workers not connected/);
  assert.match(chat, /data-testid="execution-inspection-only"/);
  assert.match(chat, /Writing, deploying, browser control and desktop execution still require/);
  assert.match(chat, /onClick=\{onRefreshCapabilities\}/);
  assert.match(chat, /<details className="route-diagnostics">/);
  assert.match(chat, /inspectOnly \? "Inspect only"/);
  assert.match(family, /"cloud.inspect"/);
  assert.match(family, /"repository\.write"/);
  assert.match(family, /id === "execution"/);
  assert.match(css, /\.capability-family-summary \{ grid-template-columns: repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /\.one-composer textarea \{ min-height: 46px; padding: 12px 12px 6px; font-size: 16px;/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
});

test("UI-first deployment does not create an unaccepted broker/provider Worker", () => {
  const broker = JSON.parse(read("deploy/cloudflare-execution-broker/wrangler.jsonc"));
  const runtime = JSON.parse(read("deploy/cloudflare-execution-runtime/wrangler.jsonc"));
  const workflow = read(".github/workflows/cloudflare-execution-runtime.yml");
  assert.equal(broker.services, undefined, "UI change must not add unproven provider bindings");
  assert.ok(runtime.services.some(binding => binding.binding === "MAHORAGA_EXECUTION_BROKER"));
  assert.doesNotMatch(workflow, /Deploy read-only Cloudflare runtime inspection provider/);
  assert.match(read("cloud-app/components/workspace/chat-view.tsx"), /Action workers not connected/);
});
