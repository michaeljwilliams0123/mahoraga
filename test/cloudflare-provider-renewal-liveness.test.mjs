import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowPath = path.join(root, ".github/workflows/cloudflare-provider-renewal.yml");

test("provider admission renewal keeps liveness margin under scheduler jitter", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.doesNotMatch(
    workflow,
    /schedule:|cron:/,
    "GitHub Actions must not own provider admission liveness; the gateway Worker cron trigger does",
  );
  assert.match(workflow, /workflow_dispatch:/, "manual break-glass renewal remains available");
  assert.match(
    workflow,
    /group:\s*mahoraga-cloudflare-provider-renewal/,
    "dedicated renewal workflow must not share the deploy concurrency lane",
  );

  const renewalJob = workflow.indexOf("renew-provider-admission:");
  assert.ok(renewalJob >= 0, "renewal job must exist");
  const renewalBlock = workflow.slice(renewalJob);
  assert.match(renewalBlock, /RENEWAL_MARGIN_MS:\s*1800000/, "renewal must preserve a 30-minute freshness margin");
  assert.match(renewalBlock, /id:\s*freshness/, "renewal must inspect current runtime freshness before billing proof");
  assert.match(renewalBlock, /provider-freshness-sufficient/, "fresh admissions must be able to skip re-attestation");
  assert.equal(
    (renewalBlock.match(/if:\s*steps\.freshness\.outputs\.renewal_required == 'true'/g) ?? []).length,
    2,
    "billing proof and provider refresh must run only when the freshness margin requires renewal",
  );
  assert.match(renewalBlock, /timeout-minutes:\s*10/, "scheduled renewal must finish as a short one-shot check");
  assert.doesNotMatch(renewalBlock, /WATCHDOG_INTERVAL_MS|WATCHDOG_DURATION_MS|cloudflare-provider-renewal-watchdog\.mjs/);
  assert.match(renewalBlock, /fetch-depth:\s*1/, "renewal needs only the authoritative commit, not full history");
  assert.doesNotMatch(renewalBlock, /fetch-depth:\s*0/, "renewal must not fetch all branches and tags");
});
