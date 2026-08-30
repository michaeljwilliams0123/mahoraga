import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const COMMIT = /^[a-f0-9]{40,64}$/i;
const LEASE_ID = /^int-[a-f0-9-]{36,}$/i;

export async function probeExecutionCellEnvironment(repositoryRoot, dependencies = {}) {
  const deps = dependencySet(dependencies);
  try {
    if (typeof repositoryRoot !== "string" || !path.isAbsolute(repositoryRoot)) throw cellError("execution-cell-repository-root-invalid");
    const repository = await deps.realpath(repositoryRoot);
    const status = await runGit(deps, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], repository);
    if (status.stdout.length > 0) throw cellError("authoritative-checkout-dirty");
    const headCommit = await resolveCommit(deps, repository, "HEAD");
    await runGit(deps, ["worktree", "list", "--porcelain"], repository);
    return Object.freeze({ verified: true, executionCellCanary: "verified", headCommit, observedAt: deps.now().toISOString() });
  } catch (error) {
    return Object.freeze({ verified: false, executionCellCanary: "failed", errorCode: error?.code ?? "execution-cell-canary-failed", observedAt: deps.now().toISOString() });
  }
}

export async function createExecutionCell(contract, dependencies = {}) {
  const deps = dependencySet(dependencies);
  const input = await normalizeContract(contract, deps);
  await assertLease(input, deps);
  const repositoryRoot = await deps.realpath(input.repositoryRoot);
  const expectedCellsRoot = path.resolve(repositoryRoot, "state", "execution-cells", "codex");
  const cellsRoot = path.resolve(deps.cellsRoot ?? expectedCellsRoot);
  if (cellsRoot !== expectedCellsRoot) assertWithin(expectedCellsRoot, cellsRoot, "execution-cell-root-escape");
  const authoritativeStatus = await runGit(deps, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], repositoryRoot);
  if (authoritativeStatus.stdout.length > 0) throw cellError("authoritative-checkout-dirty");
  const authoritativeHead = await resolveCommit(deps, repositoryRoot, "HEAD");
  const baseCommit = await resolveCommit(deps, repositoryRoot, `${input.baseCommit}^{commit}`);
  if (authoritativeHead !== baseCommit) throw cellError("authoritative-base-drift");

  await deps.mkdir(cellsRoot, { recursive: true });
  const identity = digest(`${input.taskId}\n${input.executionSessionId}\n${baseCommit}`).slice(0, 20);
  const cellPath = path.resolve(cellsRoot, `cell-${identity}`);
  assertWithin(cellsRoot, cellPath, "execution-cell-path-escape");
  if (cellPath === repositoryRoot) throw cellError("execution-cell-authoritative-root-forbidden");
  if (await exists(cellPath, deps)) throw cellError("execution-cell-already-exists");
  const branch = `mahoraga/task-${safeSegment(input.taskId).slice(0, 36)}-${identity.slice(0, 8)}`;

  let added = false;
  try {
    await runGit(deps, ["worktree", "add", "--detach", cellPath, baseCommit], repositoryRoot);
    added = true;
    await runGit(deps, ["switch", "-c", branch], cellPath);
    const resolvedCell = await deps.realpath(cellPath);
    assertWithin(cellsRoot, resolvedCell, "execution-cell-realpath-escape");
    return Object.freeze({
      schemaVersion: 1,
      id: `cell-${identity}`,
      taskId: input.taskId,
      executionSessionId: input.executionSessionId,
      integrationLeaseId: input.integrationLeaseId,
      repositoryRoot,
      cellsRoot,
      path: resolvedCell,
      pathSha256: digest(normalizeCase(resolvedCell)),
      baseCommit,
      branch,
      allowedPaths: Object.freeze([...input.allowedPaths]),
      createdAt: deps.now().toISOString(),
      quarantineState: "clear",
    });
  } catch (error) {
    if (added) await runGit(deps, ["worktree", "remove", "--force", cellPath], repositoryRoot, { allowFailure: true });
    throw error;
  }
}

