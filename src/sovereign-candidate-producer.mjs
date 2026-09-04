import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT, loadManifest } from "./config.mjs";
import { buildGapAudit } from "./gap-audit.mjs";

const OPERATOR_SCAN_REPORT = "scripts/sovereign-scan-report.mjs";
const TRUST_PLANE_PREFIXES = [".github/", ".githooks/"];
const TRUST_PLANE_FILES = new Set([
  "AGENTS.md",
  "SECURITY.md",
  "mahoraga.manifest.json",
  "package.json",
  "src/autonomy-policy.mjs",
  "src/autonomous-integration.mjs",
  "src/cloud-cycle-worker.mjs",
  "src/evolution-controller.mjs",
  "src/objective-release-authority.mjs",
  "src/repair.mjs",
  "src/sovereign-candidate-producer.mjs",
  "src/update-contract.mjs",
  "scripts/autonomous-integration.mjs",
  "scripts/create-release-baseline.mjs",
]);

export function scanForSafeEnhancement({ fileExists = (relative) => existsSync(path.join(ROOT, relative)), gapAudit = { open: [] } } = {}) {
  if (!fileExists(OPERATOR_SCAN_REPORT)) {
    return Object.freeze({
      id: "operator-scan-report",
      title: "chore: add sovereign scan report",
      summary: "Add a zero-credit operator report that summarizes Mahoraga's evidence-backed open and blocked gaps.",
      changedFiles: Object.freeze([OPERATOR_SCAN_REPORT]),
    });
  }
  return null;
}

export function assertSafeCandidatePaths(paths) {
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > 32) throw new TypeError("candidate paths are invalid");
  for (const raw of paths) {
    if (typeof raw !== "string" || raw.length < 1 || raw.length > 240 || raw.startsWith("/") || raw.includes("\\") || raw.split("/").some((part) => part === "" || part === "." || part === "..")) {
      throw new TypeError("candidate path is invalid");
    }
    if (TRUST_PLANE_PREFIXES.some((prefix) => raw.startsWith(prefix)) || TRUST_PLANE_FILES.has(raw)) {
      throw new Error(`trust-plane path is not eligible for autonomous candidate production: ${raw}`);
    }
  }
  return Object.freeze([...paths]);
}

export function candidateChangedFilesDigest(paths) {
  const normalized = [...new Set(assertSafeCandidatePaths(paths))].sort();
  return crypto.createHash("sha256").update(normalized.join("\n")).digest("hex");
}

export function renderOperatorScanReportScript() {
  return `import { loadManifest } from "../src/config.mjs";\nimport { buildGapAudit } from "../src/gap-audit.mjs";\n\nconst report = buildGapAudit(await loadManifest());\nconst blockedGapIds = report.open\n  .filter((item) => item.state === "blocked")\n  .map((item) => item.id)\n  .sort();\nconst actionableGapIds = report.open\n  .filter((item) => item.state === "open" || item.state === "unverified")\n  .map((item) => item.id)\n  .sort();\n\nprocess.stdout.write(\\`${"${JSON.stringify({"}\n  schemaVersion: 1,\n  product: report.product,\n  version: report.version,\n  counts: report.counts,\n  blockedGapIds,\n  actionableGapIds,\n}, null, 2)}\\n"}\\`);\n`;
}

