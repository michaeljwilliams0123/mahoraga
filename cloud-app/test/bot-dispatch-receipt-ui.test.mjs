import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const card = readFileSync(join(root, "components/cockpit/BotDispatchReceiptCard.tsx"), "utf8");
const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
const command = readFileSync(join(root, "components/cockpit/CommandCockpit.tsx"), "utf8");
const validator = readFileSync(join(root, "..", "scripts/verified-main-publication.ts"), "utf8");
const verify = readFileSync(join(root, "..", ".github/workflows/verify.yml"), "utf8");

describe("bot dispatch receipt-bound publication UI", () => {
  it("keeps the card observational and does not claim a live receipt", () => {
    assert.match(card, /data-testid="bot-dispatch-receipt"/);
    assert.match(card, /Receipt-bound · observational/);
    assert.match(card, /does not claim a live receipt has been observed/);
    assert.match(card, /Actor identity alone is not authority/);
    assert.match(card, /Owner-triggered publication and bot push verification remain separately governed/);
    assert.match(card, /does not grant traffic authority/);
    assert.match(card, /Railway remains zero-route, zero-influence, zero-fallback, and zero-authority/);
    assert.doesNotMatch(card, /receipt observed|publication complete|traffic authority granted/i);
  });

  it("locks copy to the verified-main-publication receipt chain", () => {
    assert.match(card, /verified-main-publication-v1/);
    assert.match(card, /Autonomous Integration/);
    assert.match(card, /\.github\/workflows\/autonomous-integration\.yml/);
    assert.match(card, /github-actions\[bot\]/);
    assert.match(card, /workflow_dispatch/);
    assert.match(card, /Missing, duplicate, expired, malformed, foreign, or stale receipts fail closed/);
    assert.match(validator, /kind !== 'verified-main-publication-v1'/);
    assert.match(validator, /sourceWorkflow !== 'Autonomous Integration'/);
    assert.match(validator, /actor === BOT && run.event === 'workflow_dispatch'/);
    assert.match(verify, /publication_source_run_id/);
    assert.match(verify, /autonomous-main-publication-/);
  });

  it("wires the receipt rule into both cockpits without granting authority", () => {
    assert.match(cockpit, /BotDispatchReceiptCard/);
    assert.match(command, /BotDispatchReceiptCard/);
    assert.match(command, /RECEIPT_BOUND_DISPATCH/);
    assert.doesNotMatch(cockpit, /CommandCockpit/);
  });
});
