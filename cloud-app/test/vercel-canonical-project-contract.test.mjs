import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

const rootVercel = new URL("../../vercel.json", import.meta.url);
const appVercel = new URL("../vercel.json", import.meta.url);

test("Vercel deployment configuration stays retired", () => {
  assert.equal(existsSync(rootVercel), false);
  assert.equal(existsSync(appVercel), false);
});
