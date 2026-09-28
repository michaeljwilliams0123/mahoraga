import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const paths = [
  "src/cognitive-investigation.ts", "src/curious-lifecycle.ts", "src/curious-lifecycle-evaluator.ts",
  "evaluation/curious-lifecycle-fixtures.ts", "deploy/cloudflare-lifecycle-evaluation/worker.ts",
  "deploy/cloudflare-lifecycle-evaluation/wrangler.jsonc", "deploy/cloudflare-lifecycle-evaluation/wrangler.test.jsonc",
  "scripts/cloudflare-lifecycle-evaluation.ts", "vitest.lifecycle.config.ts",
  ".github/workflows/cloudflare-lifecycle-evaluation.yml", "docs/CLOUDFLARE-LIFECYCLE-EVALUATION.md",
] as const;
type Violation = Readonly<{ path: string; reason: "excluded-provider" | "external-inference" | "unbounded-binding" }>;
export type PolicyReceipt = Readonly<{ schemaVersion: 1; kind: "lifecycle-dependency-policy"; accepted: boolean; zeroCredit: true; violations: readonly Violation[]; fingerprint: string }>;

export function validateLifecycleDependencyBoundary(root: string): PolicyReceipt {
  const violations: Violation[] = [];
  const scan = (path: string, text: string) => {
    // Inspect executable URLs, imports, environment identifiers, workflow uses,
    // and configuration keys. A runbook can name an excluded provider in prose.
    const tokens = [
      ...text.matchAll(/https?:\/\/[^\s"'`<>]+|(?:import|from|require\s*\()[^\n;]+|\b(?:process\.env\.|\$\{|secrets\.|vars\.)[A-Z][A-Z0-9_]+|\buses:\s*[^\s]+|\b(?:npx|npm|pnpm|yarn|bun|curl|wrangler|railway|vercel)\s+[^\n;]+/g),
    ].map(match => match[0]);
    if (path.endsWith(".jsonc")) {
      const parsed = JSON.parse(text.replace(/^\s*\/\/.*$/gm, "")) as Record<string, unknown>;
      tokens.push(...Object.keys(parsed), JSON.stringify(parsed.durable_objects ?? {}));
    }
    for (const token of tokens) {
      const reason = /railway|vercel/i.test(token) ? "excluded-provider" : /openai|anthropic|gemini|model_api_key|workers_ai|\bAI\b/i.test(token) ? "external-inference" : /"(?:services|queues|vectorize|browser|ai|r2_buckets|d1_databases|hyperdrive)"/i.test(token) ? "unbounded-binding" : null;
      if (reason && !violations.some(v => v.path === path && v.reason === reason)) violations.push({ path, reason });
    }
  };
  for (const path of paths) { const full = resolve(root, path); if (existsSync(full)) scan(path, readFileSync(full, "utf8")); }
  const packagePath = resolve(root, "package.json");
  if (existsSync(packagePath)) {
    const scripts = (JSON.parse(readFileSync(packagePath, "utf8")) as { scripts?: Record<string, string> }).scripts ?? {};
    for (const [name, command] of Object.entries(scripts)) if (name.includes("lifecycle")) scan(`package.json:${name}`, command);
  }
  const core = { schemaVersion: 1 as const, kind: "lifecycle-dependency-policy" as const, accepted: violations.length === 0, zeroCredit: true as const, violations };
  return { ...core, fingerprint: createHash("sha256").update(JSON.stringify(core)).digest("hex") };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const receipt = validateLifecycleDependencyBoundary(process.cwd());
  console.log(JSON.stringify(receipt));
  if (!receipt.accepted) process.exitCode = 1;
}
