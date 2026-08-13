import test from "node:test";
import assert from "node:assert/strict";
import { loadManifest } from "../src/config.mjs";
import { scanRepairState } from "../src/repair.mjs";

test("release baseline covers every essential production file", async () => {
  const manifest = await loadManifest();
  const scan = await scanRepairState(manifest);
  assert.equal(scan.healthy, true, JSON.stringify(scan.issues));
});
