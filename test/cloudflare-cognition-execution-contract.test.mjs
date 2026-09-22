import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workerUrl = new URL("../deploy/cloudflare-execution-runtime/worker.ts", import.meta.url);

// Regression for migration gate #697: transport/idempotency success must never be
// recorded as cognition success unless the admitted provider actually executes.
test("Cloudflare execution runtime cannot synthesize SUCCESS by echoing the request payload", async () => {
  const source = await readFile(workerUrl, "utf8");

  assert.doesNotMatch(
    source,
    /executed:\s*true,[\s\S]{0,200}data:\s*payload/,
    "transport-only payload echo is not cognition and must not produce a SUCCESS execution receipt",
  );

  assert.match(
    source,
    /provider|AssistantProvider|executeAssistantTurn/,
    "assistant execution must remain explicitly provider-bound",
  );
});
