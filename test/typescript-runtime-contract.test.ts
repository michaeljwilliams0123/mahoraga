import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const tsconfig = JSON.parse(readFileSync(path.join(root, "tsconfig.json"), "utf8"));

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
  assert.ok(pkg.scripts.verify.startsWith("npm run typecheck &&"));
});
