import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("telemetry stream bound on 7.0.0-alpha.2 cockpit", () => {
  it("surfaces merged #1016 as observational rollover only", () => {
    const card = readFileSync(join(root, "components/cockpit/TelemetryStreamBoundCard.tsx"), "utf8");
    const view = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
    assert.match(card, /45s max lifetime/);
    assert.match(card, /Merged #1016/);
    assert.match(card, /214179ec5022/);
    assert.match(card, /execution-v1 Durable Object/);
    assert.match(card, /reconnects immediately on a closed stream/);
    assert.match(card, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.match(card, /Product remains Mahoraga/);
    assert.match(card, /Not execution readiness, cognition proof, provider fallback, cost change, auth weakening, or production traffic authority/);
    assert.match(view, /TelemetryStreamBoundCard/);
    assert.match(view, /productName = health\?\.product \?\? "Mahoraga"/);
    assert.match(view, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.doesNotMatch(view, /<h2>7\.0\.0-alpha\.2/);
    assert.doesNotMatch(card, /\bfetch\s*\(/);
  });
});
