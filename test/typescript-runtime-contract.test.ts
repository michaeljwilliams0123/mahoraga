import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const tsconfig = JSON.parse(readFileSync(path.join(root, "tsconfig.json"), "utf8"));

function filesUnder(relative: string): string[] {
  const absolute = path.join(root, relative);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(relative, entry.name);
    return entry.isDirectory() ? filesUnder(child) : [child];
  });
}

test("root control plane has a strict native-TypeScript contract", () => {
  assert.equal(pkg.scripts.typecheck, "tsc --noEmit");
  assert.equal(pkg.devDependencies.typescript, "7.0.2");
  assert.equal(pkg.devDependencies["@types/node"], "26.4.0");
  assert.equal(tsconfig.compilerOptions.strict, true);
  assert.equal(tsconfig.compilerOptions.noEmit, true);
  assert.equal(tsconfig.compilerOptions.allowJs, false);
  assert.equal(tsconfig.compilerOptions.allowImportingTsExtensions, true);
  assert.equal(tsconfig.compilerOptions.erasableSyntaxOnly, true);
  assert.equal(tsconfig.compilerOptions.verbatimModuleSyntax, true);
  assert.equal(tsconfig.compilerOptions.noUncheckedIndexedAccess, true);
  assert.equal(tsconfig.compilerOptions.exactOptionalPropertyTypes, true);
  assert.ok(pkg.scripts["verify:pretest"].startsWith("npm run typecheck &&"));
  assert.equal(pkg.scripts.verify, "npm run verify:pretest && npm test");
  assert.equal(pkg.scripts["verify:windows"], "npm run verify:pretest && npm run test:windows");
});

test("answer quality is migrated to native TypeScript with no stale imports", () => {
  assert.equal(existsSync(path.join(root, "src/answer-quality.ts")), true);
  assert.equal(existsSync(path.join(root, "src/answer-quality.mjs")), false);
  assert.equal(existsSync(path.join(root, "state/release-baseline/src/answer-quality.ts")), true);
  assert.equal(existsSync(path.join(root, "state/release-baseline/src/answer-quality.mjs")), false);

  const staleImports = ["src", "test", "scripts"]
    .flatMap(filesUnder)
    .filter((file) => /\.(?:mjs|js|ts)$/.test(file))
    .filter((file) => {
      const source = readFileSync(path.join(root, file), "utf8");
      return /(?:from\s+["'][^"']*answer-quality\.mjs["']|import\(["'][^"']*answer-quality\.mjs["']\))/.test(source);
    });
  assert.deepEqual(staleImports, []);
});

test("Verify installs pinned root dependencies before the complete platform gate", () => {
  const workflow = readFileSync(path.join(root, ".github/workflows/verify.yml"), "utf8");
  const installIndex = workflow.indexOf("- name: Install root dependencies");
  const verifyIndex = workflow.indexOf("- name: Verify authoritative repository");
  assert.ok(installIndex >= 0, "Verify must install root dependencies");
  assert.ok(verifyIndex >= 0, "Verify must retain the authoritative repository gate");
  assert.ok(installIndex < verifyIndex, "dependency install must precede verification");
  assert.match(workflow, /run: npm ci --ignore-scripts/);
  assert.match(workflow, /run: npm run \$\{\{ matrix\.verify_script \}\}/);
  assert.ok(pkg.scripts["verify:pretest"].startsWith("npm run typecheck &&"), "the shared gate must begin with TypeScript");
});
