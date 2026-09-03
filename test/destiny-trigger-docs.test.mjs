import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const EVENT_DOC = new URL("../docs/DESTINY-EVENT-DISPATCH-LANE.md", import.meta.url);
const COORDINATION_DOC = new URL("../docs/GITHUB-CODEX-COORDINATION.md", import.meta.url);

test("Destiny documentation separates event dispatch from cipher relay and states proof boundaries", async () => {
  const eventDoc = await readFile(EVENT_DOC, "utf8");
  const coordination = await readFile(COORDINATION_DOC, "utf8");
  for (const source of [eventDoc, coordination]) {
    assert.match(source, /Destiny Event Dispatch Lane/);
    assert.match(source, /Destiny Cipher Relay/);
  }
  assert.match(eventDoc, /repository validation does not prove external delivery/i);
  assert.match(eventDoc, /unconfigured/i);
  assert.match(eventDoc, /zero-model/i);
  assert.match(eventDoc, /dedicated actor/i);
  assert.match(eventDoc, /full request SHA-256/i);
  assert.match(eventDoc, /exact head SHA/i);
});
