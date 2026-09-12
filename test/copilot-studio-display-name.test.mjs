import test from "node:test";
import assert from "node:assert/strict";

import { synchronizeCopilotStudioDisplayNames } from "../src/copilot-studio-display-name.mjs";

const ENTERPRISE_ID = "501917a0-9e8e-f111-8076-000d3a30cfe7";
const HEALTH_ID = "3fed8376-1c8e-f111-8076-000d3a30cfe7";

function record(botid, name, schemaname) { return JSON.stringify({ botid, name, schemaname }); }

test("specialist display-name sync changes only the two fixed bot name fields and verifies schema preservation", async () => {
  const state = new Map([
    [ENTERPRISE_ID, { name: "Mahorago Enterprise Core", schemaname: "stable_enterprise_schema" }],
    [HEALTH_ID, { name: "Mahorago Tenant Health Reader", schemaname: "stable_health_schema" }],
  ]);
  const calls = [];
  const runDataverse = async (_command, args) => {
    calls.push(args);
    const id = args[args.indexOf("--id") + 1];
    const current = state.get(id);
    if (args[1] === "get") return { stdout: record(id, current.name, current.schemaname) };
    const data = JSON.parse(args[args.indexOf("--data") + 1]);
    assert.deepEqual(Object.keys(data), ["name"]);
    current.name = data.name;
    return { stdout: record(id, current.name, current.schemaname) };
  };

  const result = await synchronizeCopilotStudioDisplayNames({ runDataverse });
  assert.equal(result.verified, true);
  assert.deepEqual(result.agents.map((item) => [item.alias, item.changed, item.schemaPreserved]), [
    ["enterprise-core", true, true],
    ["tenant-health-reader", true, true],
  ]);
  assert.equal(calls.filter((args) => args[1] === "update").length, 2);
  assert.equal(calls.every((args) => [ENTERPRISE_ID, HEALTH_ID].includes(args[args.indexOf("--id") + 1])), true);
});

test("display-name sync is idempotent and fails closed on unexpected records", async () => {
  const good = async (_command, args) => {
    const id = args[args.indexOf("--id") + 1];
    const name = id === ENTERPRISE_ID ? "Mahoraga Enterprise Core" : "Mahoraga Tenant Health Reader";
    return { stdout: record(id, name, `schema-${id.slice(0, 4)}`) };
  };
  const result = await synchronizeCopilotStudioDisplayNames({ runDataverse: good });
  assert.equal(result.agents.every((item) => item.changed === false), true);

  await assert.rejects(
    () => synchronizeCopilotStudioDisplayNames({ runDataverse: async () => ({ stdout: record(ENTERPRISE_ID, "Unexpected Agent", "schema") }) }),
    /studio-display-name-record-invalid/,
  );
});
