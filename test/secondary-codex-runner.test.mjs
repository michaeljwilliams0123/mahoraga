import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import {
  SECONDARY_CODEX_ARGS,
  SecondaryCodexRunner,
  assertChangedPathsAllowed,
  buildSecondaryCodexPrompt,
  parsePorcelainPaths,
  projectForAssignment,
  validateSecondaryRunnerConfig,
} from "../src/secondary-codex-runner.mjs";
import { createAssignmentRecord } from "../src/coordination-records.mjs";

const assignment = (overrides = {}) => createAssignmentRecord({
  title: "Implement the side-project feature",
  taskArea: "side-project-alpha",
  expectedTask: "Implement the bounded feature and its focused tests.",
  expectedBaseCommit: "abcdef0123456789",
  allowedPaths: ["src", "test"],
  ...overrides,
}, { assignmentId: "sec-12345678-1234-1234-1234-123456789abc", now: "2026-08-23T00:00:00.000Z" });

const config = () => ({
  schemaVersion: 1,
  controlBranch: "main",
  maxAttempts: 3,
  projects: [{
    taskArea: "side-project-alpha",
    repository: "https://github.com/example/side-project.git",
    checkout: path.resolve("side-project"),
    defaultBranch: "main",
    allowedPaths: ["src", "test", "docs"],
    maxRuntimeMinutes: 60,
    enabled: true,
  }],
});

test("runner configuration is strict and cannot contain credentials", () => {
  assert.equal(validateSecondaryRunnerConfig(config()).maxAttempts, 3);
  assert.throws(() => validateSecondaryRunnerConfig({ ...config(), githubToken: "secret" }), /field is not allowed/);
});

test("task areas map assignments to an explicitly scoped project", () => {
  assert.equal(projectForAssignment(config(), assignment()).repository, "https://github.com/example/side-project.git");
  assert.throws(() => projectForAssignment(config(), assignment({ allowedPaths: ["src", "secrets"] })), /exceeds project scope/);
});

test("the execution prompt carries the privacy boundary and no caller extras", () => {
  const prompt = buildSecondaryCodexPrompt(assignment());
  assert.match(prompt, /Do not read or export ChatGPT conversations/);
  assert.match(prompt, /Do not commit, push, create result metadata/);
  assert.doesNotMatch(prompt, /credential-value/);
});

test("actual changed paths include both sides of a rename and enforce the allowlist", () => {
  assert.deepEqual(parsePorcelainPaths("R  src/new.mjs\0src/old.mjs\0?? test/new.test.mjs\0"), ["src/new.mjs", "src/old.mjs", "test/new.test.mjs"]);
  assert.equal(assertChangedPathsAllowed(["src/new.mjs", "test/new.test.mjs"], ["src", "test"]), true);
  assert.throws(() => assertChangedPathsAllowed(["state/private.token"], ["src", "test"]), /outside assignment scope/);
});

test("Codex automation is ephemeral and workspace-write bounded", () => {
  assert.deepEqual(SECONDARY_CODEX_ARGS, ["exec", "--sandbox", "workspace-write", "--ephemeral"]);
  assert.equal(SECONDARY_CODEX_ARGS.includes("danger-full-access"), false);
});

test("the runner binds the immutable assignment before model execution", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mahoraga-secondary-runner-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const calls = [];
  const run = async (command, args, options) => {
    calls.push({ command, args, options });
    if (command === "git" && args.includes("status")) return { stdout: "", stderr: "" };
    if (command === "git" && args.includes("rev-parse")) return { stdout: "1234567890abcdef\n", stderr: "" };
    return { stdout: "", stderr: "" };
  };
  const runner = new SecondaryCodexRunner({ root, run, now: () => new Date("2026-08-23T00:00:00.000Z") });
  const record = assignment();
  const project = config().projects[0];
  const result = await runner.executeAssignment(record, project, 1);
  assert.equal(result.returnCommit, "1234567890abcdef");
  const worktree = path.join(root, "state", "secondary-worktrees", `${record.assignmentId}-attempt-1`);
  const stored = JSON.parse(await readFile(path.join(worktree, "coordination", "assignments", `${record.assignmentId}.json`), "utf8"));
  assert.deepEqual(stored, record);
  const bindCommit = calls.findIndex(({ args }) => args?.includes(`[SECONDARY] Bind ${record.assignmentId} assignment`));
  const codex = calls.findIndex(({ command }) => command === "codex");
  assert.ok(bindCommit >= 0 && bindCommit < codex);
});
