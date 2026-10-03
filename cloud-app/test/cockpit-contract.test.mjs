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

  it("surfaces #486 owner-login no-store status on the rendered Control Center", () => {
    const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
    assert.match(cockpit, /AUTH_NO_STORE_#486/);
    assert.match(cockpit, /Owner login/);
    assert.match(cockpit, /Cache-Control: no-store/);
    assert.match(cockpit, /failure and success responses are not cached/);
  });

  it("surfaces canonical zero-credit admission without implying paid fallback", () => {
    const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
    assert.match(cockpit, /projectZeroCreditAdmission/);
    assert.match(cockpit, /Zero-credit answers/);
    assert.match(cockpit, /zeroCredit\.state === "allow" \? "Admitted"/);
    assert.match(cockpit, /zeroCredit\.state === "deny" \? "Denied" : "On hold"/);
    assert.match(cockpit, /no paid fallback/);
    assert.match(cockpit, /verification unavailable/);
  });

  it("renders the persisted canonical authority decision on the Work surface", () => {
    const work = readFileSync(join(root, "components/workspace/work-view.tsx"), "utf8");
    const relay = readFileSync(join(root, "lib/runtime-relay.ts"), "utf8");
    assert.match(work, /Canonical routing receipt/);
    assert.match(work, /authority\?\.envelope\.kind/);
    assert.match(work, /authority\?\.envelope\.decision/);
    assert.match(work, /authority\?\.envelope\.reasonCodes/);
    assert.match(work, /No routed task has persisted an authority decision yet/);
    assert.match(relay, /kind: "authority-decision-v1"/);
    assert.doesNotMatch(work, /evidence\.ownerAuthority|evidence\.providerAdmission/);
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
    assert.match(cockpit, /Direction → Compile → Delta → Verify → Learn/);
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

  it("keeps the single public identity Mahoraga across the hero and control center", () => {
    const chat = readFileSync(join(root, "components/workspace/chat-view.tsx"), "utf8");
    assert.match(chat, /one-kicker">Mahoraga</);
    assert.doesNotMatch(chat, /Mahoraga One/);
  });

  it("distinguishes a healthy published shell from a paired execution core", () => {
    const workspace = readFileSync(join(root, "components/workspace.tsx"), "utf8");
    const chat = readFileSync(join(root, "components/workspace/chat-view.tsx"), "utf8");
    const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
    assert.match(workspace, /deriveBrainRouteState\(coreReady, runtimeCapabilities, runtimeError\)/);
    assert.match(workspace, /routeReadiness === "degraded"/);
    assert.match(workspace, /routeReadiness === "ready"/);
    assert.match(chat, /Ready to pair/);
    assert.match(cockpit, /Workspace published/);
    assert.match(cockpit, /No execution authority claimed/);
  });

  it("describes the live evolution lane as verified canary-backed convergence", () => {
    const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
    assert.match(cockpit, /Verified convergence/);
    assert.match(cockpit, /Stage → verify → canary → pin → converge/);
    assert.match(cockpit, /Verified convergence path/);
    assert.match(cockpit, /Expected SHA pin/);
    assert.match(cockpit, /MAHORAGA_EXPECTED_GIT_SHA/);
    assert.match(cockpit, /Exact-head CI plus rollback checkpoint/);
    assert.match(cockpit, /Prove candidate and runtime readiness/);
    assert.match(cockpit, /Deploy and accept exact main on Cloudflare after both Verify contexts pass/);
    assert.match(cockpit, /Activate through the verified boundary and retain rollback/);
    assert.doesNotMatch(cockpit, /Owner-authorized merge and deployment/);
  });

  it("keeps bot-triggered publication actor-gated, observational, and receipt-bound", () => {
    const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
    const card = readFileSync(join(root, "components/cockpit/BotPushPublicationCard.tsx"), "utf8");
    const lifecycle = readFileSync(join(root, "..", ".github/workflows/cloudflare-lifecycle-evaluation.yml"), "utf8");

    assert.match(cockpit, /BotPushPublicationCard/);
    assert.match(card, /Eligible only · observational/);
    assert.match(card, /github-actions\[bot\]/);
    assert.match(card, /Owner\/manual pushes remain separately governed/);
    assert.match(card, /Cloudflare acceptance remains receipt-bound/);
    assert.match(card, /Railway remains zero-route, zero-influence, zero-fallback, and zero-authority/);
    assert.match(lifecycle, /github\.event\.workflow_run\.actor\.login == 'github-actions\[bot\]'/);
    assert.match(lifecycle, /github\.event\.workflow_run\.event == 'push'/);
    assert.match(lifecycle, /github\.event\.workflow_run\.head_branch == 'main'/);
    assert.doesNotMatch(card, /traffic authority granted|production cutover complete/i);
  });

  it("binds rendered Pages frame limits to the canonical Cloudflare frame implementation", async () => {
    const { PAGES_FRAME_CONTRACT_SURFACE, pagesFrameContractDetail } = await import("../lib/pages-frame-contract-surface.ts");
    const card = readFileSync(join(root, "components/cockpit/PagesFrameContractCard.tsx"), "utf8");
    const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
    const commandCockpit = readFileSync(join(root, "components/cockpit/CommandCockpit.tsx"), "utf8");
    const gatewayFrame = readFileSync(join(root, "..", "deploy/cloudflare-owner-gateway/bridge-frame.ts"), "utf8");
    const bridgeClient = readFileSync(join(root, "lib/pages-owner-bridge-client.ts"), "utf8");
    const detail = pagesFrameContractDetail();

    assert.equal(PAGES_FRAME_CONTRACT_SURFACE.bodyCapBytes, 32768);
    assert.equal(PAGES_FRAME_CONTRACT_SURFACE.abortDeadlineMs, 60000);
    assert.equal(PAGES_FRAME_CONTRACT_SURFACE.trafficAuthority, false);
    assert.equal(PAGES_FRAME_CONTRACT_SURFACE.replayAllowed, false);
    assert.deepEqual([...PAGES_FRAME_CONTRACT_SURFACE.actionFields], ["protocolVersion", "requestId", "type", "action", "payload"]);

    assert.match(detail, /32 KiB serialized action-body cap/);
    assert.match(detail, /60-second abort/);
    assert.match(detail, /exact action fields: protocolVersion, requestId, type, action, payload/);
    assert.match(detail, /observational only—not a private owner-browser transaction or traffic authority/);

    assert.match(gatewayFrame, /exact\(value, \[\.\.\.base,"action","payload"\]\)/);
    assert.match(gatewayFrame, /byteLength > 32768/);
    assert.match(gatewayFrame, /setTimeout\(\(\) => \{ reject\(new Error\("cloud-request-timeout"\)\); controller\.abort\(\); \}, 60000\)/);
    assert.match(gatewayFrame, /response\.status === 401 \|\| response\.status === 403/);
    assert.match(gatewayFrame, /authenticated = false; throw new Error\("cloud-owner-auth-required"\)/);
    assert.match(gatewayFrame, /WORKSPACE_ORIGINS\.has\(event\.origin\)/);
    assert.match(gatewayFrame, /event\.source !== window\.parent/);
    assert.match(bridgeClient, /ACTION_TIMEOUT_MS = 60_000/);

    assert.match(card, /pagesFrameContractDetail\(\)/);
    assert.match(card, /Source-bound \/ observational/);
    assert.match(cockpit, /<PagesFrameContractCard \/>/);
    assert.match(commandCockpit, /PAGES_FRAME_CONTRACT_OBS/);
    assert.match(commandCockpit, /OWNER_AUTH_REQUIRED_BOUNDED/);
    assert.doesNotMatch(`${card}\n${detail}`, /traffic authority granted|production cutover complete/i);
  });
});
