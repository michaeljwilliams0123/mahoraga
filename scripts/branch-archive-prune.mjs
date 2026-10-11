/** Owner-approved, bounded, atomic, reversible remote branch pruning. Dry-run by default. */
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SHA = /^[0-9a-f]{40}$/;
const SAFE_BRANCH = /^[a-zA-Z0-9][a-zA-Z0-9._\/-]{0,250}$/;
const ACTIVE_PATHS = Object.freeze([".github/workflows", "config", "src", "scripts", "deploy", "cloud-app", "operator-deck", "relay"]);
export const MAX_BATCH = 12;

function fail(message) { throw new Error("archive-prune:" + message); }
function run(bin, args, { allowFailure = false } = {}) {
  const cmd = process.platform === "win32" && bin === "gh" ? "gh.exe" : bin;
  const result = spawnSync(cmd, args, { encoding: "utf8", timeout: 60_000, maxBuffer: 12_000_000, windowsHide: true });
  if (result.error) fail("tool-error:" + bin);
  if (!allowFailure && result.status !== 0) fail("command-failed:" + bin + ":" + String(result.stderr ?? "").slice(-200));
  return result;
}
function output(bin, args) { return run(bin, args).stdout.trim(); }

export function planArchivePrune(audit, branchNames, { mainSha, archivePrefix = "branch-archive/" + new Date().toISOString().slice(0, 10) } = {}) {
  if (!audit || audit.schemaVersion !== 1 || audit.kind !== "branch-retention-ref-proof" || audit.readOnly !== true
      || audit.prHistoryComplete !== true || !SHA.test(audit.mainSha)
      || audit.mainSha !== mainSha || !Array.isArray(audit.rows)) fail("audit-invalid-or-stale");
  if (!Array.isArray(branchNames) || branchNames.length < 1 || branchNames.length > MAX_BATCH
      || new Set(branchNames).size !== branchNames.length) fail("branch-list-invalid");
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._\/-]{0,200}$/.test(archivePrefix) || archivePrefix.includes("..")) fail("archive-prefix-invalid");
  const rows = new Map(audit.rows.map(row => [row.name, row]));
  return branchNames.map(name => {
    const row = rows.get(name);
    if (!SAFE_BRANCH.test(name) || name.includes("..") || name.includes("//")
        || name.startsWith("-") || name.startsWith("refs/") || name.endsWith("/") || name.endsWith(".lock")
        || !row || row.name === "main" || row.openPrCount !== 0 || row.activeRefCount !== 0
        || row.prHistoryComplete !== true || row.refVerified !== true || !SHA.test(row.headSha)) fail("branch-not-eligible:" + name);
    const contained = row.disposition === "delete-eligible" && row.aheadBy === 0;
    const emptyChange = row.disposition === "archive-then-delete" && row.aheadBy > 0
      && row.netChangedPathCount === 0;
    if (!contained && !emptyChange) fail("branch-has-unique-work:" + name);
    const archiveTag = archivePrefix + "/" + name;
    return Object.freeze({ name, headSha: row.headSha, archiveTag, mainSha: audit.mainSha,
      proof: contained ? "contained-in-main" : "no-changes-from-fork-point" });
  });
}

export function buildAtomicArchivePushArgs(branch) {
  if (!branch || !SHA.test(branch.headSha) || !SAFE_BRANCH.test(branch.name)
    || !branch.archiveTag?.startsWith("branch-archive/")) fail("invalid-archive-push-plan");
  return ["push", "--atomic",
    "--force-with-lease=refs/heads/" + branch.name + ":" + branch.headSha,
    "origin", "refs/tags/" + branch.archiveTag + ":refs/tags/" + branch.archiveTag,
    ":refs/heads/" + branch.name];
}

