import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { inspectGeneratedExtension } from "../src/generated-code-safety.mjs";

const root = path.resolve("state/execution-cells/codex/candidate-test");
const manifest = {
  schemaVersion: 1,
  id: "safe-extension",
  entrypoint: "extensions/safe.mjs",
  allowedApis: ["repository.read"],
  allowedPaths: ["src"],
};

test("generated extension accepts only declared fixed Mahoraga APIs", () => {
  const decision = inspectGeneratedExtension({
    language: "javascript",
    source: "export async function run(api) { return api.repository.read('src/config.mjs'); }\n",
    manifest,
    candidateRoot: root,
  });
  assert.equal(decision.safe, true);
  assert.deepEqual(decision.reasonCodes, []);
  assert.match(decision.sourceSha256, /^[a-f0-9]{64}$/);
  assert.equal(Object.hasOwn(decision, "source"), false);
});

test("generated JavaScript rejects dynamic authority and filesystem escape", () => {
  const cases = [
    ["eval('2+2')", "dynamic-evaluation"],
    ["new Function('return 1')", "dynamic-evaluation"],
    ["import child from 'node:child_process'", "process-access"],
    ["import net from 'node:net'", "network-access"],
    ["console.log(process.env.SECRET)", "environment-access"],
    ["readFile('../outside')", "filesystem-traversal"],
    ["readFile('/etc/passwd')", "filesystem-outside-candidate"],
  ];
  for (const [source, code] of cases) {
    const decision = inspectGeneratedExtension({ language: "javascript", source, manifest, candidateRoot: root });
    assert.equal(decision.safe, false, source);
    assert.ok(decision.reasonCodes.includes(code), `${source}: ${decision.reasonCodes.join(",")}`);
  }
});

test("generated Python rejects process, socket, environment, and traversal surfaces", () => {
  const source = "import subprocess\nimport socket\nimport os\nos.environ['TOKEN']\nopen('../outside')\n";
  const decision = inspectGeneratedExtension({ language: "python", source, manifest: { ...manifest, entrypoint: "extensions/safe.py" }, candidateRoot: root });
  assert.equal(decision.safe, false);
  assert.deepEqual(decision.reasonCodes, ["environment-access", "filesystem-traversal", "network-access", "process-access"]);
});

test("generated extensions reject computed authority escapes", () => {
  const cases = [
    ["const p = globalThis.process; p['env'].TOKEN", "environment-access"],
    ["const p = globalThis['process']; p.env.TOKEN", "environment-access"],
    ["const spawn = process['spawn']; spawn('sh')", "process-access"],
    ["const load = __import__; load('node:fs')", "unrestricted-filesystem"],
  ];
  for (const [source, code] of cases) {
    const decision = inspectGeneratedExtension({ language: "javascript", source, manifest, candidateRoot: root });
    assert.equal(decision.safe, false, source);
    assert.ok(decision.reasonCodes.includes(code), `${source}: ${decision.reasonCodes.join(",")}`);
  }
});

test("extension manifest cannot grant undeclared or conflicting authority", () => {
  assert.throws(() => inspectGeneratedExtension({ language: "javascript", source: "export const x = 1", manifest: { ...manifest, command: "sh" }, candidateRoot: root }), /extension-manifest-invalid/);
  assert.throws(() => inspectGeneratedExtension({ language: "javascript", source: "export const x = 1", manifest: { ...manifest, allowedPaths: ["../outside"] }, candidateRoot: root }), /extension-path-invalid/);
});
