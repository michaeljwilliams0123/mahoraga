import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "./config.mjs";

export const ESSENTIAL_FILES = [
  "mahoraga.manifest.json",
  "package.json",
  "src/cli.mjs",
  "src/capability-registry.mjs",
  "src/config.mjs",
  "src/local-auth.mjs",
  "src/browser-worker.mjs",
  "src/database.mjs",
  "src/microsoft-queue-worker.mjs",
  "src/repair.mjs",
  "src/router.mjs",
  "src/repository-worker.mjs",
  "src/runtime.mjs",
  "src/server.mjs",
  "src/supervisor.mjs",
  "src/world-state-observer.mjs",
  "src/worker-process.mjs",
  "web/index.html",
  "web/app.js",
  "web/control.css",
  "web/discourse.css",
  "web/styles.css",
  "scripts/auth.py",
  "scripts/microsoft_queue_worker.py",
  "scripts/start-production.ps1",
];

export async function scanRepairState(manifest) {
  const issues = [];
  const baselineRoot = path.join(ROOT, manifest.repair.baselineDirectory);
  for (const relative of ESSENTIAL_FILES) {
    const live = path.join(ROOT, relative);
    const baseline = path.join(baselineRoot, relative);
    if (!(await healthyFile(live))) issues.push({ code: "live-file-missing-or-empty", relative });
    if (!(await healthyFile(baseline))) issues.push({ code: "baseline-file-missing-or-empty", relative });
  }
  return { issues, checked: ESSENTIAL_FILES.length, healthy: issues.length === 0 };
}

export async function applyAutomaticRepairs(manifest) {
  await Promise.all(["state", "state/cache", "state/checkpoints", "state/repairs"].map((relative) => mkdir(path.join(ROOT, relative), { recursive: true })));
  const baselineRoot = path.join(ROOT, manifest.repair.baselineDirectory);
  const staged = [];
  const unresolved = [];
  for (const relative of ESSENTIAL_FILES) {
    const live = path.join(ROOT, relative);
    const baseline = path.join(baselineRoot, relative);
    if (await healthyFile(live)) continue;
    if (!(await healthyFile(baseline))) { unresolved.push(relative); continue; }
    const candidate = path.join(ROOT, "state", "repairs", `core-${Date.now()}-${relative.replace(/[\\/]/g, "_")}.json`);
    await writeFile(candidate, JSON.stringify({ kind: "core-source-repair", relative, baseline: path.relative(ROOT, baseline), stagedAt: new Date().toISOString(), verificationRequired: true, activationAuthority: manifest.repair.coreUpdateAuthority }, null, 2));
    staged.push(relative);
  }
  return { verified: unresolved.length === 0, repaired: [], staged, unresolved, summary: `Operational repair completed; ${staged.length} core repair candidate(s) staged for explicit activation and ${unresolved.length} unresolved.` };
}

async function healthyFile(file) {
  try { return (await stat(file)).isFile() && (await stat(file)).size > 0; } catch { return false; }
}
