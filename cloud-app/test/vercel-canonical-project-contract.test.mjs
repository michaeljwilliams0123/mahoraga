import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const rootVercel = new URL("../../vercel.json", import.meta.url);
const appVercel = new URL("../vercel.json", import.meta.url);

test("Vercel deployment configuration stays retired and silent", () => {
  assert.equal(existsSync(rootVercel), false);
  assert.equal(existsSync(appVercel), true);

  const config = JSON.parse(readFileSync(appVercel, "utf8"));
  assert.equal(config.git?.deploymentEnabled, false);
  assert.equal(config.github?.silent, true);
  assert.equal(config.framework, undefined);
  assert.equal(config.buildCommand, undefined);
  assert.equal(config.installCommand, undefined);
  assert.equal(config.outputDirectory, undefined);
});
