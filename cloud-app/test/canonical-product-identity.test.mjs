import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("public Mahoraga identity is unversioned and build data stays provenance-only", async () => {
  const [layout, shell, health, panels] = await Promise.all([
    read("app/layout.tsx"),
    read("components/workspace/workspace-shell.tsx"),
    read("app/api/health/route.ts"),
    read("../operator-deck/src/lib/cockpit/panels.ts"),
  ]);
  assert.match(layout, /title: "Mahoraga"/);
  assert.match(shell, /<strong>Mahoraga<\/strong><span>One system<\/span>/);
  assert.match(health, /product: "Mahoraga"/);
  assert.match(health, /build: \{ version: "7\.0\.0-alpha\.2" \}/);
  for (const source of [layout, shell, panels]) {
    assert.doesNotMatch(source, /Mahoraga[^\n]{0,100}\b\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/);
  }
});
