import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type LanguagePolicy = {
  controlPlaneRoots: string[];
  specializedRoots: Record<string, string[]>;
  javascriptMigrationDebtExtensions: string[];
  javascriptExceptions: string[];
};

export type LanguagePolicyReport = {
  healthy: boolean;
  migrationDebt: readonly string[];
  violations: readonly string[];
};

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(here, "..");

function walk(root: string, relative: string): string[] {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const child = path.posix.join(relative.replaceAll("\\", "/"), entry.name);
    return entry.isDirectory() ? walk(root, child) : [child];
  });
}

export function validateLanguagePolicy(root = defaultRoot): LanguagePolicyReport {
  const policy = JSON.parse(fs.readFileSync(path.join(root, "config/language-policy.json"), "utf8")) as LanguagePolicy;
  const debt = new Set<string>();
  const violations = new Set<string>();
  const exceptions = new Set(policy.javascriptExceptions.map((item) => item.replaceAll("\\", "/")));

  for (const base of policy.controlPlaneRoots) {
    for (const file of walk(root, base)) {
      const ext = path.extname(file);
      if (policy.javascriptMigrationDebtExtensions.includes(ext) && !exceptions.has(file)) debt.add(file);
    }
  }

  for (const [base, allowed] of Object.entries(policy.specializedRoots)) {
    for (const file of walk(root, base)) {
      if (/\.(?:md|json|toml|lock)$/i.test(file) || path.basename(file) === "CMakeLists.txt") continue;
      if (!allowed.includes(path.extname(file))) violations.add(file);
    }
  }

  return Object.freeze({
    healthy: violations.size === 0,
    migrationDebt: Object.freeze([...debt].sort()),
    violations: Object.freeze([...violations].sort()),
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = validateLanguagePolicy();
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.healthy ? 0 : 1;
}
