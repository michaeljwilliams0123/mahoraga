import test from "node:test";
import assert from "node:assert/strict";
import { readRepositoryHead } from "../src/repository-worker.mjs";

test("repository head is captured through the fixed repository boundary", async () => {
  const head = await readRepositoryHead();
  assert.match(head, /^[a-f0-9]{40}$/);
});
