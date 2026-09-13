import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(new URL("../.github/workflows/verify.yml", import.meta.url), "utf8");
const protection = JSON.parse(await readFile(new URL("../config/main-protection.contract.json", import.meta.url), "utf8"));

test("Vercel production retirement cannot block canonical Verify", () => {
  assert.doesNotMatch(workflow, /workspace:\s*\n\s+name: Verify unified Vercel workspace/);
  assert.match(workflow, /Vercel production deployment is retired/);
  assert.match(workflow, /dispatch-sovereign-integration:\s*\n\s+needs: \[verify\]/);
  assert.doesNotMatch(workflow, /dispatch-sovereign-integration:\s*\n\s+needs: \[verify, workspace\]/);
});

test("main protection requires only exact-head Ubuntu and Windows Verify contexts", () => {
  assert.deepEqual(protection.requiredContexts, [
    "Verify (ubuntu-latest)",
    "Verify (windows-latest)",
  ]);
  assert.equal(protection.requiredContexts.some((context) => /vercel/i.test(context)), false);
});
