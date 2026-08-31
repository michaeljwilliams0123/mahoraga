import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = path.join(ROOT, "cloud", "app.js");
const INDEX = path.join(ROOT, "cloud", "index.html");

test("canonical cloud browser source remains syntactically valid and encoding-clean", () => {
  const source = readFileSync(APP, "utf8");
  const indexSource = readFileSync(INDEX, "utf8");
  assert.doesNotMatch(source, /(?:Â|�|ú)/u);
  assert.match(source, /LoopbackTransport/);
  assert.match(source, /RelayTransport/);
  assert.match(source, /OfflinePreviewTransport/);
  assert.doesNotMatch(indexSource, /User-controlled core updates/);
  for (const field of ["capabilities", "currentRun", "connection", "improvement"]) assert.match(source, new RegExp(field));
  const checked = spawnSync(process.execPath, ["--check", APP], { encoding: "utf8", windowsHide: true });
  assert.equal(checked.status, 0, checked.stderr || checked.stdout);
});
