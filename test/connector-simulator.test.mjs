import test from "node:test";
import assert from "node:assert/strict";
import { runConnectorSimulationMatrix, simulateConnectorCoordination } from "../src/connector-simulator.mjs";

test("connector simulation matrix matches expected admission decisions", () => {
  const report = runConnectorSimulationMatrix();
  assert.equal(report.ok, true);
  assert.equal(report.externalProviderCalls, 0);
  assert.equal(report.results.length, 7);
});

test("private repository connector requires authentication", () => {
  const report = simulateConnectorCoordination({ requestedConnector: "github", authenticated: false });
  assert.equal(report.ok, false);
  assert.equal(report.assertions.privateRepoProtected, false);
});

test("local toolbox path remains owner-bound and zero-credit", () => {
  const report = simulateConnectorCoordination({ requestedConnector: "local-toolbox" });
  assert.equal(report.ok, true);
  assert.equal(report.assertions.ownerBound, true);
  assert.equal(report.assertions.zeroCredit, true);
});
