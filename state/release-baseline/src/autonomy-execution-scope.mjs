import { spawnSync } from "node:child_process";
import { ROOT } from "./config.mjs";

const DEFAULT_PATHS = Object.freeze(["src", "test"]);

const GROUPS = Object.freeze([
  Object.freeze({ pattern: /\b(interface|ui|frontend|control\s+center|workspace|page|layout|design|accessib)/i, paths: Object.freeze(["cloud"]) }),
  Object.freeze({ pattern: /\b(doc|docs|documentation|readme|document)/i, paths: Object.freeze(["docs"]) }),
  Object.freeze({ pattern: /\b(manifest|provider)/i, paths: Object.freeze(["mahoraga.manifest.json"]) }),
  Object.freeze({ pattern: /\b(package|packages|dependency|dependencies)/i, paths: Object.freeze(["package.json"]) }),
  Object.freeze({ pattern: /\b(release|automation|script|scripts)/i, paths: Object.freeze(["scripts"]) }),
]);

export function autonomyAllowedPaths(message) {
  const text = String(message ?? "").replace(/\s+/g, " ").trim().slice(0, 12_000);
  const paths = new Set(DEFAULT_PATHS);
  for (const group of GROUPS) {
    if (group.pattern.test(text)) for (const path of group.paths) paths.add(path);
  }
  return Object.freeze([...paths].sort());
}

export function currentAutonomyExecutionContract(message) {
  const result = spawnSync("git", ["-C", ROOT, "rev-parse", "HEAD"], {
    cwd: ROOT,
    windowsHide: true,
    encoding: "utf8",
    timeout: 15_000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("autonomy-repository-head-unavailable");
  const baseCommit = String(result.stdout ?? "").trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(baseCommit)) throw new Error("autonomy-repository-head-invalid");
  return Object.freeze({ baseCommit, allowedPaths: autonomyAllowedPaths(message) });
}
