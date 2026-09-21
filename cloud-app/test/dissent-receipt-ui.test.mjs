import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("7.0.0-alpha.2 evidence-qualified dissent UI", () => {
  it("renders blocking, escalation, fail-closed reobserve, and qualified alternative ranking", () => {
    const panel = readFileSync(join(root, "components/cockpit/DissentReceiptPanel.tsx"), "utf8");
    const types = readFileSync(join(root, "lib/dissent-receipt.ts"), "utf8");
    const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
    const command = readFileSync(join(root, "components/cockpit/CommandCockpit.tsx"), "utf8");
    assert.match(types, /collective-dissent-resolution/);
    assert.match(panel, /blocking/);
    assert.match(panel, /nonblocking/);
    assert.match(panel, /dissent-escalation/);
    assert.match(panel, /3 unresolved cycles/);
    assert.match(panel, /fail-closed re-observe/);
    assert.match(panel, /2 participants \+ 2 current independent lineage roots/);
    assert.match(panel, /Raw Collective dissent/);
    assert.match(cockpit, /DissentReceiptPanel/);
    assert.match(command, /DissentReceiptPanel/);
    assert.match(cockpit, /Build provenance/);
    assert.doesNotMatch(cockpit, /<h2>7\.0\.0-alpha\.2/);
  });
});
