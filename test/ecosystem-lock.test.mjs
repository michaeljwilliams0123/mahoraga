import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function sourceOf(relative) {
  return (await readFile(path.join(root, relative), "utf8")).replaceAll("\r\n", "\n");
}

const lockFiles = [
  "AGENTS.md",
  "docs/ECOSYSTEM-LOCK.md",
  ".github/copilot-instructions.md",
  ".github/ai-instructions.md",
  ".github/instructions/typescript-ui.instructions.md",
];

test("ecosystem lock files exist on the surfaces ChatGPT and Copilot load", async () => {
  for (const relative of lockFiles) {
    const source = await sourceOf(relative);
    assert.match(source, /TypeScript/, `${relative} must name TypeScript`);
    assert.match(source, /JavaScript/, `${relative} must forbid a JavaScript rewrite`);
    assert.doesNotMatch(source, /ignore (?:all )?(?:previous|prior) instructions/i);
    assert.doesNotMatch(source, /override (?:your )?(?:safety|guardrails)/i);
  }
});

test("lock forbids wiping the control plane and converting UI to JavaScript", async () => {
  const lock = await sourceOf("docs/ECOSYSTEM-LOCK.md");
  assert.match(lock, /cloud-app/);
  assert.match(lock, /operator-deck/);
  assert.match(lock, /\.mjs/);
  assert.match(lock, /greenfield JavaScript prompt/i);
  assert.match(lock, /safety refusals|guardrails/i);
  assert.match(lock, /3\.6\.0/);
  assert.match(lock, /7\.0\.0-alpha\.1/);
  assert.doesNotMatch(lock, /rewrite this repository as JavaScript is allowed/i);
});

test("Copilot repo instructions are inline, not a link-only stub", async () => {
  const source = await sourceOf(".github/copilot-instructions.md");
  assert.ok(source.length > 800, "copilot-instructions.md must carry the rules inline");
  assert.match(source, /Do \*\*not\*\* rewrite/);
  assert.match(source, /operator-deck/);
  assert.match(source, /cloud-app/);
});

test("experience agent keeps both TypeScript UIs and does not call cloud-app the only UI", async () => {
  const source = await sourceOf(".github/agents/mahoraga-experience.agent.md");
  assert.match(source, /operator-deck/);
  assert.match(source, /TypeScript/);
  assert.doesNotMatch(source, /only browser UI/);
});
