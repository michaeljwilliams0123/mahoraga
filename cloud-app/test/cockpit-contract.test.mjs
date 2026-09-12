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

  it("keeps public product identity Mahoraga and treats 7.0.0-alpha.2 as build provenance only", () => {
    const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
    const types = readFileSync(join(root, "components/workspace/workspace-types.ts"), "utf8");
    assert.match(cockpit, /productName = health\?\.product \?\? "Mahoraga"/);
    assert.match(cockpit, /Build provenance/);
    assert.match(cockpit, /buildVersion = health\?\.build\?\.version \?\? health\?\.version \?\? "unavailable"/);
    assert.match(types, /build\?: \{ version\?: string \}/);
    assert.doesNotMatch(cockpit, /<h2>7\.0\.0-alpha\.2/);
  });

  it("surfaces bounded Studio truth and the adaptive review loop", () => {
    const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
    assert.match(cockpit, /Copilot Studio learning/);
    assert.match(cockpit, /ingestion bridge available/);
    assert.match(cockpit, /paired-core readiness determines live ingestion/);
    assert.doesNotMatch(cockpit, /runtime ingestion inactive/);
    assert.match(cockpit, /managementPlaneReady/);
    assert.match(cockpit, /delegationRuntimeReady/);
    assert.match(cockpit, /management-ready \/ delegation-unavailable/);
    assert.match(cockpit, /not fully available/);
    assert.match(cockpit, /no widened studio\.delegate authority/);
    assert.match(cockpit, /copilot-studio-mahoraga/);
    assert.match(cockpit, /verified \+ approved metadata only/);
    assert.match(cockpit, /Direction (->|->) Compile (->|->) Delta (->|->) Verify (->|->) Learn/);
    assert.match(cockpit, /selective institutional memory/i);
    assert.doesNotMatch(cockpit, /live ingestion is active/);
    assert.doesNotMatch(cockpit, /Studio is fully available/);
    assert.doesNotMatch(cockpit, /raw prompts|tenant IDs|credentials/);
  });

  it("surfaces only a bounded runtime database target diagnostic", () => {
    const route = readFileSync(join(root, "app/api/health/route.ts"), "utf8");
    const types = readFileSync(join(root, "components/workspace/workspace-types.ts"), "utf8");
    const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
    assert.match(route, /path\.basename\(configured\)/);
    assert.match(route, /databaseTarget/);
    assert.match(types, /databaseTarget/);
    assert.match(types, /managementPlaneReady/);
    assert.match(types, /delegationRuntimeReady/);
    assert.match(cockpit, /Runtime DB target/);
    assert.doesNotMatch(cockpit, /connection string|password|secret/i);
  });

  it("projects host-local convergence receipts through the 7.0.0-alpha.2 health contract", () => {
    const route = readFileSync(join(root, "app/api/health/route.ts"), "utf8");
    const types = readFileSync(join(root, "components/workspace/workspace-types.ts"), "utf8");
    const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
    assert.match(route, /version:\s*"7\.0\.0-alpha\.2"/);
    assert.match(route, /host-local-receipt/);
    assert.match(route, /convergence:/);
    assert.match(types, /convergence\?: \{ receipts\?: ConvergenceReceipt\[\] \}/);
    assert.match(cockpit, /Convergence receipt/);
    assert.match(cockpit, /Expected source commit/);
    assert.match(cockpit, /host-local/);
    assert.doesNotMatch(cockpit, /connection string|password|secret/i);
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
