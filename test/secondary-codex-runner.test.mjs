import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import {
  SECONDARY_CODEX_ARGS,
  SecondaryCodexRunner,
  assertChangedPathsAllowed,
  buildSecondaryCodexPrompt,
  codexSubscriptionEnvironment,
  parsePorcelainPaths,
  projectForAssignment,
  validateSecondaryRunnerConfig,
} from "../src/secondary-codex-runner.mjs";
import { createAssignmentRecord } from "../src/coordination-records.mjs";
import { secondaryRunnerSnapshot } from "../src/secondary-runner-status.mjs";

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

test("secondary installer defaults can receive canonical Mahoraga implementation assignments", async () => {
  const [installer, templateSource] = await Promise.all([
    readFile(new URL("../scripts/install-secondary-codex-runner.ps1", import.meta.url), "utf8"),
    readFile(new URL("../coordination/templates/secondary-runner.example.json", import.meta.url), "utf8"),
  ]);
  const template = JSON.parse(templateSource);
  assert.match(installer, /\[string\]\$TaskArea = 'mahoraga'/);
  assert.match(installer, /\[string\]\$AllowedPaths = 'cloud-app,docs,evaluation,scripts,src,test,coordination\/results'/);
  for (const root of ["cloud-app", "docs", "evaluation", "scripts", "src", "test", "coordination/results"]) {
    assert.ok(template.projects[0].allowedPaths.includes(root));
  }
  assert.equal(template.projects[0].taskArea, "mahoraga");
  assert.equal(projectForAssignment({
    ...config(),
    projects: [{
      ...config().projects[0],
      taskArea: "mahoraga",
      repository: "https://github.com/michaeljwilliams0123/mahoraga.git",
      allowedPaths: template.projects[0].allowedPaths,
    }],
  }, assignment({
    taskArea: "mahoraga",
    allowedPaths: ["cloud-app/components/workspace.tsx", "docs/CLOUD-WORKSPACE.md"],
  }))?.taskArea, "mahoraga");
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

test("Codex execution cannot inherit API keys or credential-like environment values", () => {
  assert.deepEqual(codexSubscriptionEnvironment({
    PATH: "C:\\Tools",
    USERPROFILE: "C:\\Users\\operator",
    OPENAI_API_KEY: "separate-billing",
    CODEX_API_KEY: "separate-billing",
    GITHUB_TOKEN: "repository-secret",
    GH_PAT: "repository-secret",
    AWS_ACCESS_KEY_ID: "cloud-secret",
    SSH_PRIVATE_KEY: "private-key",
    CHATGPT_SESSION: "web-session",
    SERVICE_PASSWORD: "personal-secret",
  }), {
    PATH: "C:\\Tools",
    USERPROFILE: "C:\\Users\\operator",
  });
});

test("runner status fails closed when configuration has not been created", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mahoraga-secondary-status-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runner = new SecondaryCodexRunner({
    root,
    run: async (command) => ({ stdout: `${command} version\n`, stderr: "" }),
  });
  assert.deepEqual(await runner.status(), {
    configured: false,
    reason: "configuration-missing",
    git: { healthy: true, version: "git version" },
    codex: { healthy: true, version: "codex version" },
    lastRunAt: null,
    lastOutcome: null,
    projects: [],
    assignments: {},
  });
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
  const runner = new SecondaryCodexRunner({ root, run, now: () => new Date("2026-08-23T00:00:00.000Z"), executionId: () => "feedface-1234-5678-90ab-cdef12345678" });
  const record = assignment();
  const project = config().projects[0];
  const result = await runner.executeAssignment(record, project, 1);
  assert.equal(result.returnCommit, "1234567890abcdef");
  const worktree = path.join(root, "state", "secondary-worktrees", `${record.assignmentId}-attempt-1-feedface-1234-5678-90ab-cdef12345678`);
  const stored = JSON.parse(await readFile(path.join(worktree, "coordination", "assignments", `${record.assignmentId}.json`), "utf8"));
  assert.deepEqual(stored, record);
  const bindCommit = calls.findIndex(({ args }) => args?.includes(`[SECONDARY] Bind ${record.assignmentId} assignment`));
  const codex = calls.findIndex(({ command }) => command === "codex");
  assert.ok(bindCommit >= 0 && bindCommit < codex);
});

test("a failed assignment requires an explicit bounded retry before another model run", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mahoraga-secondary-retry-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "state"), { recursive: true });
  await writeFile(path.join(root, "state", "secondary-runner.json"), JSON.stringify(config()));
  await writeFile(path.join(root, "state", "secondary-runner-state.json"), JSON.stringify({
    schemaVersion: 1,
    assignments: { [assignment().assignmentId]: { attempts: 1, state: "failed", error: "previous-failure" } },
  }));
  const run = async (command, args) => {
    if (command === "git" && args.includes("ls-tree")) return { stdout: `coordination/assignments/${assignment().assignmentId}.json\n`, stderr: "" };
    if (command === "git" && args.includes("show")) return { stdout: JSON.stringify(assignment()), stderr: "" };
    if (command === "git" && args[0] === "ls-remote") throw Object.assign(new Error("missing branch"), { code: 2 });
    return { stdout: "", stderr: "" };
  };
  const runner = new SecondaryCodexRunner({ root, run, now: () => new Date("2026-08-23T01:00:00.000Z") });
  assert.deepEqual(await runner.retry(assignment().assignmentId), { status: "retry-armed", assignmentId: assignment().assignmentId });
  const state = JSON.parse(await readFile(path.join(root, "state", "secondary-runner-state.json"), "utf8"));
  assert.deepEqual(state.assignments[assignment().assignmentId], {
    attempts: 1,
    state: "retry-armed",
    updatedAt: "2026-08-23T01:00:00.000Z",
  });
  assert.deepEqual(state.lastOutcome, { status: "retry-armed", assignmentId: assignment().assignmentId });
});

