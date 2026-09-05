import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";

const file = path.join(ROOT, ".github", "workflows", "chromebook-control-plane.yml");

test("Chromebook control plane stays retired so Verify does not require a deleted workflow", async () => {
  await assert.rejects(() => access(file), /ENOENT/);
});
