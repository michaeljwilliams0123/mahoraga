import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";

async function source(relative) {
  return readFile(path.join(ROOT, relative), "utf8");
}

test("runtime subprocess executables cannot be selected through environment input", async () => {
  const [browser, queue, repository] = await Promise.all([
    source("src/browser-worker.mjs"),
    source("src/microsoft-queue-worker.mjs"),
    source("src/repository-worker.mjs"),
  ]);
  assert.doesNotMatch(browser, /MAHORAGA_CHROME_PATH|child_process|spawn|chrome\.exe|remote-debugging/);
  assert.match(browser, /interactionCapability: "cloud-browser-tool"/);
  assert.doesNotMatch(queue, /MAHORAGA_PYTHON_PATH/);
  assert.match(queue, /spawn\(DEFAULT_PYTHON,/);
  assert.doesNotMatch(repository, /MAHORAGA_GIT_EXECUTABLE/);
  assert.match(repository, /const GIT = "git";/);
});
test("Dataverse cache paths remain fixed under trusted roots", async () => {
  const auth = await source("scripts/auth.py");
  assert.doesNotMatch(auth, /Path\(os\.environ\.get\("LOCALAPPDATA"/);
  assert.doesNotMatch(auth, /Path\(cache_dir\)/);
  assert.doesNotMatch(auth, /os\.environ\.get\("XDG_DATA_HOME"/);
  assert.match(auth, /path = workspace_root \/ _DEFAULT_WORKSPACE_CACHE_DIRNAME/);
  assert.match(auth, /reject caller-selected absolute, parent-relative, or alternate paths/);
});

test("isolated workers do not inherit parent Node execution flags", async () => {
  const supervisor = await source("src/supervisor.mjs");
  assert.match(supervisor, /forkWorker = fork/);
  assert.match(supervisor, /this\.forkWorker\(WORKER_PROCESS,[\s\S]*execArgv:\s*\[\]/);
});

test("Windows launchers derive the user profile without a committed username", async () => {

  const [readme, control, production] = await Promise.all([
    source("README.md"),
    source("scripts/start-control-center.ps1"),
    source("scripts/start-production.ps1"),
  ]);
  for (const value of [readme, control, production]) {
    assert.doesNotMatch(value, /C:\\Users\\[^<]/);
    assert.match(value, /GetFolderPath\('UserProfile'\)/);
  }
});
