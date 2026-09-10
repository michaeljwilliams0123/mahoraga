import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");

test("OCI production profile is durable, always on, and bounded by health checks", async () => {
  const [dockerfile, fly, service] = await Promise.all([read("Dockerfile.cloud"), read("deploy/fly/fly.toml"), read("scripts/cloud-service.mjs")]);
  assert.match(dockerfile, /VOLUME \["\/var\/lib\/mahoraga"\]/);
  assert.match(dockerfile, /\/api\/ready/);
  assert.match(fly, /auto_stop_machines = "off"/);
  assert.match(fly, /min_machines_running = 1/);
  assert.match(fly, /destination = "\/var\/lib\/mahoraga"/);
  assert.match(service, /modelInvocations: 0/);
  assert.match(service, /restartHistory/);
  assert.match(service, /supervisor-circuit-open/);
  assert.doesNotMatch(service, /openai|anthropic|generateText|chat\.completions/i);
});

test("cloud runtime keeps core loopback-only and secrets in server environment", async () => {
  const [service, gateway, action, edge] = await Promise.all([read("scripts/cloud-service.mjs"), read("cloud-app/lib/cloud-owner-gateway.ts"), read("cloud-app/app/api/runtime/action/route.ts"), read("deploy/cloudflare-owner-gateway/worker.mjs")]);
  assert.match(service, /127\.0\.0\.1:4782/);
  assert.match(service, /const stateRoot = "\/var\/lib\/mahoraga"/);
  assert.match(service, /127\.0\.0\.1:3000\/api\/live/);
  assert.doesNotMatch(service, /process\.env\.(?:MAHORAGA_STATE_DIR|MAHORAGA_DATABASE_FILE|MAHORAGA_ARTIFACT_ROOT|MAHORAGA_CONTENT_VAULT_ROOT|MAHORAGA_CORE_URL|PORT)/);
  assert.match(gateway, /MAHORAGA_PRIMARY_CODEX_TOKEN/);
  assert.match(gateway, /CORE_GATEWAY_URL = "http:\/\/127\.0\.0\.1:4782\/api\/cloud\/runtime"/);
  assert.doesNotMatch(gateway, /MAHORAGA_CORE_URL/);
  assert.doesNotMatch(gateway, /process\.env\.MAHORAGA_STATE_DIR/);
  assert.match(gateway, /MAHORAGA_CLOUD_SESSION_SECRET/);
  assert.match(gateway, /MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET/);
  assert.match(gateway, /x-mahoraga-owner-signature/);
  assert.match(gateway, /timingSafeEqual/);
  assert.match(gateway, /request_nonces/);
  assert.match(action, /cloud-action-not-allowed/);
  assert.match(edge, /cf-access-authenticated-user-email/);
  assert.match(edge, /crypto\.subtle\.sign\("HMAC"/);
  assert.doesNotMatch(action, /child_process|exec\(|spawn\(|port.forward|reverse.shell/i);
});

test("objective release uses explicit injection rather than method monkey-patching", async () => {
  const source = await read("src/objective-release-authority.mjs");
  assert.match(source, /configureObjectiveReleaseAuthority/);
  assert.doesNotMatch(source, /database\.(submitTask|reconcileObjectives|listObjectives)\s*=/);
});
