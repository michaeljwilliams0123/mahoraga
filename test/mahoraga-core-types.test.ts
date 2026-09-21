import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
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

test("edge convergence UI keeps source deployment and live-runtime truth separate", () => {
  const cockpit = readFileSync("cloud-app/components/cockpit/CockpitView.tsx", "utf8");
  const command = readFileSync("cloud-app/components/cockpit/CommandCockpit.tsx", "utf8");
  for (const label of ["Source Truth", "Deployment Truth", "Live-Runtime Truth"]) {
    assert.match(cockpit, new RegExp(label));
    assert.match(command, new RegExp(label));
  }
  assert.match(command, /A green observation in one plane does not manufacture evidence in another/);
  assert.match(command, /no new provider, deploy, credential, or mutation authority/);
});
