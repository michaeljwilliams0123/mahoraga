import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { projectCapabilityFamilies } from "../lib/capability-families.ts";
import { projectConnectorCapabilityRouting } from "../lib/connector-capability-routing.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
const command = readFileSync(join(root, "components/cockpit/CommandCockpit.tsx"), "utf8");
const families = readFileSync(join(root, "lib/capability-families.ts"), "utf8");

describe("permissioned connector capability routing UI", () => {
  it("keeps product name Mahoraga and 7.0.0-alpha.2 as provenance only", () => {
    assert.match(cockpit, /productName = health\?\.product \?\? "Mahoraga"/);
    assert.match(cockpit, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.doesNotMatch(cockpit, /<h2>7\.0\.0-alpha\.2/);
    assert.match(command, /Mahoraga workspace/);
    assert.doesNotMatch(command, /<h2>7\.0\.0-alpha\.2/);
  });

  it("surfaces observational StatusCard + telemetry for connector routing", () => {
    assert.match(cockpit, /Permissioned connector routing/);
    assert.match(cockpit, /projectConnectorCapabilityRouting/);
    assert.match(cockpit, /codex\.execute lane/);
    assert.match(cockpit, /not the universal external-action gate/);
    assert.match(cockpit, /Capability family projection/);
    assert.match(cockpit, /fail closed when broker evidence is absent, stale, unhealthy, paid, or over-privileged/);
    assert.match(command, /CONNECTOR_ROUTING_OBS/);
    assert.match(command, /CODEX_EXECUTE_SEPARATE/);
    assert.match(command, /FAMILY_SPLIT_AGENTIC_EXEC/);
    assert.match(command, /codex\.execute/);
    assert.match(command, /not the universal external-action gate/);
    assert.match(command, /Merge #856 is not live traffic authority/);
  });

  it("does not treat codex.execute as a universal UI gate", () => {
    assert.doesNotMatch(cockpit, /universal external-action gate is codex\.execute/);
    assert.doesNotMatch(command, /all external actions require codex\.execute/);
    assert.match(families, /cognitive\.cycle/);
    assert.match(families, /codex\.execute/);
  });

  it("separates agentic cognition from execution families", () => {
    const projected = projectCapabilityFamilies(true, [
      { capability: "cognitive.cycle", routable: true, enabled: true, costClass: "deterministic", workerIds: ["cognitive-core"] },
      { capability: "repository.inspect", routable: true, enabled: true, costClass: "zero-credit", workerIds: ["connector-github"] },
    ]);
    assert.equal(projected[1].id, "agentic");
    assert.equal(projected[1].route, "cognitive.cycle");
    assert.equal(projected[2].id, "execution");
    assert.equal(projected[2].route, "repository.inspect");
    assert.notEqual(projected[1].route, projected[2].route);
  });

  it("fails closed without fresh healthy zero-credit broker evidence", () => {
    const closed = projectConnectorCapabilityRouting(false, []);
    assert.equal(closed.failClosed, true);
    assert.equal(closed.trafficAuthority, false);
    assert.equal(closed.merge856IsTrafficAuthority, false);
    assert.equal(closed.value, "Fail closed");

    const paid = projectConnectorCapabilityRouting(true, [
      { capability: "repository.write", routable: true, enabled: true, costClass: "metered-cloud", workerIds: ["connector-github"] },
    ]);
    assert.equal(paid.failClosed, true);
    assert.equal(paid.broker.paid, true);
  });

  it("projects permissioned zero-credit connector routes without granting traffic authority", () => {
    const open = projectConnectorCapabilityRouting(true, [
      { capability: "integration.execute", routable: true, enabled: true, costClass: "zero-credit", provider: "composio", workerIds: ["connector"] },
    ], { connectorBroker: { bound: true, fresh: true, healthy: true, permissionClass: "execute", provider: "composio" } });
    assert.equal(open.failClosed, false);
    assert.equal(open.trafficAuthority, false);
    assert.equal(open.merge856IsTrafficAuthority, false);
    assert.equal(open.tone, "good");
    assert.match(open.detail, /Cloudflare execution runtime/);
  });
});
