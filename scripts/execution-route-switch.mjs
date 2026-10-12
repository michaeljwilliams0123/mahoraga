#!/usr/bin/env node
// Owner-operated GitHub routing switch: no workflow-token escalation, no runner mutations.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { EXECUTION_ROUTES, LOCAL_WINDOWS_LABELS, resolveExecutionRoute } from "./execution-route-policy.mjs";

const REPO = "michaeljwilliams0123/mahoraga";
const VARIABLE = "MAHORAGA_EXECUTION_ROUTE";
const PRIVATE_STEWARD_FLAG = "MAHORAGA_PRIVATE_STEWARD_LOCAL_ENABLED";
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function command(program, args, cwd = PROJECT_ROOT) {
  try {
    return execFileSync(program, args, {
      cwd, encoding: "utf8", timeout: 30000,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    // Do not emit GitHub tokens, environmental credentials, or full CLI stderr.
    throw new Error(`Command failed: ${program} ${args[0] ?? ""}. Inspect local GitHub authentication and permissions. (exit=${error.status ?? "unknown"})`);
  }
}
function repository() {
  const data = JSON.parse(command("gh", ["api", `repos/${REPO}`]));
  if (data.full_name !== REPO || typeof data.private !== "boolean") throw new Error("GitHub repository identity/visibility unavailable.");
  return data;
}
function variables() {
  const values = JSON.parse(command("gh", ["variable", "list", "-R", REPO, "--json", "name,value"]));
  if (!Array.isArray(values)) throw new Error("Repository Actions variables could not be verified.");
  return new Map(values.map(({ name, value }) => [name, value]));
}
function eligibleRunner() {
  const data = JSON.parse(command("gh", ["api", `repos/${REPO}/actions/runners?per_page=100`]));
  if (!Array.isArray(data.runners)) throw new Error("Runner inventory unavailable.");
  return data.runners.some(runner => runner.status === "online" && LOCAL_WINDOWS_LABELS.every(label =>
    runner.labels?.some(l => l.name?.toLowerCase() === label)));
}
function snapshot(requestedMode) {
  const info = repository();
  const values = variables();
  const current = values.get(VARIABLE) ?? "";
  const ready = eligibleRunner();
  const mode = requestedMode ?? current;
  return {
    visibility: info.private ? "private" : "public",
    currentMode: current || "auto (unset)",
    proposedMode: mode || "auto",
    policy: resolveExecutionRoute({
      requestedMode: mode,
      repositoryPrivate: info.private,
      privateStewardEnabled: values.get(PRIVATE_STEWARD_FLAG) === "true",
      localRunnerReady: ready,
    }),
    admin: info.permissions?.admin === true,
  };
}
function assertFreshMain() {
  const localBranch = command("git", ["branch", "--show-current"]);
  const localSha = command("git", ["rev-parse", "HEAD"]);
  const actualMain = command("gh", ["api", `repos/${REPO}/git/ref/heads/main`, "--jq", ".object.sha"]);
  if (localBranch !== "main" || localSha !== actualMain) throw new Error("Refusing routing mutation from a non-main or stale checkout. Update main first.");
}

const [action = "status", requestedMode, ...flags] = process.argv.slice(2);
try {
  if (action === "status") {
    if (requestedMode || flags.length) throw new Error("Usage: node scripts/execution-route-switch.mjs status");
    process.stdout.write(JSON.stringify(snapshot(), null, 2) + "\n");
  } else if (action === "set" && EXECUTION_ROUTES.includes(requestedMode) && flags.every(flag => flag === "--apply")) {
    const proposed = snapshot(requestedMode);
    process.stdout.write(JSON.stringify({ action: flags.includes("--apply") ? "apply" : "dry-run", ...proposed }, null, 2) + "\n");
    if (proposed.policy.mode !== requestedMode) throw new Error("Unsupported routing mode.");
    if (requestedMode === "local" && proposed.visibility !== "private") {
      throw new Error("Refusing explicit local mode while repository is public; use auto for existing trusted local sovereign jobs.");
    }
    if (flags.includes("--apply")) {
      if (!proposed.admin) throw new Error("An authenticated GitHub repository admin is required.");
      assertFreshMain();
      const fresh = snapshot(requestedMode);
      if (fresh.visibility !== proposed.visibility || fresh.currentMode !== proposed.currentMode) throw new Error("Routing/visibility changed during preflight. Reinspect.");
      command("gh", ["variable", "set", VARIABLE, "--body", requestedMode, "-R", REPO]);
      const after = snapshot();
      if (after.currentMode !== requestedMode || after.visibility !== proposed.visibility) throw new Error("Routing write not verified; inspect settings before retrying.");
      process.stdout.write(JSON.stringify({ status: "applied-and-read-back", route: requestedMode, visibility: after.visibility, steward: after.policy.steward, sovereign: after.policy.sovereign, paidFallback: false }, null, 2) + "\n");
    }
  } else {
    throw new Error("Usage: node scripts/execution-route-switch.mjs status | set <auto|cloud|local|hold> [--apply]");
  }
} catch (error) {
  process.stderr.write(`routing-switch: ${error.message}\n`);
  process.exitCode = 1;
}
