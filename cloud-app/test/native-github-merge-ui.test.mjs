import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const card = new URL("../components/cockpit/NativeGithubMergeCard.tsx", import.meta.url);
const mount = new URL("../components/cockpit/BotPushPublicationCard.tsx", import.meta.url);
const view = new URL("../components/cockpit/CockpitView.tsx", import.meta.url);

test("7.0.0-alpha.2 cockpit surfaces native GitHub merge as observational only", async () => {
  const [cardText, mountText, viewText] = await Promise.all([
    readFile(card, "utf8"),
    readFile(mount, "utf8"),
    readFile(view, "utf8"),
  ]);
  assert.match(cardText, /Native GitHub merge/);
  assert.match(cardText, /exact-SHA squash/);
  assert.match(cardText, /force stays false/);
  assert.match(cardText, /Merge #984 is not live traffic authority/);
  assert.match(cardText, /49da2670c239/);
  assert.match(cardText, /Product remains Mahoraga/);
  assert.match(cardText, /7\.0\.0-alpha\.2 is build provenance only/);
  assert.match(mountText, /NativeGithubMergeCard/);
  assert.match(viewText, /BotPushPublicationCard/);
  assert.doesNotMatch(cardText, /<h2>7\.0\.0-alpha\.2/);
  assert.doesNotMatch(cardText, /COMPOSIO_/);
});
