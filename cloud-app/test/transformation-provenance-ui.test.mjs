import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  projectTransformationProvenanceSurface,
  sourceEvidenceReferenceDisplay,
} from "../lib/transformation-provenance-surface.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cockpitView = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
const commandCockpit = readFileSync(join(root, "components/cockpit/CommandCockpit.tsx"), "utf8");
const cards = readFileSync(join(root, "components/cockpit/TransformationProvenanceCards.tsx"), "utf8");
const surfaceSrc = readFileSync(join(root, "lib/transformation-provenance-surface.ts"), "utf8");

describe("7.0.0-alpha.2 transformation provenance cockpit UI", () => {
  it("pins product identity Mahoraga and provenance-only build", () => {
    const surface = projectTransformationProvenanceSurface();
    assert.equal(surface.product, "Mahoraga");
    assert.equal(surface.buildProvenanceOnly, "7.0.0-alpha.2");
    assert.match(cockpitView, /productName = health\?\.product \?\? "Mahoraga"/);
    assert.match(cockpitView, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.doesNotMatch(cockpitView, /<h2>7\.0\.0-alpha\.2/);
    assert.match(surfaceSrc, /product: "Mahoraga"/);
  });

  it("surfaces all six transformation kinds as observational cards", () => {
    for (const kind of ["translation", "transcription", "ocr", "summarization", "resize", "format-conversion"]) {
      assert.match(cards, new RegExp(kind));
      assert.match(surfaceSrc, new RegExp(kind));
    }
    assert.match(cockpitView, /Translation · transcription · transformation provenance/);
    assert.match(commandCockpit, /TRANSFORM_PROVENANCE_OBS/);
    assert.match(cards, /observational StatusCards and telemetry only/);
  });

  it("keeps source and derivative references distinct", () => {
    assert.match(cards, /Source vs derivative/);
    assert.match(cards, /never overwrite source meaning/);
    assert.match(cockpitView, /derivatives retain source fingerprints/i);
    const surface = projectTransformationProvenanceSurface();
    assert.equal(surface.sourceDistinctFromDerivative, true);
    assert.equal(surface.sourceEvidenceReferenceResolvesTo, "sourceReference");
    assert.equal(surface.sourceEvidenceReferenceNever, "outputReference");
  });

  it("sourceEvidenceReference display uses original source only", () => {
    assert.equal(
      sourceEvidenceReferenceDisplay({ sourceReference: "src:orig", outputReference: "out:der" }),
      "src:orig",
    );
    assert.equal(sourceEvidenceReferenceDisplay({ sourceReference: "same", outputReference: "same" }), null);
    assert.notEqual(
      sourceEvidenceReferenceDisplay({ sourceReference: "src:orig", outputReference: "out:der" }),
      "out:der",
    );
  });

  it("fails closed: no route, traffic authority, or credentials from transformation evidence", () => {
    const surface = projectTransformationProvenanceSurface();
    assert.equal(surface.failClosed, true);
    assert.equal(surface.grantsTrafficAuthority, false);
    assert.equal(surface.createsProviderRoute, false);
    assert.equal(surface.addsProviderCredentials, false);
    assert.match(cockpitView, /do not gain authority/);
    assert.match(cockpitView, /Traffic authority/);
    assert.match(cockpitView, /Execution readiness/);
    assert.match(commandCockpit, /cannot create a provider route or widen authority/i);
  });
});