export async function inspectExecutionCell(cell, dependencies = {}) {
  const deps = dependencySet(dependencies);
  const value = normalizeCell(cell);
  const resolvedCell = await deps.realpath(value.path);
  assertWithin(value.cellsRoot, resolvedCell, "execution-cell-realpath-escape");
  const status = await runGit(deps, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], resolvedCell);
  const workingPaths = parsePorcelain(status.stdout);
  const committedPaths = parseZeroList((await runGit(deps, ["diff", "--name-only", "--no-renames", "-z", value.baseCommit, "HEAD"], resolvedCell)).stdout);
  const changedPaths = [...new Set([...workingPaths, ...committedPaths])].sort();
  const conflicts = parseZeroList((await runGit(deps, ["diff", "--name-only", "--diff-filter=U", "-z", "HEAD"], resolvedCell)).stdout);
  const headCommit = await resolveCommit(deps, resolvedCell, "HEAD");
  const authoritativeHead = await resolveCommit(deps, value.repositoryRoot, "HEAD");
  const branch = (await runGit(deps, ["branch", "--show-current"], resolvedCell)).stdout.trim();
  const violations = [];
  if (authoritativeHead !== value.baseCommit) violations.push("authoritative-base-drift");
  if (branch !== value.branch) violations.push("execution-cell-branch-drift");
  if (conflicts.length > 0) violations.push("execution-cell-unresolved-conflicts");
  if (changedPaths.length > 0 && headCommit === value.baseCommit) violations.push("candidate-commit-missing");
  if (changedPaths.length === 0 && headCommit !== value.baseCommit) violations.push("candidate-commit-empty");
  for (const changedPath of changedPaths) {
    if (!pathAllowed(changedPath, value.allowedPaths)) violations.push(`changed-path-outside-allowlist:${changedPath}`);
    const absolute = path.resolve(resolvedCell, ...changedPath.split("/"));
    try {
      const info = await deps.lstat(absolute);
      if (info.isSymbolicLink()) {
        const target = await deps.realpath(absolute);
        if (!isWithin(resolvedCell, target)) violations.push(`changed-path-link-escape:${changedPath}`);
      } else {
        const resolved = await deps.realpath(absolute);
        if (!isWithin(resolvedCell, resolved)) violations.push(`changed-path-reparse-escape:${changedPath}`);
      }
    } catch (error) {
      if (error?.code !== "ENOENT") violations.push(`changed-path-inspection-failed:${changedPath}`);
    }
  }
  return Object.freeze({
    cellId: value.id,
    baseCommit: value.baseCommit,
    headCommit,
    branch,
    changedPaths: Object.freeze(changedPaths),
    conflicts: Object.freeze(conflicts),
    violations: Object.freeze([...new Set(violations)]),
    validationState: violations.length === 0 ? "passed" : "failed",
    inspectedAt: deps.now().toISOString(),
  });
}

