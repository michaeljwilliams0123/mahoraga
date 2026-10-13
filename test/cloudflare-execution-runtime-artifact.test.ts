import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL("../.github/workflows/cloudflare-execution-runtime.yml", import.meta.url);

test("Cloudflare exact-head acceptance retains its sanitized receipt artifact", async () => {
  const workflow = await readFile(workflowUrl, "utf8");
  assert.match(workflow, /actions\/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9/);
  assert.match(workflow, /name:\s*cloudflare-execution-runtime-acceptance-/);
  assert.match(workflow, /path:\s*reports\/cloudflare-execution-runtime-acceptance\.json/);
  assert.match(workflow, /retention-days:\s*7/);
  assert.match(workflow, /if-no-files-found:\s*error/);
});
