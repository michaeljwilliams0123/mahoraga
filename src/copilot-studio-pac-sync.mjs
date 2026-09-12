import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { applyCopilotStudioWorkspaceMutation, validateCopilotStudioWorkspace } from "./copilot-studio-workspace-mutation.mjs";

const execFileAsync = promisify(execFile);
const ALIASES = new Set(["general-mahoraga", "enterprise-core", "tenant-health-reader"]);
const SAFE_ROOT_NAME = "copilot-studio-sync";
const MAX_SNAPSHOT_FILES = 2048;
const MAX_SNAPSHOT_FILE_BYTES = 8 * 1024 * 1024;
const MAX_SNAPSHOT_TOTAL_BYTES = 32 * 1024 * 1024;

export async function executeCopilotStudioPacSync(request, dependencies = {}) {
  const platform = dependencies.platform ?? process.platform;
  if (platform !== "win32") throw safeError("studio-pac-windows-required");
  if (!ALIASES.has(request?.alias)) throw safeError("studio-pac-agent-invalid");

  const resolveAgent = dependencies.resolveAgent ?? defaultResolveAgent;
  const runPac = dependencies.runPac ?? defaultRunPac;
  const ensureWorkspace = dependencies.ensureWorkspace ?? defaultEnsureWorkspace;
  const snapshotWorkspace = dependencies.snapshotWorkspace ?? snapshotCopilotStudioWorkspace;
  const applyMutation = dependencies.applyMutation ?? applyCopilotStudioWorkspaceMutation;
  const validateWorkspace = dependencies.validateWorkspace ?? validateCopilotStudioWorkspace;

  const binding = await resolveAgent(request.alias);
  if (!binding || binding.alias !== request.alias || !safeName(binding.workspaceName)) throw safeError("studio-pac-agent-invalid");
  const workspaceRoot = path.resolve(dependencies.workspaceRoot ?? path.join(process.env.LOCALAPPDATA ?? process.cwd(), "Mahoraga", SAFE_ROOT_NAME));
  const workspacePath = path.resolve(workspaceRoot, binding.workspaceName);
  if (!inside(workspaceRoot, workspacePath)) throw safeError("studio-pac-workspace-invalid");
  const workspace = await ensureWorkspace({ workspaceRoot, workspacePath, binding, runPac });
  if (workspace?.verified !== true) throw safeError("studio-pac-workspace-invalid");

  await runFixedPac(runPac, ["copilot", "pull", "--project-dir", workspacePath]);
  const pulledSha256 = await snapshotWorkspace(workspacePath);
  requireDigest(pulledSha256);

  const mutation = await applyMutation({
    alias: request.alias,
    workspacePath,
    surfaces: request.surfaces,
    reasonCodes: request.reasonCodes,
  });
  if (mutation?.verified !== true || !Array.isArray(mutation.changedFiles) || mutation.changedFiles.length < 1) throw safeError("studio-pac-verification-failed");
  const changedFileKinds = normalizeChangedFiles(mutation.changedFiles, workspacePath);

  if (typeof dependencies.verifyMutationBase === "function" && await dependencies.verifyMutationBase({ workspacePath, pulledSha256, mutation }) !== true) {
    throw safeError("studio-pac-drift-detected");
  }
  const validation = await validateWorkspace({ workspacePath, alias: request.alias, surfaces: request.surfaces, reasonCodes: request.reasonCodes });
  if (validation?.verified !== true) throw safeError("studio-pac-verification-failed");

  await runFixedPac(runPac, ["copilot", "push", "--project-dir", workspacePath]);
  const phases = ["pull", "validate", "push"];
  let evaluation = null;
  if (request.publish === true) {
    if (typeof dependencies.evaluateAgent !== "function") throw safeError("studio-pac-evaluation-required");
    const evaluated = await dependencies.evaluateAgent({ alias: request.alias, surfaces: request.surfaces, reasonCodes: request.reasonCodes });
    if (evaluated?.verified !== true || evaluated.state !== "passing" || !Number.isFinite(Number(evaluated.score))) throw safeError("studio-pac-evaluation-failed");
    const score = Number(evaluated.score);
    if (score < 0 || score > 1) throw safeError("studio-pac-evaluation-failed");
    evaluation = Object.freeze({ state: "passing", scoreBasisPoints: Math.round(score * 10000) });
    phases.push("evaluate");
    if (!safeName(binding.botSchemaName)) throw safeError("studio-pac-agent-invalid");
    await runFixedPac(runPac, ["copilot", "publish", "--bot", binding.botSchemaName]);
    phases.push("publish");
  }
  const finalSha256 = await snapshotWorkspace(workspacePath);
  requireDigest(finalSha256);
  return Object.freeze({
    verified: true,
    phases: Object.freeze(phases),
    published: request.publish === true,
    workspaceSha256: finalSha256,
    changedFileKinds: Object.freeze(changedFileKinds),
    ...(evaluation ? { evaluation } : {}),
  });
}

