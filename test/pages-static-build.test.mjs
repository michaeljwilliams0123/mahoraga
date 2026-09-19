import assert from "node:assert/strict";
import test from "node:test";
import { access, lstat, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { inspectPagesStaticArtifact, isDirectExecution, linkPagesDependencies, pagesStaticStagingRoot, preparePagesStaticWorkspace } from "../scripts/build-pages-static.mjs";

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

test("Pages staging retains static health metadata and excludes server-only runtime APIs", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mahoraga-pages-static-test-"));
  const source = path.join(root, "source");
  const destination = path.join(root, "destination");

  await Promise.all([
    mkdir(path.join(source, "app", "api", "health"), { recursive: true }),
    mkdir(path.join(source, "app", "api", "live"), { recursive: true }),
    mkdir(path.join(source, "app", "api", "ready"), { recursive: true }),
    mkdir(path.join(source, "app", "api", "runtime", "session"), { recursive: true }),
    mkdir(path.join(source, "app", "api", "runtime", "action"), { recursive: true }),
    mkdir(path.join(source, "app"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(path.join(source, "app", "page.tsx"), "export default function Page() { return null; }\n"),
    writeFile(path.join(source, "app", "api", "health", "route.ts"), "export function GET() { return Response.json({ ok: true }); }\n"),
    writeFile(path.join(source, "app", "api", "live", "route.ts"), "export const dynamic = 'force-dynamic';\n"),
    writeFile(path.join(source, "app", "api", "ready", "route.ts"), "export const dynamic = 'force-dynamic';\n"),
    writeFile(path.join(source, "app", "api", "runtime", "session", "route.ts"), "export const dynamic = 'force-dynamic';\n"),
    writeFile(path.join(source, "app", "api", "runtime", "action", "route.ts"), "export const dynamic = 'force-dynamic';\n"),
  ]);

  await preparePagesStaticWorkspace({ source, destination });

  assert.equal(await exists(path.join(destination, "app", "page.tsx")), true);
  assert.equal(await exists(path.join(destination, "app", "api", "health", "route.ts")), true);
  assert.equal(await exists(path.join(destination, "app", "api", "live")), false);
  assert.equal(await exists(path.join(destination, "app", "api", "ready")), false);
  assert.equal(await exists(path.join(destination, "app", "api", "runtime")), false);
});

test("Pages static build recognizes a relative Windows command-line path", () => {
  const script = path.resolve("scripts", "build-pages-static.mjs");
  assert.equal(isDirectExecution(pathToFileURL(script).href, path.join("scripts", "build-pages-static.mjs")), true);
});

test("Pages staging stays inside the repository root without copying the UI into itself", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mahoraga-pages-dependencies-test-"));
  const source = path.join(root, "source");
  const destination = path.join(pagesStaticStagingRoot(source), "app");
  await mkdir(path.join(source, "node_modules", "next"), { recursive: true });
  await mkdir(destination, { recursive: true });
  await writeFile(path.join(source, "node_modules", "next", "package.json"), "{}\n");

  await linkPagesDependencies({ source, destination });

  const copied = path.join(destination, "node_modules", "next", "package.json");
  assert.equal(await exists(copied), true);
  assert.equal((await lstat(path.join(destination, "node_modules"))).isSymbolicLink(), true);
  assert.equal(path.relative(root, destination).startsWith(".."), false);
  assert.equal(path.relative(source, destination).startsWith(".."), true);
});

test("Pages publishes the real workspace and has no Railway launcher contract", async () => {
  const builder = await readFile(new URL("../scripts/build-pages-static.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(builder, /pagesLauncherHtml/);
  assert.doesNotMatch(builder, /DEFAULT_CANONICAL_WORKSPACE_URL/);
  assert.match(builder, /FORBIDDEN_STATIC_MARKERS/);

  const workflow = await readFile(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8");
  assert.match(workflow, /NEXT_PUBLIC_MAHORAGA_API_ORIGIN:\s*\$\{\{ vars\.MAHORAGA_API_ORIGIN \}\}/);
  assert.doesNotMatch(workflow, /MAHORAGA_CANONICAL_WORKSPACE_URL/);
  assert.doesNotMatch(workflow, /mahoraga-runtime-main-production\.up\.railway\.app/);
  assert.match(workflow, /actions\/configure-pages/);
  assert.match(workflow, /actions\/upload-pages-artifact/);
  assert.match(workflow, /actions\/deploy-pages/);
});


test("Pages artifact inspection accepts the real workspace shape and rejects server secrets or Railway redirect wiring", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mahoraga-pages-artifact-test-"));
  const safe = path.join(root, "safe");
  await mkdir(path.join(safe, "_next", "static", "chunks"), { recursive: true });
  await writeFile(path.join(safe, "index.html"), '<!doctype html><html><body><div id="app">Mahoraga</div><script src="/mahoraga/_next/static/chunks/app.js"></script></body></html>');
  await writeFile(path.join(safe, "_next", "static", "chunks", "app.js"), 'console.log("https://api.example.test")');
  const result = await inspectPagesStaticArtifact(safe);
  assert.equal(result.indexHtml, path.join(safe, "index.html"));
  assert.ok(result.textFiles >= 2);

  const forbidden = [
    "MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET",
    "MAHORAGA_CLOUD_SESSION_SECRET",
    "MAHORAGA_PRIMARY_CODEX_TOKEN",
    "MAHORAGA_CONTENT_VAULT_MASTER_KEY",
    "mahoraga-runtime-main-production.up.railway.app",
    'location.replace("https://mahoraga-runtime',
  ];
  for (const [index, marker] of forbidden.entries()) {
    const candidate = path.join(root, `bad-${index}`);
    await mkdir(path.join(candidate, "_next", "static"), { recursive: true });
    await writeFile(path.join(candidate, "index.html"), '<script src="/mahoraga/_next/static/app.js"></script>');
    await writeFile(path.join(candidate, "_next", "static", "app.js"), marker);
    await assert.rejects(() => inspectPagesStaticArtifact(candidate), /pages-static-artifact-forbidden/);
  }
});

test("Pages artifact inspection rejects redirect-only or assetless entry points", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mahoraga-pages-entry-test-"));
  const redirect = path.join(root, "redirect");
  await mkdir(redirect, { recursive: true });
  await writeFile(path.join(redirect, "index.html"), '<meta http-equiv="refresh" content="0; url=https://example.test"><script>location.replace("https://example.test")</script>');
  await assert.rejects(() => inspectPagesStaticArtifact(redirect), /pages-static-artifact-entry-invalid/);

  const assetless = path.join(root, "assetless");
  await mkdir(assetless, { recursive: true });
  await writeFile(path.join(assetless, "index.html"), '<!doctype html><p>Mahoraga</p>');
  await assert.rejects(() => inspectPagesStaticArtifact(assetless), /pages-static-artifact-entry-invalid/);
});


test("Pages workflow builds and inspects pull requests without publishing them", async () => {
  const workflow = await readFile(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8");
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /node-version: "24"/);
  assert.match(workflow, /Build and inspect static workspace/);
  assert.match(workflow, /deploy:[\s\S]*if: github\.event_name != 'pull_request'/);
  assert.match(workflow, /needs: build/);
});


test("Pages runner policy defaults to GitHub-hosted but supports a temporary repository-variable fallback", async () => {
  const workflow = await readFile(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8");
  const matches = workflow.match(/MAHORAGA_PAGES_RUNNER_LABELS/g) ?? [];
  assert.equal(matches.length, 2);
  assert.match(workflow, /fromJSON\(vars\.MAHORAGA_PAGES_RUNNER_LABELS \|\| '\["ubuntu-latest"\]'\)/);
});


test("Pages pull-request proof repeats the static build with a synthetic valid API origin", async () => {
  const workflow = await readFile(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8");
  assert.match(workflow, /Verify configurable API-origin build/);
  assert.match(workflow, /if: github\.event_name == 'pull_request'/);
  assert.match(workflow, /NEXT_PUBLIC_MAHORAGA_API_ORIGIN: https:\/\/api\.example\.test/);
});
