import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowPath = path.join(root, ".github/workflows/cloudflare-execution-runtime.yml");

test("provider admission renewal keeps liveness margin under scheduler jitter", async () => {
  const workflow = await readFile(workflowPath, "utf8");

  assert.match(
    workflow,
    /schedule:\s*\n\s*- cron:\s*"2,7,12,17,22,27,32,37,42,47,52,57 \* \* \* \*"/,
    "external renewal watchdog must receive five-minute opportunities away from top-of-hour contention",
  );
  assert.match(
    workflow,
    /group:\s*mahoraga-cloudflare-execution-runtime-\$\{\{ github\.event_name == 'schedule' && 'renewal' \|\| 'deploy' \}\}/,
    "scheduled renewal must not share the deploy concurrency lane",
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
  assert.match(renewalBlock, /fetch-depth:\s*1/, "renewal needs only the authoritative commit, not full history");
  assert.doesNotMatch(renewalBlock, /fetch-depth:\s*0/, "renewal must not fetch all branches and tags");
});