export function parseOptions(args) {
  const opts = { branches: [], execute: false, ownerApproved: false, auditPath: null, mainSha: null, archiveDate: null };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--branch") opts.branches.push(args[++i]);
    else if (arg === "--audit") opts.auditPath = args[++i];
    else if (arg === "--main-sha") opts.mainSha = args[++i];
    else if (arg === "--archive-date") opts.archiveDate = args[++i];
    else if (arg === "--execute") opts.execute = true;
    else if (arg === "--owner-approved") opts.ownerApproved = true;
    else fail("unknown-argument:" + arg);
  }
  if (opts.archiveDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(opts.archiveDate)) fail("archive-date-invalid");
  if (!opts.auditPath || !SHA.test(opts.mainSha ?? "") || opts.branches.some(x => typeof x !== "string")
      || opts.branches.length === 0 || (opts.execute && !opts.ownerApproved)) fail("required-owner-proof-missing");
  return opts;
}
function exactRemote(ref) {
  const lines = output("git", ["ls-remote", "origin", ref]).split(/\r?\n/).filter(Boolean);
  const found = lines.map(line => line.split(/\s+/)).filter(parts => parts.length === 2 && parts[1] === ref);
  if (found.length > 1) fail("remote-ref-ambiguous");
  return found[0]?.[0] ?? null;
}
function references(name) {
  const r = run("git", ["grep", "-F", "-l", "-e", name, "--", ...ACTIVE_PATHS], { allowFailure: true });
  if (r.status !== 0 && r.status !== 1) fail("reference-scan-failed");
  return r.status === 0 ? r.stdout.trim().split(/\r?\n/) : [];
}
function confirmGitHub(branch) {
  const encoded = branch.name.split("/").map(encodeURIComponent).join("%2F");
  const metadata = JSON.parse(output("gh", ["api", "repos/michaeljwilliams0123/mahoraga/branches/" + encoded]));
  if (metadata.protected || metadata.commit?.sha !== branch.headSha) fail("github-branch-protected-or-moved:" + branch.name);
  const open = JSON.parse(output("gh", ["pr", "list", "--repo", "michaeljwilliams0123/mahoraga",
    "--state", "open", "--head", branch.name, "--json", "number,headRefName", "--limit", "100"]));
  if (!Array.isArray(open) || open.some(pr => pr.headRefName === branch.name)) fail("open-pr:" + branch.name);
}
export function pruneBranch(branch, { execute }) {
  if (exactRemote("refs/heads/main") !== branch.mainSha ||
      output("git", ["rev-parse", "HEAD"]) !== branch.mainSha) fail("main-moved");
  if (exactRemote("refs/heads/" + branch.name) !== branch.headSha ||
      output("git", ["rev-parse", "origin/" + branch.name]) !== branch.headSha) fail("branch-moved");
  if (exactRemote("refs/tags/" + branch.archiveTag)) fail("archive-already-exists");
  confirmGitHub(branch);
  const ancestor = run("git", ["merge-base", "--is-ancestor", branch.headSha, branch.mainSha], { allowFailure: true });
  const files = output("git", ["diff", "--name-only", "origin/main...origin/" + branch.name]);
  if (branch.proof === "contained-in-main" && ancestor.status !== 0) fail("not-contained");
  if (branch.proof === "no-changes-from-fork-point" && files.length > 0) fail("nonempty-changes");
  if (references(branch.name).length) fail("active-source-reference");
  if (!execute) return { ...branch, archived: false, deleted: false, dryRun: true };
  output("git", ["tag", "-a", branch.archiveTag, branch.headSha, "-m",
    "Archived before owner-approved pruning: " + branch.name + " @ " + branch.headSha]);
  output("git", buildAtomicArchivePushArgs(branch));
  if (exactRemote("refs/heads/" + branch.name) !== null || !exactRemote("refs/tags/" + branch.archiveTag)
      || !output("git", ["ls-remote", "origin", "refs/tags/" + branch.archiveTag + "^{}"]).startsWith(branch.headSha)) {
    fail("post-prune-evidence-mismatch:" + branch.name);
  }
  return { ...branch, archived: true, deleted: true, dryRun: false };
}
function main(args) {
  const opts = parseOptions(args);
  const audit = JSON.parse(readFileSync(opts.auditPath, "utf8"));
  const plan = planArchivePrune(audit, opts.branches, {
    mainSha: opts.mainSha,
    archivePrefix: "branch-archive/" + (opts.archiveDate ?? new Date().toISOString().slice(0,10)),
  });
  for (const branch of plan) process.stdout.write(JSON.stringify({ result: pruneBranch(branch, { execute: opts.execute }) }) + "\n");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
