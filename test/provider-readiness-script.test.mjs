import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const coreUrl = new URL("../src/provider-readiness.mjs", import.meta.url);
const scriptUrl = new URL("../scripts/provider-readiness.mjs", import.meta.url);

test("provider readiness CLI supplies every probe required by the collector", async () => {
  const [core, script] = await Promise.all([
    readFile(coreUrl, "utf8"),
    readFile(scriptUrl, "utf8"),
  ]);
  const block = core.match(/const required = \[([^\]]+)\]/s)?.[1] ?? "";
  const required = [...block.matchAll(/"([A-Za-z0-9]+)"/g)].map((match) => match[1]);
  assert.ok(required.length > 0, "collector required-probe contract must be discoverable");
  for (const probe of required) {
    assert.match(script, new RegExp(`\\b${probe}\\s*:`), `CLI must supply ${probe}`);
  }
});
