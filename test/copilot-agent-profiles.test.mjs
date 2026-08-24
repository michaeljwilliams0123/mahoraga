import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const agentDirectory = path.join(root, ".github", "agents");
const expectedAgents = [
  "mahoraga-assurance.agent.md",
  "mahoraga-coordinator.agent.md",
  "mahoraga-experience.agent.md",
  "mahoraga-relay.agent.md",
];

test("repository publishes the four bounded Copilot profiles", async () => {
  const files = (await readdir(agentDirectory)).filter((file) => file.endsWith(".agent.md")).sort();
  assert.deepEqual(files, expectedAgents);

  for (const file of files) {
    const source = await readFile(path.join(agentDirectory, file), "utf8");
    assert.match(source, /^---\n[\s\S]+?\n---\n/);
    assert.match(source, /\ntarget: github-copilot\n/);
    assert.match(source, /\ndisable-model-invocation: true\n/);
    assert.match(source, /\nuser-invocable: true\n/);
    assert.match(source, /\n  activation: explicit-owner-task\n/);
    assert.match(source, /pull request/i);
    assert.match(source, /never (?:merge|force-push)/i);
    assert.doesNotMatch(source.match(/\ntools: \[(.+)]\n/)?.[1] ?? "", /mcp|credential|browser|chat/i);
  }
});

test("coordinator alone may delegate and every profile has explicit tools", async () => {
  for (const file of expectedAgents) {
    const source = await readFile(path.join(agentDirectory, file), "utf8");
    const tools = source.match(/\ntools: \[(.+)]\n/)?.[1] ?? "";
    assert.ok(tools.length > 0, `${file} must declare tools`);
    assert.equal(tools.includes('"agent"'), file === "mahoraga-coordinator.agent.md");
  }
});

test("Copilot documentation states the activation and authority boundary", async () => {
  const source = await readFile(path.join(root, "docs", "COPILOT-AGENTS.md"), "utf8");
  assert.match(source, /default branch/i);
  assert.match(source, /explicit/i);
  assert.match(source, /cannot merge|never merge/i);
  assert.match(source, /403|repository access/i);
});
