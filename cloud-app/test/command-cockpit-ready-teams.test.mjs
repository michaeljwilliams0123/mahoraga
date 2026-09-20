import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cockpit = readFileSync(join(root, "components/cockpit/CommandCockpit.tsx"), "utf8");
const cockpitView = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");

describe("7.0.0-alpha.2 CommandCockpit ready + Teams surface", () => {
  it("distinguishes live health from ready state after shared bearer injection", () => {
    assert.match(cockpit, /LIVE_OK/);
    assert.match(cockpit, /READY_ONLINE/);
    assert.match(cockpit, /READY_OFFLINE/);
    assert.match(cockpit, /parent supervisor injects a shared core bearer only when the configured token is blank/);
    assert.match(cockpit, /Bearer value is never shown/);
    assert.match(cockpit, /PAIRING_CLEAR/);
    assert.match(cockpit, /Ready is live health plus paired core/);
    assert.doesNotMatch(cockpit, /MAHORAGA_PRIMARY_CODEX_TOKEN\s*=/);
  });

  it("keeps attended Teams send observational with no browser send action", () => {
    assert.match(cockpit, /TEAMS_ATTENDED_OBS/);
    assert.match(cockpit, /Observational status only/);
    assert.match(cockpit, /No Graph, SendKeys, or discovery/);
    assert.match(cockpit, /No browser send action/);
    assert.match(cockpit, /active Windows runtime.*observed through live core status/is);
    assert.match(cockpit, /legacy rollback predecessor.*3\.6\.0/is);
    assert.doesNotMatch(cockpit, /Windows production stays 3\.6\.0/);
    assert.doesNotMatch(cockpit, /onClick=\{.*sendTeams/);
  });

  it("presents one Mahoraga brain without user-facing runtime slot selection", () => {
    assert.match(cockpit, /Mahoraga workspace/);
    assert.match(cockpit, /build provenance/i);
    assert.match(cockpit, /authoritative runtime<\/dt><dd>Mahoraga core \(4782\)/i);
    assert.match(cockpit, /brain-routed; no lane or port selection required/i);
    assert.doesNotMatch(cockpit, /Mahoraga 7\.0\.0-alpha\.2 workspace/);
    assert.doesNotMatch(cockpit, /<dt>candidate<\/dt><dd>7\.0\.0-alpha\.2/);
    assert.doesNotMatch(cockpit, /live 3\.6\.0, candidate 7\.0\.0-alpha\.2/);
    assert.doesNotMatch(cockpit, /4783/);
  });

  it("surfaces the #550 same-origin mutation boundary without adding browser authority", () => {
    assert.match(cockpit, /ORIGIN_BOUNDARY_#550/);
    assert.match(cockpit, /same-origin only/i);
    assert.match(cockpit, /gateway-same-origin-required/);
    assert.match(cockpit, /trusted mutation origin is rewritten to the canonical Railway upstream/i);
    assert.match(cockpit, /Cloudflare owner gateway same-origin mutation boundary/i);
    assert.doesNotMatch(cockpit, /onClick=\{.*(?:gateway|origin).*mutation/i);
  });
  it("preserves CONVERGED_#460 language", () => {
    assert.match(cockpit, /CONVERGED_#460/);
    assert.match(cockpit, /7\.0\.0-alpha\.2/);
  });

  it("surfaces informational CI publish/steward self-hosted Linux/X64 copy", () => {
    assert.match(cockpit, /CI_LINUX_X64/);
    assert.match(cockpit, /self-hosted Linux\/X64/);
    assert.match(cockpit, /CI publish and steward jobs use the self-hosted Linux\/X64 lane/);
    assert.match(cockpitView, /self-hosted Linux\/X64/);
    assert.doesNotMatch(cockpit, /7\.0\.0-alpha\.2 on Windows/);
  });
});
