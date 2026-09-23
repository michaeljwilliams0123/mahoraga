import { spawn } from "node:child_process";
import { cp, lstat, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SERVER_ONLY_ROUTE_DIRECTORIES = Object.freeze([path.join("app", "api")]);

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

export async function writePagesStaticHealth(destination, env = process.env) {
  const target = path.join(destination, "public", "api", "health.json");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify({
    ok: true,
    product: "Mahoraga",
    build: { version: "7.0.0-alpha.2" },
    deployment: {
      provider: env.MAHORAGA_DEPLOYMENT_PROVIDER?.trim() || (env.MAHORAGA_STATIC_EXPORT_TARGET === "cloudflare" ? "cloudflare-workers" : "github-pages"),
      environment: env.MAHORAGA_DEPLOYMENT_ENV?.trim() || "production",
      url: env.MAHORAGA_DEPLOYMENT_URL?.trim() || null,
      commitSha: env.MAHORAGA_GIT_COMMIT_SHA?.trim() || null,
      expectedCommitSha: null,
      gitRef: env.MAHORAGA_GIT_COMMIT_REF?.trim() || null,
      promotion: env.MAHORAGA_STATIC_EXPORT_TARGET === "cloudflare" ? "unverified-cloudflare-static" : "exact-main-pages",
    },
    runtime: {
      databaseTarget: { basename: null, source: "paired-core-required" },
      provenance: { state: "unknown", expectedSourceCommit: null, source: "paired-core-required" },
    },
    capabilities: { runtimeRelay: true, directConversationExecution: false, directProviderSelection: false },
    boundaries: { executionPlane: "client-shell-with-owner-paired-core", localExtensionRequired: false, localDeviceMutationAllowed: false, relaySeesPlaintext: false },
    routing: { authority: "paired-mahoraga-core", automaticPaidFallback: false, browserMaySelectProvider: false },
  })}\n`, "utf8");
  return target;
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

const FORBIDDEN_STATIC_MARKERS = Object.freeze([
  "MAHORAGA_CLOUD_OWNER_LOGIN_SECRET",
  "MAHORAGA_CLOUD_OWNER_PIN_HASH",
  "MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET",
  "MAHORAGA_CLOUD_SESSION_SECRET",
  "MAHORAGA_PRIMARY_CODEX_TOKEN",
  "MAHORAGA_CONTENT_VAULT_MASTER_KEY",
  'location.replace("https://mahoraga-runtime',
]);
const TEXT_ASSET_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".map", ".mjs", ".svg", ".txt", ".xml"]);

async function pagesTextFiles(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const candidate = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await pagesTextFiles(candidate));
    else if (entry.isFile() && TEXT_ASSET_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(candidate);
  }
  return files;
}

export async function inspectPagesStaticArtifact(root, { target = "pages" } = {}) {
  const indexHtml = path.join(root, "index.html");
  let index;
  try { index = await readFile(indexHtml, "utf8"); }
  catch { throw new Error("pages-static-artifact-entry-invalid"); }
  const assetPath = target === "cloudflare" ? "/_next/static/" : "/mahoraga/_next/static/";
  if (!index.includes(assetPath) || /http-equiv=["']refresh["']/i.test(index) || /location\.replace\(/.test(index)) {
    throw new Error("pages-static-artifact-entry-invalid");
  }
  const files = await pagesTextFiles(root);
  for (const file of files) {
    const content = file === indexHtml ? index : await readFile(file, "utf8");
    for (const marker of FORBIDDEN_STATIC_MARKERS) {
      if (content.includes(marker)) throw new Error(`pages-static-artifact-forbidden:${marker}`);
    }
  }
  return { indexHtml, textFiles: files.length };
}

export async function buildPagesStaticExport({ source = path.resolve(import.meta.dirname, "..", "cloud-app"), target = "pages" } = {}) {
  if (target !== "pages" && target !== "cloudflare") throw new TypeError("static-export-target-invalid");
  const stagingRoot = pagesStaticStagingRoot(source);
  const stagedApp = path.join(stagingRoot, "cloud-app");
  const output = path.join(source, "out");
  try {
    await rm(stagingRoot, { recursive: true, force: true });
    await preparePagesStaticWorkspace({ source, destination: stagedApp });
    await writePagesStaticHealth(stagedApp, { ...process.env, MAHORAGA_STATIC_EXPORT_TARGET: target });
    await cp(path.resolve(source, "..", "operator-deck"), path.join(stagingRoot, "operator-deck"), { recursive: true, filter: (candidate) => !hasPathPrefix(relativePath(path.resolve(source, "..", "operator-deck"), candidate), "node_modules") });
    await linkPagesDependencies({ source, destination: stagedApp });
    await run(process.execPath, [path.join(stagedApp, "node_modules", "next", "dist", "bin", "next"), "build"], {
      cwd: stagedApp,
      env: { ...process.env, MAHORAGA_PAGES_EXPORT: "1", MAHORAGA_STATIC_EXPORT_TARGET: target,
        NEXT_PUBLIC_HEALTH_ENDPOINT: process.env.NEXT_PUBLIC_HEALTH_ENDPOINT || (target === "cloudflare" ? "/api/health.json" : "/mahoraga/api/health.json"),
        MAHORAGA_TURBOPACK_ROOT: path.resolve(source, "..") },
    });
    await rm(output, { recursive: true, force: true });
    await mkdir(output, { recursive: true });
    await cp(path.join(stagedApp, "out"), output, { recursive: true });
    await inspectPagesStaticArtifact(output, { target });
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
}

export function isDirectExecution(metaUrl, commandPath) {
  return typeof commandPath === "string" && metaUrl === pathToFileURL(path.resolve(commandPath)).href;
}

if (isDirectExecution(import.meta.url, process.argv[1])) await buildPagesStaticExport({ target: process.argv[2] === "--cloudflare" ? "cloudflare" : "pages" });
