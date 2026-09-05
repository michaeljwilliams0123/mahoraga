import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = new URL("../.github/workflows/verify.yml", import.meta.url);

test("repository verification exposes the scoped Actions token to the live-protection probe", () => {
  const source = readFileSync(workflow, "utf8");
  const step = source.match(/- name: Verify authoritative repository[\s\S]*?(?=\n\s*- name:|\n\s*workspace:)/)?.[0] ?? "";
  assert.match(step, /env:\s*[\r\n]+\s+GITHUB_TOKEN:\s*\$\{\{\s*github\.token\s*\}\}/, "Verify authoritative repository must authenticate GitHub API reads with the scoped Actions token");
});
