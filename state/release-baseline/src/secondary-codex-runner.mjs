import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "./config.mjs";
import { createResultRecord, pathAllowed, validateAssignmentRecord } from "./coordination-records.mjs";

const execFileAsync = promisify(execFile);
const CONFIG_KEYS = new Set(["schemaVersion", "controlBranch", "maxAttempts", "projects"]);
const PROJECT_KEYS = new Set(["taskArea", "repository", "checkout", "defaultBranch", "allowedPaths", "maxRuntimeMinutes", "enabled"]);
export const SECONDARY_CODEX_ARGS = Object.freeze(["exec", "--sandbox", "workspace-write", "--ephemeral"]);

export function validateSecondaryRunnerConfig(value) {
  exact(value, CONFIG_KEYS, "runner config");
  if (value.schemaVersion !== 1) throw new TypeError("Secondary runner schema version is invalid.");
  branch(value.controlBranch, "control branch");
  integer(value.maxAttempts, 1, 5, "maximum attempts");
  if (!Array.isArray(value.projects) || value.projects.length < 1 || value.projects.length > 32) throw new TypeError("Secondary runner projects are invalid.");
  const taskAreas = new Set();
  const projects = value.projects.map((project) => {
    exact(project, PROJECT_KEYS, "runner project");
    slug(project.taskArea, "project task area");
    if (taskAreas.has(project.taskArea)) throw new TypeError(`Duplicate project task area: ${project.taskArea}`);
    taskAreas.add(project.taskArea);
    if (typeof project.repository !== "string" || !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\.git$/.test(project.repository)) throw new TypeError("Project repository must be a bounded GitHub HTTPS URL.");
    if (typeof project.checkout !== "string" || !path.isAbsolute(project.checkout) || project.checkout.length > 500 || /[\r\n\0]/.test(project.checkout)) throw new TypeError("Project checkout is invalid.");
    branch(project.defaultBranch, "project default branch");
    paths(project.allowedPaths, 64, "project allowed paths");
    integer(project.maxRuntimeMinutes, 5, 240, "project maximum runtime");
    if (typeof project.enabled !== "boolean") throw new TypeError("Project enabled state is invalid.");
    return { ...project, allowedPaths: [...project.allowedPaths] };
  });
  return Object.freeze({ ...value, projects: Object.freeze(projects.map(Object.freeze)) });
}

export function projectForAssignment(config, assignment) {
  const validated = validateAssignmentRecord(assignment);
  const project = validateSecondaryRunnerConfig(config).projects.find((item) => item.enabled && item.taskArea === validated.taskArea);
  if (!project) return null;
  for (const allowed of validated.allowedPaths) if (!pathAllowed(allowed, project.allowedPaths)) {
    throw new TypeError(`Assignment path exceeds project scope: ${allowed}`);
  }
  return project;
}

export function buildSecondaryCodexPrompt(assignment) {
  const record = validateAssignmentRecord(assignment);
  return [
    "You are the bounded Secondary Codex executor. Implement the assignment in this isolated Git worktree.",
    `Assignment ID: ${record.assignmentId}`,
    `Task area: ${record.taskArea}`,
    `Title: ${record.title}`,
    `Task: ${record.expectedTask}`,
    `Allowed paths: ${record.allowedPaths.join(", ")}`,
    "Change only allowed paths. Run focused verification appropriate to the task.",
    "Do not read or export ChatGPT conversations, personal files, browser history, credentials, tokens, or unrelated context.",
    "Do not commit, push, create result metadata, change branches, or modify Git remotes; the runner handles those steps.",
  ].join("\n");
}

export function parsePorcelainPaths(source) {
  if (typeof source !== "string") throw new TypeError("Git status output is invalid.");
  const fields = source.split("\0").filter(Boolean);
  const result = [];
  for (let index = 0; index < fields.length; index += 1) {
    const entry = fields[index];
    if (entry.length < 4 || entry[2] !== " ") throw new TypeError("Git status entry is invalid.");
    result.push(normalizeRepoPath(entry.slice(3)));
    if (entry[0] === "R" || entry[0] === "C" || entry[1] === "R" || entry[1] === "C") {
      const original = fields[index + 1];
      if (!original) throw new TypeError("Git rename status is incomplete.");
      result.push(normalizeRepoPath(original));
      index += 1;
    }
  }
  return [...new Set(result)].sort();
}

export function assertChangedPathsAllowed(changedFiles, allowedPaths) {
  for (const file of changedFiles) if (!pathAllowed(normalizeRepoPath(file), allowedPaths)) {
    throw new TypeError(`Secondary Codex changed a path outside assignment scope: ${file}`);
  }
  return true;
}

