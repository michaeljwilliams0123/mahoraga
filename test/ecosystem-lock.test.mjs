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
  assert.match(lock, /7\.0\.0-alpha\.2/);
  assert.match(lock, /one deployable browser UI/i);
  assert.doesNotMatch(lock, /two browser surfaces|both browser UIs/i);
  assert.doesNotMatch(lock, /rewrite this repository as JavaScript is allowed/i);
});

test("Copilot repo instructions are inline and preserve the singular deployable UI", async () => {
  const source = await sourceOf(".github/copilot-instructions.md");
  assert.ok(source.length > 800, "copilot-instructions.md must carry the rules inline");
  assert.match(source, /Do \*\*not\*\* rewrite/);
  assert.match(source, /operator-deck/);
  assert.match(source, /cloud-app/);
  assert.match(source, /one deployable browser UI/i);
  assert.match(source, /reference\/control-library/i);
});

test("experience agent preserves one deployable UI and the operator reference library", async () => {
  const source = await sourceOf(".github/agents/mahoraga-experience.agent.md");
  assert.match(source, /one deployable TypeScript browser UI/i);
  assert.match(source, /operator-deck/);
  assert.match(source, /reference\/control-library/i);
  assert.match(source, /TypeScript/);
  assert.doesNotMatch(source, /Two TypeScript browser surfaces/i);
});
