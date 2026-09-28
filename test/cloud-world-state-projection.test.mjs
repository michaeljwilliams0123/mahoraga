import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const server=readFileSync(new URL("../src/server.mjs",import.meta.url),"utf8");
const baseline=readFileSync(new URL("../state/release-baseline/src/server.mjs",import.meta.url),"utf8");
test("cloud owner gateway exposes existing world-state planner read without a second planner",()=>{
  for(const source of [server,baseline]) {
    assert.match(source,/body\?\.type === "world-state"/);
    assert.match(source,/observeWorldState\(\{ manifest, database, supervisor \}\)/);
    assert.match(source,/planner: planWorldStateActions\(worldState\)/);
  }
  assert.equal(server,baseline);
});
