import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { ErrorProfileCode } from "../src/types/mahoraga.ts";

test("Mahoraga convergence error codes remain stable", () => {
  assert.deepEqual(Object.values(ErrorProfileCode), [
    "ERR_MAHORAGA_AST_001",
    "ERR_MAHORAGA_COMP_002",
    "ERR_MAHORAGA_CPU_003",
    "ERR_MAHORAGA_MSFT_004",
    "ERR_MAHORAGA_UCF_005",
  ]);
});

test("protected verification executes the cloud brain-route regression", () => {
  const result = spawnSync(process.execPath, ["--test", "cloud-app/test/brain-route-state.test.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
