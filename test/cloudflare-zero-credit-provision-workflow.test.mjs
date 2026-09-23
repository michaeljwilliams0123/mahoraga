import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL("../.github/workflows/provision-cloudflare-zero-credit.yml", import.meta.url);

test("zero-credit account provisioning is standalone, idempotent, and cannot change the existing account", async () => {
  const workflow = await readFile(workflowUrl, "utf8");
  assert.match(workflow, /standalone:true/);
  assert.match(workflow, /Idempotency-Key/);
  assert.match(workflow, /Mahoraga Zero-Credit/);
  assert.match(workflow, /secrets\.CLOUDFLARE_API_TOKEN/);
  assert.match(workflow, /GET|--request POST/);
  assert.doesNotMatch(workflow, /subscriptions\/.+DELETE|accounts\/.+DELETE|workers\/scripts\/.+DELETE/i);
  assert.doesNotMatch(workflow, /CLOUDFLARE_ACCOUNT_ID/);
});
