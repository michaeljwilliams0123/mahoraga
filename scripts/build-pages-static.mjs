import { spawn } from "node:child_process";
import { cp, lstat, mkdir, rm, symlink } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SERVER_ONLY_ROUTE_DIRECTORIES = Object.freeze([
  path.join("app", "api", "live"),
  path.join("app", "api", "ready"),
  path.join("app", "api", "runtime"),
]);

function relativePath(root, candidate) {
  return path.relative(root, candidate);
}

function hasPathPrefix(value, prefix) {
  return value === prefix || value.startsWith(`${prefix}${path.sep}`);
}

function shouldCopyPagesFile(source, candidate) {
  const relative = relativePath(source, candidate);
  if (!relative) return true;
  if (hasPathPrefix(relative, "node_modules") || hasPathPrefix(relative, ".next") || hasPathPrefix(relative, "out") || hasPathPrefix(relative, ".pages-static-staging")) return false;
  return !SERVER_ONLY_ROUTE_DIRECTORIES.some((directory) => hasPathPrefix(relative, directory));
}

export async function preparePagesStaticWorkspace({ source, destination }) {
  await cp(source, destination, {
    recursive: true,
    filter: (candidate) => shouldCopyPagesFile(source, candidate),
  });
}

function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: "inherit", windowsHide: true });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`pages-static-build-failed:${code ?? signal ?? "unknown"}`));
    });
  });
}

export function pagesStaticStagingRoot(source) {
  return path.join(path.resolve(source, ".."), ".pages-static-staging");
}

export async function linkPagesDependencies({ source, destination }) {
  const sourceDependencies = path.join(source, "node_modules");
  await lstat(sourceDependencies);
  await symlink(sourceDependencies, path.join(destination, "node_modules"), process.platform === "win32" ? "junction" : "dir");
}

export async function buildPagesStaticExport({ source = path.resolve(import.meta.dirname, "..", "cloud-app") } = {}) {
  const stagingRoot = pagesStaticStagingRoot(source);
  const stagedApp = path.join(stagingRoot, "cloud-app");
  const output = path.join(source, "out");
  try {
    await rm(stagingRoot, { recursive: true, force: true });
    await preparePagesStaticWorkspace({ source, destination: stagedApp });
    await cp(path.resolve(source, "..", "operator-deck"), path.join(stagingRoot, "operator-deck"), { recursive: true, filter: (candidate) => !hasPathPrefix(relativePath(path.resolve(source, "..", "operator-deck"), candidate), "node_modules") });
    await linkPagesDependencies({ source, destination: stagedApp });
    await run(process.execPath, [path.join(stagedApp, "node_modules", "next", "dist", "bin", "next"), "build"], {
      cwd: stagedApp,
      env: { ...process.env, MAHORAGA_PAGES_EXPORT: "1", MAHORAGA_TURBOPACK_ROOT: path.resolve(source, "..") },
    });
    await rm(output, { recursive: true, force: true });
    await mkdir(output, { recursive: true });
    await cp(path.join(stagedApp, "out"), output, { recursive: true });
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
}

export function isDirectExecution(metaUrl, commandPath) {
  return typeof commandPath === "string" && metaUrl === pathToFileURL(path.resolve(commandPath)).href;
}

if (isDirectExecution(import.meta.url, process.argv[1])) await buildPagesStaticExport();