test("retry cannot exceed the configured model-attempt ceiling", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mahoraga-secondary-exhausted-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "state"), { recursive: true });
  await writeFile(path.join(root, "state", "secondary-runner.json"), JSON.stringify(config()));
  await writeFile(path.join(root, "state", "secondary-runner-state.json"), JSON.stringify({
    schemaVersion: 1,
    assignments: { [assignment().assignmentId]: { attempts: 3, state: "failed", error: "previous-failure" } },
  }));
  const run = async (command, args) => {
    if (command === "git" && args.includes("ls-tree")) return { stdout: `coordination/assignments/${assignment().assignmentId}.json\n`, stderr: "" };
    if (command === "git" && args.includes("show")) return { stdout: JSON.stringify(assignment()), stderr: "" };
    if (command === "git" && args[0] === "ls-remote") throw Object.assign(new Error("missing branch"), { code: 2 });
    return { stdout: "", stderr: "" };
  };
  const runner = new SecondaryCodexRunner({ root, run });
  await assert.rejects(() => runner.retry(assignment().assignmentId), /secondary-assignment-attempts-exhausted/);
});

test("runner heartbeat snapshots expose bounded state without local paths or credentials", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mahoraga-secondary-status-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "state"), { recursive: true });
  await writeFile(path.join(root, "state", "secondary-runner.json"), JSON.stringify(config()));
  await writeFile(path.join(root, "state", "secondary-runner-state.json"), JSON.stringify({
    schemaVersion: 1,
    lastRunAt: "2026-08-23T01:00:00.000Z",
    lastOutcome: { status: "retryable", assignmentId: assignment().assignmentId, attempt: 1, reason: "runner-error" },
    assignments: { [assignment().assignmentId]: { attempts: 1, state: "retryable", error: "runner-error" } },
  }));
  const snapshot = secondaryRunnerSnapshot(root);
  assert.equal(snapshot.configured, true);
  assert.equal(snapshot.assignmentCounts.retryable, 1);
  assert.deepEqual(snapshot.lastOutcome, { status: "retryable", assignmentId: assignment().assignmentId, attempt: 1, reason: "runner-error" });
  assert.equal(JSON.stringify(snapshot).includes(path.resolve("side-project")), false);
  assert.equal(JSON.stringify(snapshot).includes("repository-secret"), false);
});

test("each unattended poll persists its bounded outcome", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mahoraga-secondary-poll-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "state"), { recursive: true });
  await writeFile(path.join(root, "state", "secondary-runner.json"), JSON.stringify(config()));
  const calls = [];
  const run = async (command, args) => {
    calls.push({ command, args });
    return command === "git" && args.includes("ls-tree")
      ? { stdout: "", stderr: "" }
      : { stdout: command === "codex" ? "codex-cli 1.0\n" : "", stderr: "" };
  };
  const runner = new SecondaryCodexRunner({ root, run, now: () => new Date("2026-08-23T02:00:00.000Z") });
  assert.deepEqual(await runner.runOnce(), { status: "idle" });
  assert.equal(calls.some(({ command }) => command === "codex"), false, "idle polling must not contact Codex");
  const state = JSON.parse(await readFile(path.join(root, "state", "secondary-runner-state.json"), "utf8"));
  assert.equal(state.lastRunAt, "2026-08-23T02:00:00.000Z");
  assert.deepEqual(state.lastOutcome, { status: "idle" });
});

test("failed assignments stay paused until retry is explicitly armed", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mahoraga-secondary-paused-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "state"), { recursive: true });
  await writeFile(path.join(root, "state", "secondary-runner.json"), JSON.stringify(config()));
  await writeFile(path.join(root, "state", "secondary-runner-state.json"), JSON.stringify({
    schemaVersion: 1,
    assignments: { [assignment().assignmentId]: { attempts: 1, state: "failed", error: "previous-failure" } },
  }));
  const calls = [];
  const run = async (command, args) => {
    calls.push({ command, args });
    if (command === "git" && args.includes("ls-tree")) return { stdout: `coordination/assignments/${assignment().assignmentId}.json\n`, stderr: "" };
    if (command === "git" && args.includes("show")) return { stdout: JSON.stringify(assignment()), stderr: "" };
    return { stdout: "", stderr: "" };
  };
  const runner = new SecondaryCodexRunner({ root, run, now: () => new Date("2026-08-23T03:00:00.000Z") });
  assert.deepEqual(await runner.runOnce(), { status: "idle" });
  assert.equal(calls.some(({ command }) => command === "codex"), false);
});

