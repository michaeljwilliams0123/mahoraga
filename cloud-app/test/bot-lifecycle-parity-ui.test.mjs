import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const card = readFileSync(join(root, "components/cockpit/BotLifecycleParityCard.tsx"), "utf8");
const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");

describe("7.0.0-alpha.2 bot lifecycle parity UI", () => {
  it("keeps the card observational and fail-closed", () => {
    assert.match(card, /Bot lifecycle parity/);
    assert.match(card, /Observational \/ fail-closed/);
    assert.match(card, /CREATE_AND_RETIRE_DISPOSABLE_WORKERS/);
    assert.match(card, /Verify Mahoraga/);
    assert.match(card, /workflow_run/);
    assert.match(card, /generic github-actions workflow_dispatch/);
    assert.match(card, /Policy merge is not live mutation/);
    assert.match(card, /receipt-bound/);
    assert.match(card, /No Railway\/Vercel route or traffic authority/);
    assert.doesNotMatch(card, /<h2>7\.0\.0-alpha\.2/);
    assert.match(cockpit, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.match(cockpit, /productName = health\?\.product \?\? "Mahoraga"/);
  });
});
