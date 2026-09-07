import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("singular control center contract", () => {
  it("registers Control Center in workspace nav", () => {
    const types = readFileSync(join(root, "components/workspace/workspace-types.ts"), "utf8");
    assert.match(types, /"cockpit"/);
    assert.match(types, /label: "Control Center"/);
    assert.doesNotMatch(types, /label: "Cockpit"/);
  });

  it("keeps operator-deck pure helpers available as a non-authoritative reference layer", () => {
    const bridge = readFileSync(join(root, "lib/cockpit.ts"), "utf8");
    assert.match(bridge, /operator-deck\/src\/lib\/cockpit\/types/);
    assert.match(bridge, /operator-deck\/src\/lib\/cockpit\/health/);
    assert.doesNotMatch(bridge, /automation-adapter/);
    assert.doesNotMatch(bridge, /panels/);
  });

  it("wires final Control Center and Connections into the single workspace", () => {
    const workspace = readFileSync(join(root, "components/workspace.tsx"), "utf8");
    assert.match(workspace, /CockpitView/);
    assert.match(workspace, /view === "cockpit"/);
    assert.match(workspace, /ConnectionsView/);
    assert.match(workspace, /view === "connections"/);
    assert.doesNotMatch(workspace, /function placeholder\(/);
  });

  it("keeps the final Control Center observational and core-mediated", () => {
    const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
    assert.match(cockpit, /Control Center/);
    assert.match(cockpit, /runtimeCapabilities/);
    assert.match(cockpit, /automaticPaidFallback/);
    assert.match(cockpit, /onOpenOperations/);
    assert.doesNotMatch(cockpit, /CommandCockpit|LocalChatSidebar|127\.0\.0\.1:11434|api\.github\.com/);
  });
});