export class SecondaryCodexRunner {
  constructor({ root = ROOT, run = execFileAsync, now = () => new Date() } = {}) {
    this.root = root;
    this.run = run;
    this.now = now;
    this.configFile = path.join(root, "state", "secondary-runner.json");
    this.stateFile = path.join(root, "state", "secondary-runner-state.json");
    this.workRoot = path.join(root, "state", "secondary-worktrees");
  }

  async status() {
    const config = await this.loadConfig();
    const state = await this.loadState();
    const git = await this.commandHealth("git", ["--version"]);
    const codex = await this.commandHealth("codex", ["--version"]);
    return {
      configured: true,
      git,
      codex,
      projects: config.projects.map(({ taskArea, repository, enabled }) => ({ taskArea, repository, enabled })),
      assignments: state.assignments,
    };
  }

  async runOnce() {
    const config = await this.loadConfig();
    const state = await this.loadState();
    const codex = await this.commandHealth("codex", ["--version"]);
    if (!codex.healthy) return { status: "unavailable", reason: "codex-command-unavailable" };
    const assignments = await this.listAssignments(config.controlBranch);
    for (const assignment of assignments) {
      const project = projectForAssignment(config, assignment);
      if (!project) continue;
      const record = state.assignments[assignment.assignmentId];
      if (record?.state === "completed" || (record?.attempts ?? 0) >= config.maxAttempts) continue;
      if (await this.remoteBranchExists(project.repository, assignment.returnBranch)) {
        state.assignments[assignment.assignmentId] = { attempts: record?.attempts ?? 0, state: "returned", updatedAt: this.now().toISOString() };
        await this.saveState(state);
        continue;
      }
      const attempt = (record?.attempts ?? 0) + 1;
      try {
        const result = await this.executeAssignment(assignment, project, attempt);
        state.assignments[assignment.assignmentId] = { attempts: attempt, state: "completed", returnBranch: result.returnBranch, returnCommit: result.returnCommit, updatedAt: this.now().toISOString() };
        await this.saveState(state);
        return { status: "completed", assignmentId: assignment.assignmentId, returnBranch: result.returnBranch, returnCommit: result.returnCommit };
      } catch (error) {
        state.assignments[assignment.assignmentId] = { attempts: attempt, state: attempt >= config.maxAttempts ? "failed" : "retryable", error: errorCode(error), updatedAt: this.now().toISOString() };
        await this.saveState(state);
        return { status: attempt >= config.maxAttempts ? "failed" : "retryable", assignmentId: assignment.assignmentId, attempt, reason: errorCode(error) };
      }
    }
    return { status: "idle" };
  }

