import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cockpit = readFileSync(join(root, "components/cockpit/CommandCockpit.tsx"), "utf8");

describe("7.0.0-alpha.2 CommandCockpit ready + Teams surface", () => {
  it("distinguishes live health from ready state after shared bearer injection", () => {
    assert.match(cockpit, /LIVE_OK/);
    assert.match(cockpit, /READY_ONLINE/);
    assert.match(cockpit, /READY_OFFLINE/);
    assert.match(cockpit, /parent supervisor injects a shared core bearer only when the configured token is blank/);
    assert.match(cockpit, /Bearer value is never shown/);
    assert.doesNotMatch(cockpit, /MAHORAGA_PRIMARY_CODEX_TOKEN\s*=/);
  });

  it("keeps attended Teams send observational with no browser send action", () => {
    assert.match(cockpit, /TEAMS_ATTENDED_OBS/);
    assert.match(cockpit, /Observational status only/);
    assert.match(cockpit, /No Graph, SendKeys, or discovery/);
    assert.match(cockpit, /No browser send action/);
    assert.match(cockpit, /Windows production stays 3\.6\.0/);
    assert.doesNotMatch(cockpit, /onClick=\{.*sendTeams/);
  });

  it("preserves CONVERGED_#460 language", () => {
    assert.match(cockpit, /CONVERGED_#460/);
    assert.match(cockpit, /7\.0\.0-alpha\.2/);
  });
});
