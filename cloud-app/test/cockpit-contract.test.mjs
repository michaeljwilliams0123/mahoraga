import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("cockpit pressure-test contract", () => {
  it("registers cockpit in workspace nav", () => {
    const types = readFileSync(join(root, "components/workspace/workspace-types.ts"), "utf8");
    assert.match(types, /"cockpit"/);
    assert.match(types, /label: "Cockpit"/);
  });

  it("re-exports pure Deck helpers only", () => {
    const bridge = readFileSync(join(root, "lib/cockpit.ts"), "utf8");
    assert.match(bridge, /operator-deck\/src\/lib\/cockpit\/types/);
    assert.match(bridge, /operator-deck\/src\/lib\/cockpit\/health/);
    assert.doesNotMatch(bridge, /automation-adapter/);
    assert.doesNotMatch(bridge, /panels/);
  });

  it("wires CockpitView into workspace shell", () => {
    const workspace = readFileSync(join(root, "components/workspace.tsx"), "utf8");
    assert.match(workspace, /CockpitView/);
    assert.match(workspace, /view === "cockpit"/);
  });

  it("keeps gateway cards fail-closed for OAuth and fake rollback", () => {
    const cockpit = readFileSync(join(root, "components/cockpit/CommandCockpit.tsx"), "utf8");
    assert.match(cockpit, /HARD_DENIES\.googleOAuthOnConsole/);
    assert.match(cockpit, /HARD_DENIES\.fakeRollbackApi/);
    assert.match(cockpit, /TelemetrySparkline/);
    assert.match(cockpit, /COCKPIT_PANEL_IDS/);
  });
});