test("an interrupted running assignment cannot automatically spend another attempt", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mahoraga-secondary-interrupted-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "state"), { recursive: true });
  await writeFile(path.join(root, "state", "secondary-runner.json"), JSON.stringify(config()));
  await writeFile(path.join(root, "state", "secondary-runner-state.json"), JSON.stringify({
    schemaVersion: 1,
    assignments: { [assignment().assignmentId]: { attempts: 1, state: "running" } },
  }));
  const calls = [];
  const run = async (command, args) => {
    calls.push({ command, args });
    if (command === "git" && args.includes("ls-tree")) return { stdout: `coordination/assignments/${assignment().assignmentId}.json\n`, stderr: "" };
    if (command === "git" && args.includes("show")) return { stdout: JSON.stringify(assignment()), stderr: "" };
    if (command === "git" && args[0] === "ls-remote") throw Object.assign(new Error("missing branch"), { code: 2 });
    return { stdout: "", stderr: "" };
  };
  const runner = new SecondaryCodexRunner({ root, run, now: () => new Date("2026-08-23T03:30:00.000Z") });
  assert.deepEqual(await runner.runOnce(), { status: "idle" });
  assert.equal(calls.some(({ command }) => command === "codex"), false);
  assert.deepEqual(await runner.retry(assignment().assignmentId), { status: "retry-armed", assignmentId: assignment().assignmentId });
  const state = JSON.parse(await readFile(path.join(root, "state", "secondary-runner-state.json"), "utf8"));
  assert.equal(state.assignments[assignment().assignmentId].attempts, 1);
  assert.equal(state.assignments[assignment().assignmentId].state, "retry-armed");
});

test("the attempt is persisted before Codex execution begins", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mahoraga-secondary-running-state-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "state"), { recursive: true });
  await writeFile(path.join(root, "state", "secondary-runner.json"), JSON.stringify(config()));
  let runningState;
  const run = async (command, args) => {
    if (command === "git" && args.includes("ls-tree")) return { stdout: `coordination/assignments/${assignment().assignmentId}.json\n`, stderr: "" };
    if (command === "git" && args.includes("show")) return { stdout: JSON.stringify(assignment()), stderr: "" };
    if (command === "git" && args[0] === "ls-remote") throw Object.assign(new Error("missing branch"), { code: 2 });
    if (command === "git" && args.includes("status")) return { stdout: "", stderr: "" };
    if (command === "git" && args.includes("rev-parse")) return { stdout: "1234567890abcdef\n", stderr: "" };
    if (command === "codex" && args[0] === "exec") {
      runningState = JSON.parse(await readFile(path.join(root, "state", "secondary-runner-state.json"), "utf8"));
    }
    return { stdout: command === "codex" ? "codex-cli 1.0\n" : "", stderr: "" };
  };
  const runner = new SecondaryCodexRunner({ root, run, now: () => new Date("2026-08-23T03:45:00.000Z"), executionId: () => "deadbeef-1234-5678-90ab-cdef12345678" });
  assert.equal((await runner.runOnce()).status, "completed");
  assert.equal(runningState.assignments[assignment().assignmentId].attempts, 1);
  assert.equal(runningState.assignments[assignment().assignmentId].state, "running");
});

test("the local run lock prevents overlapping model executions", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mahoraga-secondary-single-flight-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, "state"), { recursive: true });
  await writeFile(path.join(root, "state", "secondary-runner.json"), JSON.stringify(config()));
  let releaseFetch;
  let fetchStarted;
  const fetchStartedPromise = new Promise((resolve) => { fetchStarted = resolve; });
  const run = async (command, args) => {
    if (command === "git" && args.includes("fetch")) {
      fetchStarted();
      await new Promise((resolve) => { releaseFetch = resolve; });
    }
    if (command === "git" && args.includes("ls-tree")) return { stdout: "", stderr: "" };
    return { stdout: "", stderr: "" };
  };
  const first = new SecondaryCodexRunner({ root, run });
  const second = new SecondaryCodexRunner({ root, run });
  const firstRun = first.runOnce();
  await fetchStartedPromise;
  assert.deepEqual(await second.runOnce(), { status: "busy" });
  assert.deepEqual(await second.retry(assignment().assignmentId), { status: "busy", assignmentId: assignment().assignmentId });
  releaseFetch();
  assert.deepEqual(await firstRun, { status: "idle" });
});
