import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const card = readFileSync(new URL("../components/cockpit/BotAuthorityParityCard.tsx", import.meta.url), "utf8");
const cockpit = readFileSync(new URL("../components/cockpit/CockpitView.tsx", import.meta.url), "utf8");
const command = readFileSync(new URL("../components/cockpit/CommandCockpit.tsx", import.meta.url), "utf8");

test("7.0.0-alpha.2 cockpit surfaces bot authority parity as observational only", () => {
  assert.match(card, /Bot authority parity/);
  assert.match(card, /fail-closed/);
  assert.match(card, /non-delegable/);
  assert.match(card, /7\.0\.0-alpha\.2 is build provenance only/);
  assert.match(card, /no Railway or traffic-authority change/);
  assert.doesNotMatch(card, /bot == owner/);
  assert.match(cockpit, /BotAuthorityParityCard/);
  assert.match(command, /BOT_AUTHORITY_PARITY_OBS/);
  assert.doesNotMatch(cockpit, /<h2>7\.0\.0-alpha\.2/);
});
