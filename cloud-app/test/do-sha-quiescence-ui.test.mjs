import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const surface = readFileSync(join(root, "lib/do-sha-quiescence.ts"), "utf8");
const card = readFileSync(join(root, "components/cockpit/DoShaQuiescenceCard.tsx"), "utf8");
const grid = readFileSync(join(root, "components/cockpit/ConnectorRoutingCards.tsx"), "utf8");

describe("DO SHA quiescence UI", () => {
  it("mounts an observational 7.0.0-alpha.2 card and does not claim repair", () => {
    assert.match(card, /7\.0\.0-alpha\.2/);
    assert.match(card, /projectDoShaQuiescence\(reasonCode\)/);
    assert.match(grid, /DoShaQuiescenceCard/);
    assert.match(surface, /#1028/);
    assert.match(surface, /bounded hypothesis/);
    assert.match(surface, /Windows remains 3\.6\.0/);
  });

  it("backs off only on SHA mismatch and fails closed when unobserved", async () => {
    const { projectDoShaQuiescence, DO_SHA_MISMATCH_IDLE_MS, DO_TRANSIENT_RETRY_MS } = await import("../lib/do-sha-quiescence.ts");
    assert.equal(projectDoShaQuiescence("live-sha-mismatch").idleMs, DO_SHA_MISMATCH_IDLE_MS);
    assert.equal(projectDoShaQuiescence("ready-sha-mismatch").tone, "warn");
    assert.equal(projectDoShaQuiescence("http-503").idleMs, DO_TRANSIENT_RETRY_MS);
    assert.equal(projectDoShaQuiescence(null).statusLabel, "Unobserved / fail-closed");
    assert.equal(projectDoShaQuiescence("converged").tone, "good");
  });
});
