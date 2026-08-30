import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const APP = path.join(ROOT, "web", "app.js");
const INDEX = path.join(ROOT, "web", "index.html");

test("Control Center browser source remains syntactically valid and encoding-clean", () => {
  const source = readFileSync(APP, "utf8");
  const indexSource = readFileSync(INDEX, "utf8");
  assert.doesNotMatch(source, /(?:Â|�|ú)/u);
  assert.match(source, /authority\.integration\.activeLease/);
  assert.doesNotMatch(indexSource, /User-controlled core updates/);
  assert.doesNotMatch(indexSource, /Review candidate changes before activation/);
  for (const field of ["evidenceLevel", "lastVerifiedAt", "routingReason", "repairIncidents"]) assert.match(source, new RegExp(field));
  const checked = spawnSync(process.execPath, ["--check", APP], { encoding: "utf8", windowsHide: true });
  assert.equal(checked.status, 0, checked.stderr || checked.stdout);
});
