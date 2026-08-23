import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import {
  SECONDARY_CODEX_ARGS,
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
