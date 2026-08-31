import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SOURCE = readFileSync(path.join(ROOT, "web", "app.js"), "utf8");

test("Control Center routes Microsoft work links to an explicit provider gap", () => {
  const sandbox = { state: { status: { capabilities: [] } } };
  exposeFunctionInSandbox(["isMicrosoftWorkUrl", "autoRoute"], "autoRoute", sandbox);
  const sharePoint = "https://vacoss.sharepoint.com/:u:/s/Cengage/example review this enterprise file";
  assert.equal(sandbox.autoRoute(sharePoint), "provider.gap");
  assert.equal(sandbox.autoRoute("Inspect the GitHub repository"), "repository.inspect");
  sandbox.state.status.capabilities = [{ capability: "m365.reason", routable: true }];
  assert.equal(sandbox.autoRoute(sharePoint), "m365.reason");
});

test("Control Center classifies Microsoft work links as enterprise data", () => {
  const sandbox = {};
  exposeFunctionInSandbox(["isMicrosoftWorkUrl", "inferDataClass"], "inferDataClass", sandbox);
  assert.equal(sandbox.inferDataClass("https://tenant.sharepoint.com/sites/Finance/file", [], ["synthetic", "enterprise"]), "enterprise");
  assert.equal(sandbox.inferDataClass("Inspect this attachment", [{}], ["synthetic", "local-only"]), "local-only");
});

test("Control Center accepts clipboard files supplied through DataTransfer items", () => {
  const sandbox = {};
  exposeFunctionInSandbox(["filesFromClipboard"], "filesFromClipboard", sandbox);
  const screenshot = { name: "image.png", size: 12, type: "image/png", lastModified: 1 };
  const files = sandbox.filesFromClipboard({ items: [{ kind: "string", getAsFile: () => null }, { kind: "file", getAsFile: () => screenshot }], files: [] });
  assert.deepEqual([...files], [screenshot]);
  assert.equal(sandbox.filesFromClipboard({ items: [], files: [screenshot] }).length, 1);
  assert.equal(sandbox.filesFromClipboard({ items: [{ kind: "file", getAsFile: () => screenshot }], files: [screenshot] }).length, 1);
});

test("Control Center queues repeated picker selections instead of dropping them", async () => {
  const calls = [];
  const sandbox = {
    state: { compatible: true, pendingAttachments: [], queuedFiles: 0, uploadQueue: Promise.resolve() },
    renderChat() {},
    notify() {},
    async uploadFiles(files, source) {
      calls.push({ files: [...files], source, concurrent: sandbox.active });
      sandbox.active = true;
      await Promise.resolve();
      sandbox.active = false;
    },
  };
  exposeFunctionInSandbox(["enqueueFiles"], "enqueueFiles", sandbox);
  sandbox.enqueueFiles([{ name: "first.txt" }], "picker");
  sandbox.enqueueFiles([{ name: "second.txt" }], "picker");
  await sandbox.state.uploadQueue;
  assert.deepEqual(calls.map((item) => item.files[0].name), ["first.txt", "second.txt"]);
  assert.deepEqual(calls.map((item) => item.source), ["picker", "picker"]);
  assert.deepEqual(calls.map((item) => item.concurrent), [undefined, false]);
  assert.equal(sandbox.state.queuedFiles, 0);
});

const SAFE_FUNCTION_SOURCE_PATTERN = /^[\w\s$()[\]{}.,;:+\-*/%<>=!&|^~?:'"`\\\n\r\t]+$/;

function functionSource(name) {
  const start = SOURCE.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} not found`);
  const bodyStart = SOURCE.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < SOURCE.length; index += 1) {
    if (SOURCE[index] === "{") depth += 1;
    if (SOURCE[index] === "}" && --depth === 0) return SOURCE.slice(start, index + 1);
  }
  throw new Error(`${name} is incomplete`);
}

function safeFunctionSource(name) {
  const source = functionSource(name);
  assert.ok(source.startsWith(`function ${name}(`), `${name} has an unexpected signature`);
  assert.ok(SAFE_FUNCTION_SOURCE_PATTERN.test(source), `${name} contains unexpected characters`);
  return source;
}

function exposeFunctionInSandbox(functionNames, exportName, sandbox) {
  const safeSources = functionNames.map((name) => safeFunctionSource(name));
  for (const [index, name] of functionNames.entries()) {
    assert.ok(safeSources[index].startsWith(`function ${name}(`), `${name} has an unexpected signature`);
  }
  sandbox.__functionSources = safeSources;
  sandbox.__exportName = exportName;
  const script = new vm.Script(`
    for (const source of __functionSources) {
      (0, eval)(source);
    }
    this[__exportName] = this[__exportName] || eval(__exportName);
  `);
  script.runInNewContext(sandbox);
  delete sandbox.__functionSources;
  delete sandbox.__exportName;
}