export function createGitHubNativeCandidateProducer({ root = ROOT, runCommand = fixedCommand } = {}) {
  return async function produceCandidate({ repositoryIdentity, branch, cycleId }) {
    if (branch !== "main") throw codedError("candidate-base-branch-invalid");
    if (!/^[a-f0-9]{64}$/.test(cycleId ?? "")) throw codedError("candidate-cycle-id-invalid");
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repositoryIdentity ?? "")) throw codedError("candidate-repository-invalid");

    const baseSha = command(runCommand, "git", ["rev-parse", "HEAD"], root);
    const remoteMain = command(runCommand, "git", ["rev-parse", "origin/main"], root);
    if (!/^[a-f0-9]{40}$/.test(baseSha) || baseSha !== remoteMain) throw codedError("candidate-base-stale");

    const manifest = await loadManifest();
    const gapAudit = buildGapAudit(manifest, { root });
    const enhancement = scanForSafeEnhancement({
      fileExists: (relative) => existsSync(path.join(root, relative)),
      gapAudit,
    });
    if (!enhancement) return null;
    assertSafeCandidatePaths(enhancement.changedFiles);

    const branchName = `feature/sovereign-${cycleId.slice(0, 12)}`;
    const existing = existingCandidate({ repositoryIdentity, branchName, baseSha, root, runCommand });
    if (existing) return existing;

    command(runCommand, "git", ["checkout", "-b", branchName, baseSha], root);
    if (enhancement.id === "operator-scan-report") {
      writeFileSync(path.join(root, OPERATOR_SCAN_REPORT), renderOperatorScanReportScript(), { encoding: "utf8", flag: "wx" });
    } else {
      throw codedError("candidate-recipe-unsupported");
    }

    command(runCommand, "git", ["add", "--", ...enhancement.changedFiles], root);
    const staged = splitLines(command(runCommand, "git", ["diff", "--cached", "--name-only"], root));
    requireExactPaths(staged, enhancement.changedFiles);
    command(runCommand, "git", ["config", "user.name", "github-actions[bot]"], root);
    command(runCommand, "git", ["config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"], root);
    command(runCommand, "git", ["commit", "-m", enhancement.title], root);

    const headSha = command(runCommand, "git", ["rev-parse", "HEAD"], root);
    if (!/^[a-f0-9]{40}$/.test(headSha) || headSha === baseSha) throw codedError("candidate-head-invalid");
    const changedFiles = splitLines(command(runCommand, "git", ["diff", "--name-only", `${baseSha}...${headSha}`], root));
    requireExactPaths(changedFiles, enhancement.changedFiles);
    assertSafeCandidatePaths(changedFiles);

    command(runCommand, "git", ["push", "origin", `HEAD:refs/heads/${branchName}`], root);
    command(runCommand, "gh", ["pr", "create", "--repo", repositoryIdentity, "--base", "main", "--head", branchName, "--title", enhancement.title, "--body", `${enhancement.summary}\n\nProduced by Mahoraga sovereign zero-credit candidate cycle.`], root);
    const pr = JSON.parse(command(runCommand, "gh", ["pr", "view", branchName, "--repo", repositoryIdentity, "--json", "number,headRefOid,baseRefOid,baseRefName,state"], root));
    validatePr(pr, { baseSha, headSha });

    command(runCommand, "gh", ["workflow", "run", "verify.yml", "--repo", repositoryIdentity, "--ref", branchName], root);
    return Object.freeze({
      baseSha,
      headSha,
      branch: branchName,
      pullRequestNumber: pr.number,
      changedFilesDigest: candidateChangedFilesDigest(changedFiles),
    });
  };
}

function existingCandidate({ repositoryIdentity, branchName, baseSha, root, runCommand }) {
  const remote = command(runCommand, "git", ["ls-remote", "--heads", "origin", `refs/heads/${branchName}`], root);
  if (!remote) return null;
  command(runCommand, "git", ["fetch", "origin", `${branchName}:refs/remotes/origin/${branchName}`], root);
  const headSha = command(runCommand, "git", ["rev-parse", `origin/${branchName}`], root);
  const raw = command(runCommand, "gh", ["pr", "list", "--repo", repositoryIdentity, "--head", branchName, "--base", "main", "--state", "open", "--json", "number,headRefOid,baseRefOid,baseRefName,state"], root);
  const prs = JSON.parse(raw);
  if (!Array.isArray(prs) || prs.length !== 1) throw codedError("candidate-existing-pr-invalid");
  const pr = prs[0];
  validatePr(pr, { baseSha, headSha });
  const changedFiles = splitLines(command(runCommand, "git", ["diff", "--name-only", `${baseSha}...${headSha}`], root));
  assertSafeCandidatePaths(changedFiles);
  return Object.freeze({ baseSha, headSha, branch: branchName, pullRequestNumber: pr.number, changedFilesDigest: candidateChangedFilesDigest(changedFiles) });
}

function validatePr(pr, { baseSha, headSha }) {
  if (!pr || pr.state !== "OPEN" || pr.baseRefName !== "main" || pr.baseRefOid !== baseSha || pr.headRefOid !== headSha || !Number.isSafeInteger(pr.number) || pr.number < 1) {
    throw codedError("candidate-pr-invalid");
  }
}

function requireExactPaths(actual, expected) {
  const left = [...new Set(actual)].sort();
  const right = [...new Set(expected)].sort();
  if (left.length !== right.length || left.some((value, index) => value !== right[index])) throw codedError("candidate-path-drift");
}

function splitLines(value) {
  return value ? value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) : [];
}

function command(runCommand, executable, args, cwd) {
  return String(runCommand(executable, args, cwd) ?? "").trim();
}

function fixedCommand(executable, args, cwd) {
  return execFileSync(executable, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: process.env });
}

function codedError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (invoked && process.argv.includes("--scan-only")) {
  const report = buildGapAudit(await loadManifest());
  const enhancement = scanForSafeEnhancement({ gapAudit: report });
  process.stdout.write(`${JSON.stringify({ status: enhancement ? "actionable" : "no-actionable-work", enhancement, blockedGapIds: report.open.filter((item) => item.state === "blocked").map((item) => item.id).sort() })}\n`);
}
