import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { projectInteractionTruth } from "../lib/interaction-truth.ts";
import { formatPresentationValue } from "../lib/presentation-format.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cockpitView = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
const commandCockpit = readFileSync(join(root, "components/cockpit/CommandCockpit.tsx"), "utf8");
const operationsView = readFileSync(join(root, "components/workspace/operations-view.tsx"), "utf8");
const interactionCards = readFileSync(join(root, "components/cockpit/InteractionTruthCards.tsx"), "utf8");

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

  it("mounts normalized live interaction truth on both cockpit surfaces and Operations", () => {
    assert.match(cockpitView, /<InteractionTruthCards truth=\{interactionTruth\}/);
    assert.match(commandCockpit, /<InteractionTruthCards truth=\{interactionTruth\}/);
    assert.match(commandCockpit, /INTERACTION_TRUTH_(?:OBSERVED|HOLD|ABSENT)/);
    assert.match(operationsView, /Interaction truth/);
    assert.match(operationsView, /Delivery truth/);
    assert.match(interactionCards, /aria-label=\{label\}/);
    assert.match(interactionCards, /delivery retry never re-executes/i);
  });
});


const observedInteraction = {
  status: "observed",
  interactionId: "int-123",
  sourceFamily: "owner",
  channelFamily: "control-center",
  modalities: ["file", "text"],
  protocolFamily: "http-json",
  protocolVersion: "1.0.0",
  locale: "en-US",
  timezone: "America/New_York",
  direction: "ltr",
  unitSystem: "us",
  currency: "USD",
  deviceClass: "desktop",
  networkClass: "online",
  executionStatus: "completed",
  interactionFingerprint: "sha256:interaction",
  negotiationFingerprint: "sha256:negotiation",
  executionFingerprint: "sha256:execution",
  observedAt: "2026-09-29T21:00:00.000Z",
};

const observedDelivery = {
  status: "delivered",
  interactionId: "int-123",
  taskId: "task-123",
  chainId: "chain-123",
  outputReferences: ["artifact:result-123"],
  deliveryFingerprint: "sha256:delivery",
  observedAt: "2026-09-29T21:01:00.000Z",
};

describe("normalized interaction and delivery truth", () => {
  it("projects a bounded observed receipt chain without granting authority", () => {
    const truth = projectInteractionTruth({ interaction: observedInteraction, delivery: observedDelivery });
    assert.equal(truth.state, "observed");
    assert.equal(truth.interaction?.interactionId, "int-123");
    assert.equal(truth.interaction?.interactionFingerprint, "sha256:interaction");
    assert.equal(truth.delivery?.deliveryFingerprint, "sha256:delivery");
    assert.equal("trafficAuthority" in (truth.interaction ?? {}), false);
    assert.equal("providerRoute" in (truth.interaction ?? {}), false);
  });

  it("fails closed on authority-bearing or hardware-identity fields", () => {
    for (const forbidden of ["trafficAuthority", "providerRoute", "credentials", "headers", "imei", "macAddress", "advertisingId", "screenFingerprint"]) {
      const truth = projectInteractionTruth({ interaction: { ...observedInteraction, [forbidden]: "forbidden" } });
      assert.equal(truth.state, "hold", forbidden);
      assert.match(truth.reason ?? "", /invalid|forbidden/);
    }
  });

  it("fails closed when delivery lineage does not match the interaction", () => {
    const truth = projectInteractionTruth({
      interaction: observedInteraction,
      delivery: { ...observedDelivery, interactionId: "int-other" },
    });
    assert.equal(truth.state, "hold");
    assert.equal(truth.reason, "interaction-delivery-mismatch");
  });

  it("stays absent when Task 6 runtime truth has not been emitted", () => {
    assert.deepEqual(projectInteractionTruth(null), {
      state: "absent",
      reason: "interaction-truth-absent",
      interaction: null,
      delivery: null,
    });
  });

  it("keeps normalized fingerprints stable across coarse presentation device classes", () => {
    for (const deviceClass of ["phone", "tablet", "desktop", "embedded", "headless"]) {
      const truth = projectInteractionTruth({ interaction: { ...observedInteraction, deviceClass } });
      assert.equal(truth.state, "observed");
      assert.equal(truth.interaction?.interactionFingerprint, "sha256:interaction");
      assert.equal(truth.interaction?.executionFingerprint, "sha256:execution");
    }
  });

  it("formats presentation values without mutating machine values", () => {
    const amount = 1234.5;
    const formattedAmount = formatPresentationValue(amount, { locale: "en-US", currency: "USD" });
    assert.match(formattedAmount, /1,234\.50/);
    assert.equal(amount, 1234.5);

    const machineId = "capability.assistant.respond";
    assert.equal(formatPresentationValue(machineId, { locale: "ar-EG", direction: "rtl" }), machineId);
  });
});