async function defaultRunPac(command, args, options = {}) {
  if (command !== "pac.cmd") throw safeError("studio-pac-command-invalid");
  if (!fixedOperation(args)) throw safeError("studio-pac-operation-invalid");
  return execFileAsync("cmd.exe", ["/d", "/s", "/c", "pac.cmd", ...args], {
    windowsHide: true,
    timeout: 120000,
    maxBuffer: 256 * 1024,
    ...options,
  });
}

async function runFixedPac(runPac, args) {
  try { return await runPac("pac.cmd", args, { windowsHide: true, timeout: 120000, maxBuffer: 256 * 1024 }); }
  catch { throw safeError("studio-pac-command-failed"); }
}

async function defaultEnsureWorkspace({ workspaceRoot, workspacePath }) {
  await mkdir(workspaceRoot, { recursive: true });
  const info = await stat(workspacePath).catch(() => null);
  return Object.freeze({ verified: info?.isDirectory() === true, workspacePath });
}

export async function snapshotCopilotStudioWorkspace(workspacePath) {
  const root = path.resolve(workspacePath);
  const rootInfo = await lstat(root).catch(() => null);
  if (!rootInfo?.isDirectory() || rootInfo.isSymbolicLink()) throw safeError("studio-pac-workspace-invalid");
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const files = entries.filter((item) => item.isFile() || item.isSymbolicLink());
  if (files.length > MAX_SNAPSHOT_FILES) throw safeError("studio-pac-workspace-invalid");
  const rows = [];
  let totalBytes = 0;
  for (const entry of files) {
    const parent = entry.parentPath ?? entry.path ?? root;
    const absolute = path.resolve(parent, entry.name);
    if (!inside(root, absolute)) throw safeError("studio-pac-workspace-invalid");
    const info = await lstat(absolute);
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_SNAPSHOT_FILE_BYTES) throw safeError("studio-pac-workspace-invalid");
    totalBytes += info.size;
    if (totalBytes > MAX_SNAPSHOT_TOTAL_BYTES) throw safeError("studio-pac-workspace-invalid");
    const relative = path.relative(root, absolute).replace(/\\/g, "/");
    const fileSha256 = createHash("sha256").update(await readFile(absolute)).digest("hex");
    rows.push(`${relative}\0${info.size}\0${fileSha256}`);
  }
  rows.sort();
  return createHash("sha256").update(rows.join("\n"), "utf8").digest("hex");
}

async function defaultResolveAgent(alias) {
  const workspaceName = alias;
  const botSchemaName = process.env[`MAHORAGA_STUDIO_${alias.replace(/-/g, "_").toUpperCase()}_SCHEMA`];
  return Object.freeze({ alias, workspaceName, botSchemaName: botSchemaName ?? "" });
}

function normalizeChangedFiles(files, workspacePath) {
  const kinds = new Set();
  for (const file of files) {
    if (typeof file !== "string" || file.length < 1 || file.length > 240) throw safeError("studio-pac-workspace-invalid");
    const absolute = path.resolve(workspacePath, file);
    if (!inside(workspacePath, absolute)) throw safeError("studio-pac-workspace-invalid");
    const normalized = file.replace(/\\/g, "/");
    if (/^actions\//.test(normalized)) kinds.add("action");
    else if (/^knowledge\//.test(normalized)) kinds.add("knowledge");
    else if (/^topics\//.test(normalized)) kinds.add("topic");
    else if (/^workflows\//.test(normalized)) kinds.add("workflow");
    else if (/^trigger\//.test(normalized)) kinds.add("trigger");
    else if (/^(agent\.mcs\.ya?ml|settings\.mcs\.ya?ml)$/.test(normalized)) kinds.add("agent-config");
    else throw safeError("studio-pac-workspace-invalid");
  }
  return [...kinds].sort();
}

function fixedOperation(args) {
  if (!Array.isArray(args) || args[0] !== "copilot") return false;
  if (["pull", "push"].includes(args[1])) return args.length === 4 && args[2] === "--project-dir" && typeof args[3] === "string";
  if (args[1] === "publish") return args.length === 4 && args[2] === "--bot" && safeName(args[3]);
  return false;
}

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
function safeName(value) { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(value); }
function requireDigest(value) { if (!/^[a-f0-9]{64}$/.test(String(value ?? ""))) throw safeError("studio-pac-workspace-invalid"); }
function safeError(code) { return Object.assign(new Error(code), { code }); }
