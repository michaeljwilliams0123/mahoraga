import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("singular control center contract", () => {
  it("keeps Control Center behind the Advanced drill-down", () => {
    const types = readFileSync(join(root, "components/workspace/workspace-types.ts"), "utf8");
    assert.match(types, /"advanced"/);
    assert.match(types, /label: "Advanced"/);
    assert.doesNotMatch(types, /label: "Cockpit"/);
  });

  it("keeps operator-deck pure helpers available as a non-authoritative reference layer", () => {
    const bridge = readFileSync(join(root, "lib/cockpit.ts"), "utf8");
    assert.match(bridge, /operator-deck\/src\/lib\/cockpit\/types/);
    assert.match(bridge, /operator-deck\/src\/lib\/cockpit\/health/);
    assert.doesNotMatch(bridge, /automation-adapter/);
    assert.doesNotMatch(bridge, /panels/);
  });

  it("wires Control Center, Operations, and Connections inside Advanced", () => {
    const workspace = readFileSync(join(root, "components/workspace.tsx"), "utf8");
    assert.match(workspace, /CockpitView/);
    assert.match(workspace, /view === "advanced"/);
    assert.match(workspace, /ConnectionsView/);
    assert.match(workspace, /OperationsView/);
    assert.match(workspace, /Deep control center/);
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

  it("surfaces the governed Copilot Studio admission contract without claiming live ingestion", () => {
    const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
    assert.match(cockpit, /Copilot Studio learning/);
    assert.match(cockpit, /staged admission contract/);
    assert.match(cockpit, /runtime ingestion inactive/);
    assert.match(cockpit, /copilot-studio-mahoraga/);
    assert.match(cockpit, /verified \+ approved metadata only/);
    assert.match(cockpit, /non-authoritative evidence plane/);
    assert.doesNotMatch(cockpit, /raw prompts|tenant IDs|credentials/);
  });

  it("distinguishes a healthy published shell from a paired execution core", () => {
    const workspace = readFileSync(join(root, "components/workspace.tsx"), "utf8");
    const chat = readFileSync(join(root, "components/workspace/chat-view.tsx"), "utf8");
    const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
    assert.match(workspace, /relayState === "error" \? "Degraded" : "Ready"/);
    assert.match(chat, /Ready to pair/);
    assert.match(cockpit, /Workspace published/);
    assert.match(cockpit, /No execution authority claimed/);
    assert.match(cockpit, /Stage → verify → review → promote/);
  });


});