export async function quarantineExecutionCell(cell, reason, dependencies = {}) {
  const deps = dependencySet(dependencies);
  const value = normalizeCell(cell);
  const code = bounded(reason, 120, "execution-cell-quarantine-reason-invalid");
  const quarantineRoot = path.resolve(path.dirname(value.cellsRoot), "quarantine");
  await deps.mkdir(quarantineRoot, { recursive: true });
  const marker = path.resolve(quarantineRoot, `${value.id}.json`);
  assertWithin(quarantineRoot, marker, "execution-cell-quarantine-path-escape");
  try {
    await deps.writeFile(marker, `${JSON.stringify({
      schemaVersion: 1,
      cellId: value.id,
      pathSha256: value.pathSha256,
      baseCommit: value.baseCommit,
      branch: value.branch,
      reason: code,
      quarantinedAt: deps.now().toISOString(),
    }, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  return Object.freeze({ ...value, quarantineState: "quarantined", quarantineReason: code, quarantineMarker: marker });
}

export async function removeExecutionCell(cell, dependencies = {}) {
  const deps = dependencySet(dependencies);
  const value = normalizeCell(cell);
  await runGit(deps, ["worktree", "remove", "--force", value.path], value.repositoryRoot);
  await runGit(deps, ["branch", "-D", value.branch], value.repositoryRoot, { allowFailure: true });
  await deps.rm(value.path, { recursive: true, force: true });
  return Object.freeze({ removed: true, cellId: value.id, removedAt: deps.now().toISOString() });
}

export function pathAllowed(candidate, allowedPaths) {
  const value = normalizeRepoPath(candidate);
  return allowedPaths.some((allowed) => value === allowed || value.startsWith(`${allowed}/`));
}

async function normalizeContract(contract, deps) {
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) throw cellError("execution-cell-contract-invalid");
  const taskId = bounded(contract.taskId, 100, "execution-cell-task-id-invalid");
  const executionSessionId = bounded(contract.executionSessionId ?? `execution-${taskId}`, 120, "execution-cell-session-id-invalid");
  if (typeof contract.repositoryRoot !== "string" || !path.isAbsolute(contract.repositoryRoot)) throw cellError("execution-cell-repository-root-invalid");
  if (!COMMIT.test(contract.baseCommit ?? "")) throw cellError("execution-cell-base-commit-invalid");
  if (!LEASE_ID.test(contract.integrationLeaseId ?? "")) throw cellError("integration-lease-required");
  const allowedPaths = normalizeAllowedPaths(contract.allowedPaths);
  const integrationLease = deps.verifyLease
    ? await deps.verifyLease(contract.integrationLeaseId, allowedPaths)
    : contract.integrationLease;
  return Object.freeze({ taskId, executionSessionId, repositoryRoot: path.resolve(contract.repositoryRoot), baseCommit: contract.baseCommit.toLowerCase(), integrationLeaseId: contract.integrationLeaseId, integrationLease, allowedPaths });
}

async function assertLease(contract, deps) {
  const lease = contract.integrationLease;
  if (!lease || lease.leaseId !== contract.integrationLeaseId) throw cellError("integration-lease-not-active");
  if (!Array.isArray(lease.paths)) throw cellError("integration-lease-paths-insufficient");
  const leasedPaths = lease.paths.map(normalizeRepoPath);
  if (!contract.allowedPaths.every((allowed) => leasedPaths.some((leased) => allowed === leased || allowed.startsWith(`${leased}/`)))) throw cellError("integration-lease-paths-insufficient");
  if (!Number.isFinite(Date.parse(lease.expiresAt)) || Date.parse(lease.expiresAt) <= deps.now().getTime()) throw cellError("integration-lease-expired");
}

function normalizeCell(cell) {
  if (!cell || cell.schemaVersion !== 1 || typeof cell.id !== "string" || typeof cell.path !== "string" || typeof cell.repositoryRoot !== "string" || typeof cell.cellsRoot !== "string" || !COMMIT.test(cell.baseCommit ?? "") || typeof cell.branch !== "string") throw cellError("execution-cell-record-invalid");
  const value = { ...cell, path: path.resolve(cell.path), repositoryRoot: path.resolve(cell.repositoryRoot), cellsRoot: path.resolve(cell.cellsRoot), allowedPaths: normalizeAllowedPaths(cell.allowedPaths) };
  assertWithin(value.cellsRoot, value.path, "execution-cell-path-escape");
  return Object.freeze(value);
}

function normalizeAllowedPaths(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 64) throw cellError("execution-cell-allowed-paths-invalid");
  return Object.freeze([...new Set(value.map(normalizeRepoPath))].sort());
}

function normalizeRepoPath(value) {
  if (typeof value !== "string") throw cellError("execution-cell-repository-path-invalid");
  const normalized = value.replace(/^\.\//, "").replace(/\/$/, "");
  const segments = normalized.split("/");
  if (!normalized || normalized.length > 240 || normalized.startsWith("/") || normalized.includes("\\") || /[\u0000-\u001f\u007f:*?]/.test(normalized) || segments.some((segment) => !segment || segment === "." || segment === "..") || normalized === ".git" || normalized.startsWith(".git/")) throw cellError("execution-cell-repository-path-invalid");
  return normalized;
}

function parsePorcelain(source) {
  const records = String(source ?? "").split("\0");
  const changed = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (!record) continue;
    if (record.length < 4) throw cellError("execution-cell-status-invalid");
    const code = record.slice(0, 2);
    changed.push(normalizeRepoPath(record.slice(3)));
    if (/[RC]/.test(code)) {
      if (!records[index + 1]) throw cellError("execution-cell-status-invalid");
      changed.push(normalizeRepoPath(records[index + 1]));
      index += 1;
    }
  }
  return [...new Set(changed)].sort();
}

function parseZeroList(source) {
  return [...new Set(String(source ?? "").split("\0").filter(Boolean).map(normalizeRepoPath))].sort();
}

async function resolveCommit(deps, cwd, revision) {
  const result = await runGit(deps, ["rev-parse", "--verify", revision], cwd);
  const commit = result.stdout.trim().toLowerCase();
  if (!COMMIT.test(commit)) throw cellError("execution-cell-git-commit-invalid");
  return commit;
}

async function runGit(deps, args, cwd, options = {}) {
  try {
    const result = await deps.git(args, { cwd, allowFailure: options.allowFailure === true });
    const normalized = { exitCode: Number(result?.exitCode ?? 0), stdout: String(result?.stdout ?? ""), stderr: String(result?.stderr ?? "") };
    if (normalized.exitCode !== 0 && !options.allowFailure) throw cellError("execution-cell-git-command-failed");
    return normalized;
  } catch (error) {
    if (options.allowFailure) return { exitCode: Number(error?.code ?? 1), stdout: String(error?.stdout ?? ""), stderr: String(error?.stderr ?? "") };
    if (error?.code?.startsWith?.("execution-cell-")) throw error;
    throw cellError("execution-cell-git-command-failed");
  }
}

function dependencySet(input) {
  const source = input && typeof input === "object" ? input : {};
  const injectedGit = typeof source.git === "function" ? source.git : typeof source.run === "function" ? source.run : null;
  return {
    git: injectedGit ?? nativeGit,
    verifyLease: typeof source.verifyLease === "function" ? source.verifyLease : null,
    cellsRoot: source.cellsRoot,
    now: typeof source.now === "function" ? source.now : () => new Date(),
    lstat: source.lstat ?? lstat,
    mkdir: source.mkdir ?? mkdir,
    realpath: source.realpath ?? realpath,
    rm: source.rm ?? rm,
    writeFile: source.writeFile ?? writeFile,
  };
}

async function nativeGit(args, { cwd, allowFailure = false } = {}) {
  try {
    const result = await execFileAsync("git", args, { cwd, windowsHide: true, timeout: 30_000, maxBuffer: 1024 * 1024, encoding: "utf8" });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    if (!allowFailure) throw error;
    return { exitCode: Number.isInteger(error?.code) ? error.code : 1, stdout: error?.stdout ?? "", stderr: error?.stderr ?? error?.message ?? "" };
  }
}

async function exists(target, deps) {
  try { await deps.lstat(target); return true; } catch (error) { if (error?.code === "ENOENT") return false; throw error; }
}

function assertWithin(base, target, code) {
  if (!isWithin(base, target) || path.resolve(base) === path.resolve(target)) throw cellError(code);
}

function isWithin(base, target) {
  const relative = path.relative(path.resolve(base), path.resolve(target));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function safeSegment(value) { return value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "task"; }
function normalizeCase(value) { return process.platform === "win32" ? value.toLowerCase() : value; }
function bounded(value, maximum, code) { if (typeof value !== "string" || value.length < 1 || value.length > maximum || /[\r\n\u0000]/.test(value)) throw cellError(code); return value; }
function digest(value) { return createHash("sha256").update(value, "utf8").digest("hex"); }
function cellError(code) { const error = new Error(code); error.code = code; return error; }
