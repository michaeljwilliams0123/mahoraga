import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { projectExecutionBrokerObservation } from "../lib/execution-broker-observation.ts";
import type { RuntimeCapability } from "../lib/runtime-relay.ts";
const cockpitPath = join(dirname(fileURLToPath(import.meta.url)), "..", "components", "cockpit");
const cap = (capability: string, routable: boolean, routingReason: string | null = null): RuntimeCapability =>
  ({ capability, routable, enabled: true, workerIds: [], routingReason });
test("missing tool capabilities remain explicitly unobserved", () => {
 const state=projectExecutionBrokerObservation([cap("assistant.respond",true)]);
 assert.deepEqual(state,{status:"unobserved",observed:0,routable:0,held:0,reasons:[]});
});
test("actual observed tool route holds remain visible without inventing execution readiness", () => {
 const state=projectExecutionBrokerObservation([cap("repository.inspect",false,"provider-unavailable"),cap("cloud.inspect",false,"provider-proof-unavailable")]);
 assert.equal(state.status,"partially-held");
 assert.equal(state.held,2);
 assert.deepEqual(state.reasons,["provider-unavailable","provider-proof-unavailable"]);
});
test("duplicate projections are counted once, and mixed observed routes remain distinct from broker proof", () => {
 const state=projectExecutionBrokerObservation([cap("repository.inspect",true),cap("repository.inspect",true),cap("browser.inspect",false,"process-stopped")]);
 assert.equal(state.routable,1);
 assert.equal(state.observed,2);
 assert.equal(state.held,1);
 const component=readFileSync(join(cockpitPath,"ExecutionBrokerCard.tsx"),"utf8");
 const cockpit=readFileSync(join(cockpitPath,"CockpitView.tsx"),"utf8");
 assert.match(component,/does not establish that the private Cloudflare broker has a bound provider/);
 assert.match(cockpit,/<ExecutionBrokerCard capabilities=\{runtimeCapabilities\}/);
});

test("disabled-only tool route remains observed and held, never routable", () => {
 const state = projectExecutionBrokerObservation([{ ...cap("cloud.inspect", true), enabled: false }]);
 assert.deepEqual(state, {status:"partially-held",observed:1,routable:0,held:1,reasons:["capability-disabled"]});
});
test("disabled routable and enabled-held duplicates cannot falsely report readiness", () => {
 const state = projectExecutionBrokerObservation([
  { ...cap("cloud.inspect", true), enabled: false },
  cap("cloud.inspect", false, "provider-unavailable"),
 ]);
 assert.deepEqual(state, {status:"partially-held",observed:1,routable:0,held:1,
  reasons:["capability-disabled","provider-unavailable"]});
});
test("enabled routable twin remains routable without counting disabled advertisement", () => {
 const state = projectExecutionBrokerObservation([
  { ...cap("cloud.inspect", true), enabled: false },
  cap("cloud.inspect", true),
 ]);
 assert.deepEqual(state, {status:"observed-routable",observed:1,routable:1,held:0,reasons:[]});
});
test("disabled held capability and independent enabled route remain distinct", () => {
 const state = projectExecutionBrokerObservation([
  { ...cap("cloud.inspect", true), enabled: false },
  cap("repository.inspect", true),
 ]);
 assert.deepEqual(state, {status:"partially-held",observed:2,routable:1,held:1,reasons:["capability-disabled"]});
});
