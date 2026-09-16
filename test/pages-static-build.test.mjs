import assert from "node:assert/strict";
import test from "node:test";
import { access, lstat, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { DEFAULT_CANONICAL_WORKSPACE_URL, isDirectExecution, linkPagesDependencies, pagesLauncherHtml, pagesStaticStagingRoot, preparePagesStaticWorkspace } from "../scripts/build-pages-static.mjs";

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


test("Pages root launches the canonical Railway workspace instead of acting as execution UI", async () => {
  const html = pagesLauncherHtml();
  assert.match(html, new RegExp(DEFAULT_CANONICAL_WORKSPACE_URL.replace(/[.*+?^$\{\}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(html, /github\.io\/mahoraga/);
  assert.throws(() => pagesLauncherHtml("http://example.test/"), /canonical-workspace-url-invalid/);
  const workflow = await readFile(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8");
  assert.match(workflow, /MAHORAGA_CANONICAL_WORKSPACE_URL/);
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  assert.match(readme, /Open Mahoraga/);
  assert.match(readme, /mahoraga-runtime-main-production\.up\.railway\.app/);
});
