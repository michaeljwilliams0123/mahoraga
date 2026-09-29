import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cockpitView = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
const commandCockpit = readFileSync(join(root, "components/cockpit/CommandCockpit.tsx"), "utf8");

describe("universal reach interaction truth UI", () => {
  it("surfaces the multimodal interaction envelope as additive observational context", () => {
    assert.match(cockpitView, /Universal interaction envelope/);
    assert.match(cockpitView, /text · structured · file · image · audio · video · event/);
    assert.match(cockpitView, /cannot create a provider route or widen authority/i);
    assert.match(commandCockpit, /UNIVERSAL_INTERACTION_OBS/);
    assert.match(commandCockpit, /interaction context is additive/i);
  });

  it("keeps locale, timezone, direction, accessibility, and device context presentation-only", () => {
    assert.match(cockpitView, /Locale · timezone · RTL/);
    assert.match(cockpitView, /presentation only · not identity or authority/i);
    assert.match(cockpitView, /phone · tablet · desktop · embedded · headless/);
    assert.match(cockpitView, /Accessibility-first/);
    assert.match(commandCockpit, /ACCESSIBILITY_FIRST/);
    assert.doesNotMatch(cockpitView, /disability profile/i);
  });

  it("separates execution completion from degraded or offline delivery", () => {
    assert.match(cockpitView, /Execution ≠ delivery/);
    assert.match(cockpitView, /online · degraded · offline/);
    assert.match(cockpitView, /delivery retry never re-executes/i);
    assert.match(commandCockpit, /DELIVERY_SEPARATE/);
  });

  it("surfaces protocol negotiation and one receipt lineage without authority drift", () => {
    assert.match(cockpitView, /native · HTTP\/JSON · MCP · webhook · SSE · WebSocket · queue/);
    assert.match(cockpitView, /Omnichannel ingress → interaction → negotiation → execution → delivery/);
    assert.match(commandCockpit, /PROTOCOL_NEGOTIATION_OBS/);
    assert.match(commandCockpit, /RECEIPT_LINEAGE_OBS/);
    assert.match(commandCockpit, /GitHub Pages remains presentation-only/i);
  });

  it("keeps translation and transcription derivatives bound to source provenance", () => {
    assert.match(cockpitView, /Translation · transcription · transformation provenance/);
    assert.match(cockpitView, /derivatives retain source fingerprints/i);
    assert.match(commandCockpit, /TRANSFORM_PROVENANCE_OBS/);
  });

  it("preserves Mahoraga identity and provenance-only build versioning", () => {
    assert.match(cockpitView, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.match(commandCockpit, /Mahoraga workspace/);
    assert.doesNotMatch(commandCockpit, /Mahoraga 7\.0\.0-alpha\.2 workspace/);
    assert.doesNotMatch(cockpitView, /traffic authority.*granted by.*interaction/i);
  });
});
