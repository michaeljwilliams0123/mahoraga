import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const card = readFileSync(join(root, "components/cockpit/NativeAppCloudflarePublicationCard.tsx"), "utf8");
const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");

describe("native App verified-main Cloudflare publication UI", () => {
  it("surfaces observational StatusCard for mahoraga-native-pr-operator[bot] verified-main path", () => {
    assert.match(card, /mahoraga-native-pr-operator\[bot\]/);
    assert.match(card, /Verified-main path admitted/);
    assert.match(card, /observational/);
    assert.match(card, /does not grant traffic authority/);
    assert.match(card, /Manual workflow_dispatch continues to be rejected/);
    assert.match(card, /Product remains Mahoraga/);
    assert.match(card, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.match(cockpit, /import \{ NativeAppCloudflarePublicationCard \}/);
    assert.match(cockpit, /<NativeAppCloudflarePublicationCard \/>/);
  });
});
