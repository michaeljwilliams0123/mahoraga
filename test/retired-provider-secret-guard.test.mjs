import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const workflowRoot = fileURLToPath(new URL("../.github/workflows/", import.meta.url));
const workflowFiles = readdirSync(workflowRoot)
  .filter((name) => /\.(?:yml|yaml)$/.test(name))
  .map((name) => join(workflowRoot, name));

test("retired Railway credentials cannot be reintroduced into active workflows", () => {
  for (const file of workflowFiles) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /RAILWAY_PROJECT_TOKEN/, file);
  }
});
