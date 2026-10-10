import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("HF Hub revision preflight on 7.0.0-alpha.2 cockpit", () => {
  it("surfaces observational StatusCard for immutable Hub revision SHA preflight", () => {
    const view = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
    assert.match(view, /Hugging Face Hub revision/);
    assert.match(view, /Immutable SHA preflight \(observational\)/);
    assert.match(view, /public repo \+ full 40-char Hub revision SHA match metadata only/);
    assert.match(view, /rejects private\/gated\/redirected\/malformed\/mismatched\/unavailable/);
    assert.match(view, /explicitly non-admitting/);
    assert.match(view, /no artifact download\/hash verification/);
    assert.match(view, /Hub metadata is discovery evidence only/);
    assert.match(view, /Merged #1048 is not live authority/);
    assert.match(view, /7\.0\.0-alpha\.2 is provenance only/);
  });
});
