import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const command = readFileSync(join(root, "components/cockpit/CommandCockpit.tsx"), "utf8");
const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");

describe("Next dependency provenance UI", () => {
  it("keeps Mahoraga as product identity and alpha.2 as provenance-only metadata", () => {
    assert.match(command, /Mahoraga/);
    assert.match(cockpit, /productName = health\?\.product \?\? "Mahoraga"/);
    for (const surface of [command, cockpit]) {
      assert.match(surface, /7\.0\.0-alpha\.2 is build provenance only/);
      assert.doesNotMatch(surface, /<h[1-6][^>]*>7\.0\.0-alpha\.2/);
    }
  });

  it("surfaces the pinned Next security fix as observational dependency provenance", () => {
    assert.equal(packageJson.dependencies.next, "16.3.8");
    assert.match(command, /Next dependency provenance/);
    assert.match(command, /16\.3\.6 → 16\.3\.8/);
    assert.match(cockpit, /Next dependency provenance/);
    assert.match(cockpit, /16\.3\.8 \(from 16\.3\.6\)/);
    for (const surface of [command, cockpit]) {
      assert.match(surface, /GHSA-cjq9-62q9-8jv4/);
      assert.match(surface, /Image Optimization SSRF/);
      assert.match(surface, /GHSA-vcvr-r3jv-pc5j/);
      assert.match(surface, /#1026/);
      assert.match(surface, /cloud-app\/package\.json pin only/);
      assert.match(surface, /does not prove deployed runtime remediation or production traffic authority/);
    }
  });

  it("keeps GitHub Pages presentation-only without adding an authenticated API call", () => {
    assert.match(command, /github\.io is presentation only and must not call authenticated APIs/);
    assert.match(command, /github\.io must not issue authenticated API calls/);
    assert.match(cockpit, /presentation surfaces only/);
    assert.match(cockpit, /label="Traffic authority"/);
    assert.match(cockpit, /value="Separate \/ unverified"/);
    const provenanceRows = [command, cockpit]
      .map((surface) => surface.split("\n").find((line) => line.includes("Next dependency provenance")) ?? "");
    assert.ok(provenanceRows.every((row) => row.length > 0));
    assert.doesNotMatch(provenanceRows.join("\n"), /\bfetch\s*\(|api\.github\.com|authorization/i);
  });
});
