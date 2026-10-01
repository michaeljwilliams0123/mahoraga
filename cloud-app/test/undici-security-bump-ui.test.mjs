import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("7.0.0-alpha.2 undici advisory cockpit UI", () => {
  it("pins product Mahoraga, provenance-only build, and observational undici 7.29.1", () => {
    const card = readFileSync(join(root, "components/cockpit/UndiciSecurityBumpCard.tsx"), "utf8");
    const view = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
    assert.match(card, /undici 7.29.1 observed/);
    assert.match(card, /Product remains Mahoraga/);
    assert.match(card, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.match(card, /does not grant traffic authority/);
    assert.match(view, /UndiciSecurityBumpCard/);
    assert.match(view, /productName = health\?\.product \?\? "Mahoraga"/);
  });
});