  async listAssignments(controlBranch) {
    await this.exec("git", ["-C", this.root, "fetch", "origin", controlBranch], { timeout: 60_000 });
    const listing = await this.exec("git", ["-C", this.root, "ls-tree", "-r", "--name-only", `origin/${controlBranch}`, "--", "coordination/assignments"], { timeout: 30_000 });
    const files = listing.stdout.split(/\r?\n/).filter((file) => file.endsWith(".json")).sort();
    const assignments = [];
    for (const file of files) {
      const source = await this.exec("git", ["-C", this.root, "show", `origin/${controlBranch}:${file}`], { timeout: 30_000 });
      assignments.push(validateAssignmentRecord(JSON.parse(source.stdout)));
    }
    return assignments.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async executeAssignment(assignment, project, attempt) {
    const worktree = path.join(this.workRoot, `${assignment.assignmentId}-attempt-${attempt}`);
    await mkdir(this.workRoot, { recursive: true });
    await this.exec("git", ["clone", "--no-checkout", project.repository, worktree], { timeout: 300_000 });
    await this.exec("git", ["-C", worktree, "cat-file", "-e", `${assignment.expectedBaseCommit}^{commit}`], { timeout: 30_000 });
    await this.exec("git", ["-C", worktree, "merge-base", "--is-ancestor", assignment.expectedBaseCommit, `origin/${project.defaultBranch}`], { timeout: 30_000 });
    await this.exec("git", ["-C", worktree, "checkout", "-b", assignment.returnBranch, assignment.expectedBaseCommit], { timeout: 30_000 });
    await this.exec("codex", [...SECONDARY_CODEX_ARGS, buildSecondaryCodexPrompt(assignment)], { cwd: worktree, timeout: project.maxRuntimeMinutes * 60_000, maxBuffer: 1_048_576 });
    const status = await this.exec("git", ["-C", worktree, "status", "--porcelain=v1", "-z"], { timeout: 30_000 });
    const changedFiles = parsePorcelainPaths(status.stdout);
    assertChangedPathsAllowed(changedFiles, assignment.allowedPaths);
    await this.exec("git", ["-C", worktree, "add", "--all"], { timeout: 30_000 });
    await this.exec("git", ["-C", worktree, "-c", "user.name=Secondary Codex", "-c", "user.email=secondary-codex@users.noreply.github.com", "commit", "--allow-empty", "-m", `[SECONDARY] ${assignment.title}`], { timeout: 60_000 });
    const implementation = (await this.exec("git", ["-C", worktree, "rev-parse", "HEAD"], { timeout: 30_000 })).stdout.trim();
    const result = createResultRecord(assignment, {
      status: "completed",
      completedBy: "secondary-codex",
      returnCommit: implementation,
      changedFiles,
      verification: ["codex-exec-exit-0", "actual-changed-paths-enforced"],
      summary: "Secondary Codex completed the bounded assignment in an isolated worktree; model output was not persisted.",
    }, { now: this.now().toISOString() });
    const resultFile = path.join(worktree, "coordination", "results", `${assignment.assignmentId}.json`);
    await mkdir(path.dirname(resultFile), { recursive: true });
    await writeFile(resultFile, `${JSON.stringify(result, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await this.exec("git", ["-C", worktree, "add", `coordination/results/${assignment.assignmentId}.json`], { timeout: 30_000 });
    await this.exec("git", ["-C", worktree, "-c", "user.name=Secondary Codex", "-c", "user.email=secondary-codex@users.noreply.github.com", "commit", "-m", `[SECONDARY] Record ${assignment.assignmentId} result`], { timeout: 60_000 });
    await this.exec("git", ["-C", worktree, "push", "origin", `HEAD:refs/heads/${assignment.returnBranch}`], { timeout: 300_000 });
    return { returnBranch: assignment.returnBranch, returnCommit: implementation };
  }

  async remoteBranchExists(repository, branchName) {
    try {
      await this.exec("git", ["ls-remote", "--exit-code", repository, `refs/heads/${branchName}`], { timeout: 60_000 });
      return true;
    } catch (error) {
      if (Number(error?.code) === 2) return false;
      throw error;
    }
  }

  async commandHealth(command, args) {
    try {
      const result = await this.exec(command, args, { timeout: 10_000, maxBuffer: 64_000 });
      return { healthy: true, version: firstLine(result.stdout || result.stderr) };
    } catch (error) {
      return { healthy: false, error: errorCode(error) };
    }
  }

  async exec(command, args, options = {}) {
    return this.run(command, args, { encoding: "utf8", windowsHide: true, maxBuffer: 1_048_576, ...options });
  }

  async loadConfig() {
    return validateSecondaryRunnerConfig(JSON.parse(await readFile(this.configFile, "utf8")));
  }

  async loadState() {
    try {
      const value = JSON.parse(await readFile(this.stateFile, "utf8"));
      if (value?.schemaVersion === 1 && value.assignments && typeof value.assignments === "object") return value;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    return { schemaVersion: 1, assignments: {} };
  }

  async saveState(value) {
    await mkdir(path.dirname(this.stateFile), { recursive: true });
    const temporary = `${this.stateFile}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await rename(temporary, this.stateFile);
  }
}

function exact(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
  for (const key of Object.keys(value)) if (!keys.has(key)) throw new TypeError(`${label} field is not allowed: ${key}`);
  for (const key of keys) if (!Object.hasOwn(value, key)) throw new TypeError(`${label} field is missing: ${key}`);
}
function slug(value, label) { if (typeof value !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(value)) throw new TypeError(`${label} is invalid.`); }
function branch(value, label) { if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,119}$/.test(value) || value.includes("..") || value.endsWith("/")) throw new TypeError(`${label} is invalid.`); }
function integer(value, minimum, maximum, label) { if (!Number.isInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} is invalid.`); }
function paths(value, maximum, label) {
  if (!Array.isArray(value) || value.length < 1 || value.length > maximum || new Set(value).size !== value.length) throw new TypeError(`${label} are invalid.`);
  for (const item of value) normalizeRepoPath(item);
}
function normalizeRepoPath(value) {
  const normalized = String(value).replaceAll("\\", "/");
  if (!normalized || normalized.length > 200 || normalized.startsWith("/") || normalized.includes("..") || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(normalized)) throw new TypeError(`Repository path is invalid: ${value}`);
  return normalized;
}
function firstLine(value) { return String(value ?? "").split(/\r?\n/)[0].slice(0, 160); }
function errorCode(error) { return String(error?.code ?? error?.message ?? "runner-error").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").slice(0, 80) || "runner-error"; }