import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT, loadManifest } from "./config.mjs";
import { buildGapAudit } from "./gap-audit.mjs";

const OPERATOR_SCAN_REPORT = "scripts/sovereign-scan-report.mjs";
const OPERATOR_SCAN_REPORT_TEST = "test/sovereign-scan-report.test.mjs";
const OPERATOR_STALE_BRANCH_REPORT = "scripts/sovereign-stale-branch-report.mjs";
const ZERO_CREDIT_BOUNDARY_TEST = "test/zero-credit-boundary.test.mjs";
const CYCLE_OUTCOME_LEDGER = "reports/sovereign-cycle-outcome.json";
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

export function recordedLedgerCycleId(raw) {
  if (typeof raw !== "string" || !raw.trim()) return "";
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed?.cycleId === "string" ? parsed.cycleId : "";
  } catch {
    return "";
  }
}

function gapSignature(gapAudit = { open: [] }) {
  const open = Array.isArray(gapAudit.open) ? gapAudit.open : [];
  const blockedGapIds = open.filter((item) => item.state === "blocked").map((item) => item.id).filter(Boolean).sort();
  const actionableGapIds = open.filter((item) => item.state === "open" || item.state === "unverified").map((item) => item.id).filter(Boolean).sort();
  return JSON.stringify({
    open: open.length,
    blocked: blockedGapIds.length,
    actionable: actionableGapIds.length,
    blockedGapIds,
    actionableGapIds,
  });
}

export function cycleLedgerPulseAction({ recordedRaw, cycleId, gapAudit = { open: [] } } = {}) {
  if (typeof cycleId !== "string" || !/^[a-f0-9]{64}$/.test(cycleId)) return "invalid";
  if (typeof recordedRaw !== "string" || !recordedRaw.trim()) return "create";
  let parsed;
  try {
    parsed = JSON.parse(recordedRaw);
  } catch {
    return "create";
  }
  if (parsed?.cycleId === cycleId) return "hold";
  const recordedSignature = JSON.stringify({
    open: Number(parsed?.counts?.open) || 0,
    blocked: Number(parsed?.counts?.blocked) || 0,
    actionable: Number(parsed?.counts?.actionable) || 0,
    blockedGapIds: Array.isArray(parsed?.blockedGapIds) ? [...parsed.blockedGapIds].sort() : [],
    actionableGapIds: Array.isArray(parsed?.actionableGapIds) ? [...parsed.actionableGapIds].sort() : [],
  });
  if (recordedSignature === gapSignature(gapAudit)) return "hold";
  return "refresh";
}

export function scanForSafeEnhancement({ fileExists = (relative) => existsSync(path.join(ROOT, relative)), readFile = null, cycleId = "", gapAudit = { open: [] } } = {}) {
  void gapAudit;
  if (!fileExists(OPERATOR_SCAN_REPORT)) {
    return Object.freeze({
      id: "operator-scan-report",
      title: "chore: add sovereign scan report",
      summary: "Add a zero-credit operator report that summarizes Mahoraga's evidence-backed open and blocked gaps.",
      changedFiles: Object.freeze([OPERATOR_SCAN_REPORT]),
    });
  }
  if (!fileExists(OPERATOR_SCAN_REPORT_TEST)) {
    return Object.freeze({
      id: "operator-scan-report-test",
      title: "test: lock sovereign scan report JSON contract",
      summary: "Add a zero-credit test that runs the sovereign scan report and asserts the bounded JSON schema.",
      changedFiles: Object.freeze([OPERATOR_SCAN_REPORT_TEST]),
    });
  }
  if (!fileExists(OPERATOR_STALE_BRANCH_REPORT)) {
    return Object.freeze({
      id: "operator-stale-branch-report",
      title: "chore: add sovereign stale-branch report",
      summary: "Add a zero-credit report of leftover feature/sovereign-* branches after squash-merge so the next window is not blocked by candidate-existing-base-drift.",
      changedFiles: Object.freeze([OPERATOR_STALE_BRANCH_REPORT]),
    });
  }
  if (!fileExists(ZERO_CREDIT_BOUNDARY_TEST)) {
    return Object.freeze({
      id: "zero-credit-boundary-test",
      title: "test: lock zero-credit cycle boundary",
      summary: "Add a zero-credit test that the four-hour cycle stays on deterministic-only with empty providers, disabled OpenAI, and no generation.",
      changedFiles: Object.freeze([ZERO_CREDIT_BOUNDARY_TEST]),
    });
  }
  if (!fileExists(CYCLE_OUTCOME_LEDGER)) {
    return Object.freeze({
      id: "cycle-outcome-ledger",
      title: "chore: add sovereign cycle outcome ledger",
      summary: "Add a zero-credit cycle outcome ledger so each four-hour window still produces a candidate after the one-shot recipes are exhausted.",
      changedFiles: Object.freeze([CYCLE_OUTCOME_LEDGER]),
    });
  }
  if (typeof cycleId === "string" && /^[a-f0-9]{64}$/.test(cycleId) && typeof readFile === "function") {
    const pulse = cycleLedgerPulseAction({
      recordedRaw: readFile(CYCLE_OUTCOME_LEDGER),
      cycleId,
      gapAudit,
    });
    if (pulse === "refresh" || pulse === "create") {
      return Object.freeze({
        id: "cycle-outcome-ledger",
        title: pulse === "create" ? "chore: add sovereign cycle outcome ledger" : "chore: refresh sovereign cycle outcome ledger",
        summary: pulse === "create"
          ? "Add a zero-credit cycle outcome ledger so each four-hour window still produces a candidate after the one-shot recipes are exhausted."
          : "Refresh the zero-credit cycle outcome ledger because gap composition changed. CycleId-only stamps are a hold, not a PR.",
        changedFiles: Object.freeze([CYCLE_OUTCOME_LEDGER]),
      });
    }
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
  return [
    'import { loadManifest } from "../src/config.mjs";',
    'import { buildGapAudit } from "../src/gap-audit.mjs";',
    '',
    'const report = buildGapAudit(await loadManifest());',
    'const blockedGapIds = report.open',
    '  .filter((item) => item.state === "blocked")',
    '  .map((item) => item.id)',
    '  .sort();',
    'const actionableGapIds = report.open',
    '  .filter((item) => item.state === "open" || item.state === "unverified")',
    '  .map((item) => item.id)',
    '  .sort();',
    '',
    'process.stdout.write(JSON.stringify({',
    '  schemaVersion: 1,',
    '  product: report.product,',
    '  version: report.version,',
    '  counts: report.counts,',
    '  blockedGapIds,',
    '  actionableGapIds,',
    '}, null, 2) + "\\n");',
    '',
  ].join("\n");
}

export function renderOperatorScanReportTest() {
  return [
    'import test from "node:test";',
    'import assert from "node:assert/strict";',
    'import { spawnSync } from "node:child_process";',
    'import path from "node:path";',
    'import { fileURLToPath } from "node:url";',
    '',
    'const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");',
    'const script = path.join(root, "scripts/sovereign-scan-report.mjs");',
    '',
    'test("sovereign scan report emits bounded JSON with gap ids", () => {',
    '  const result = spawnSync(process.execPath, [script], { encoding: "utf8", cwd: root });',
    '  assert.equal(result.status, 0, result.stderr);',
    '  const report = JSON.parse(result.stdout);',
    '  assert.equal(report.schemaVersion, 1);',
    '  assert.equal(typeof report.product, "string");',
    '  assert.equal(typeof report.version, "string");',
    '  assert.ok(report.counts && typeof report.counts === "object");',
    '  assert.ok(Array.isArray(report.blockedGapIds));',
    '  assert.ok(Array.isArray(report.actionableGapIds));',
    '});',
    '',
  ].join("\n");
}

export function renderOperatorStaleBranchReportScript() {
  return [
    'import { execFileSync } from "node:child_process";',
    '',
    'const raw = execFileSync("git", ["ls-remote", "--heads", "origin"], { encoding: "utf8" });',
    'const leftoverSovereignBranches = raw.split(/\\r?\\n/)',
    '  .map((line) => line.trim())',
    '  .filter(Boolean)',
    '  .map((line) => {',
    '    const [sha, ref] = line.split(/\\s+/);',
    '    return { sha, name: String(ref ?? "").replace(/^refs\\/heads\\//, "") };',
    '  })',
    '  .filter((item) => item.name.startsWith("feature/sovereign-") && /^[a-f0-9]{40}$/.test(item.sha))',
    '  .sort((left, right) => left.name.localeCompare(right.name));',
    '',
    'process.stdout.write(JSON.stringify({',
    '  schemaVersion: 1,',
    '  leftoverSovereignBranches,',
    '}, null, 2) + "\\n");',
    '',
  ].join("\n");
}

export function renderZeroCreditBoundaryTest() {
  return [
    'import test from "node:test";',
    'import assert from "node:assert/strict";',
    'import { readFile } from "node:fs/promises";',
    'import path from "node:path";',
    'import { fileURLToPath } from "node:url";',
    'import { loadManifest } from "../src/config.mjs";',
    'import { selectZeroCreditProvider } from "../src/zero-credit-provider-selector.mjs";',
    '',
    'const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");',
    '',
    'test("four-hour cycle stays deterministic with empty providers and no generation", async () => {',
    '  const workerSource = await readFile(path.join(root, "src/cloud-cycle-worker.mjs"), "utf8");',
    '  assert.match(workerSource, /providers: \\[\\]/);',
    '  assert.match(workerSource, /requiresGeneration: false/);',
    '  assert.match(workerSource, /cloudModeEnabled: false/);',
    '  assert.match(workerSource, /MAHORAGA_CANDIDATE_PRODUCER === "github-native"/);',
    '  assert.doesNotMatch(workerSource, /process\\.env\\.OPENAI/);',
    '',
    '  const workflow = await readFile(path.join(root, ".github/workflows/sovereign-eight-hour-cycle.yml"), "utf8");',
    '  assert.match(workflow, /MAHORAGA_CANDIDATE_PRODUCER:\\s*github-native/);',
    '  assert.doesNotMatch(workflow, /openai\\.com/);',
    '',
    '  const manifest = await loadManifest();',
    '  assert.equal(manifest.featureFlags.openAIProvider, false);',
    '',
    '  const decision = selectZeroCreditProvider({ providers: [], requiresGeneration: false, cloudModeEnabled: false });',
    '  assert.equal(decision.status, "selected");',
    '  assert.equal(decision.providerId, "deterministic-only");',
    '  assert.equal(decision.costClass, "deterministic");',
    '',
    '  const waiting = selectZeroCreditProvider({ providers: [], requiresGeneration: true, cloudModeEnabled: true });',
    '  assert.equal(waiting.status, "waiting");',
    '  assert.equal(waiting.providerId, "waiting-zero-credit-provider");',
    '});',
    '',
  ].join("\n");
}

export function renderCycleOutcomeLedger({ cycleId, gapAudit = { open: [] }, baseSha = "", producedAt = new Date().toISOString() } = {}) {
  if (typeof cycleId !== "string" || !/^[a-f0-9]{64}$/.test(cycleId)) throw new TypeError("cycleId is invalid");
  const open = Array.isArray(gapAudit.open) ? gapAudit.open : [];
  const blockedGapIds = open.filter((item) => item.state === "blocked").map((item) => item.id).filter(Boolean).sort();
  const actionableGapIds = open.filter((item) => item.state === "open" || item.state === "unverified").map((item) => item.id).filter(Boolean).sort();
  return `${JSON.stringify({
    schemaVersion: 1,
    product: "mahoraga",
    cycleId,
    baseSha: typeof baseSha === "string" ? baseSha : "",
    producedAt,
    counts: {
      open: open.length,
      blocked: blockedGapIds.length,
      actionable: actionableGapIds.length,
    },
    blockedGapIds,
    actionableGapIds,
    note: "Zero-credit cycle pulse. Not a Windows activation.",
  }, null, 2)}\n`;
}

export function classifyPullRequestCreationFailure(errorLike) {
  const text = diagnosticText(errorLike);
  if (/GitHub Actions is not permitted to create or approve pull requests/i.test(text)) {
    return Object.freeze({
      code: "candidate-pr-creation-disabled",
      stage: "pull-request-create",
      publicDetail: "Enable Settings > Actions > General > Workflow permissions > Allow GitHub Actions to create and approve pull requests.",
    });
  }
  if (/Resource not accessible by integration|permission|forbidden/i.test(text)) {
    return Object.freeze({
      code: "candidate-pr-creation-forbidden",
      stage: "pull-request-create",
      publicDetail: "GitHub rejected pull-request creation for the producer identity. Verify repository Workflow permissions or configure a dedicated bounded producer identity.",
    });
  }
  return Object.freeze({
    code: "candidate-pr-create-failed",
    stage: "pull-request-create",
    publicDetail: "GitHub pull-request creation failed after the candidate branch was pushed; the branch is retained for safe retry.",
  });
}

export function decideExistingCandidateHandoff(prs) {
  if (!Array.isArray(prs)) throw codedError("candidate-existing-pr-invalid");
  if (prs.length === 0) return "create-pr";
  if (prs.length === 1) return "reuse-pr";
  throw codedError("candidate-existing-pr-invalid");
}

export function decideStaleCandidateBranch({ mergeBase, baseSha, openPrCount } = {}) {
  if (typeof mergeBase !== "string" || typeof baseSha !== "string" || !/^[a-f0-9]{40}$/.test(mergeBase) || !/^[a-f0-9]{40}$/.test(baseSha)) {
    throw codedError("candidate-existing-base-drift");
  }
  if (!Number.isSafeInteger(openPrCount) || openPrCount < 0) throw codedError("candidate-existing-pr-invalid");
  if (mergeBase === baseSha) return "reuse";
  if (openPrCount > 0) throw codedError("candidate-existing-base-drift");
  return "reclaim";
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
      readFile: (relative) => {
        try {
          return readFileSync(path.join(root, relative), "utf8");
        } catch {
          return null;
        }
      },
      cycleId,
      gapAudit,
    });
    if (!enhancement) return null;
    assertSafeCandidatePaths(enhancement.changedFiles);

    const branchName = `feature/sovereign-${cycleId.slice(0, 12)}`;
    const existing = existingCandidateContext({ repositoryIdentity, branchName, baseSha, enhancement, root, runCommand });
    if (existing) {
      const pr = ensurePullRequest({ repositoryIdentity, branchName, baseSha, headSha: existing.headSha, enhancement, existingPrs: existing.prs, root, runCommand });
      dispatchVerify({ repositoryIdentity, branchName, root, runCommand });
      return candidateReceipt({ baseSha, headSha: existing.headSha, branchName, pr, changedFiles: existing.changedFiles });
    }

    command(runCommand, "git", ["checkout", "-b", branchName, baseSha], root);
    if (enhancement.id === "operator-scan-report") {
      writeFileSync(path.join(root, OPERATOR_SCAN_REPORT), renderOperatorScanReportScript(), { encoding: "utf8", flag: "wx" });
    } else if (enhancement.id === "operator-scan-report-test") {
      writeFileSync(path.join(root, OPERATOR_SCAN_REPORT_TEST), renderOperatorScanReportTest(), { encoding: "utf8", flag: "wx" });
    } else if (enhancement.id === "operator-stale-branch-report") {
      writeFileSync(path.join(root, OPERATOR_STALE_BRANCH_REPORT), renderOperatorStaleBranchReportScript(), { encoding: "utf8", flag: "wx" });
    } else if (enhancement.id === "zero-credit-boundary-test") {
      writeFileSync(path.join(root, ZERO_CREDIT_BOUNDARY_TEST), renderZeroCreditBoundaryTest(), { encoding: "utf8", flag: "wx" });
    } else if (enhancement.id === "cycle-outcome-ledger") {
      mkdirSync(path.join(root, "reports"), { recursive: true });
      writeFileSync(path.join(root, CYCLE_OUTCOME_LEDGER), renderCycleOutcomeLedger({ cycleId, gapAudit, baseSha }), { encoding: "utf8" });
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
    const pr = ensurePullRequest({ repositoryIdentity, branchName, baseSha, headSha, enhancement, existingPrs: [], root, runCommand });
    dispatchVerify({ repositoryIdentity, branchName, root, runCommand });
    return candidateReceipt({ baseSha, headSha, branchName, pr, changedFiles });
  };
}

function existingCandidateContext({ repositoryIdentity, branchName, baseSha, enhancement, root, runCommand }) {
  const remote = command(runCommand, "git", ["ls-remote", "--heads", "origin", `refs/heads/${branchName}`], root);
  if (!remote) return null;
  command(runCommand, "git", ["fetch", "origin", `${branchName}:refs/remotes/origin/${branchName}`], root);
  const headSha = command(runCommand, "git", ["rev-parse", `origin/${branchName}`], root);
  if (!/^[a-f0-9]{40}$/.test(headSha) || headSha === baseSha) throw codedError("candidate-existing-head-invalid");
  const mergeBase = command(runCommand, "git", ["merge-base", baseSha, headSha], root);
  const raw = command(runCommand, "gh", ["pr", "list", "--repo", repositoryIdentity, "--head", branchName, "--base", "main", "--state", "open", "--json", "number,headRefOid,baseRefOid,baseRefName,state"], root);
  const prs = JSON.parse(raw);
  if (!Array.isArray(prs)) throw codedError("candidate-existing-pr-invalid");
  const stale = decideStaleCandidateBranch({ mergeBase, baseSha, openPrCount: prs.length });
  if (stale === "reclaim") {
    command(runCommand, "git", ["push", "origin", "--delete", branchName], root);
    return null;
  }
  const changedFiles = splitLines(command(runCommand, "git", ["diff", "--name-only", `${baseSha}...${headSha}`], root));
  requireExactPaths(changedFiles, enhancement.changedFiles);
  assertSafeCandidatePaths(changedFiles);
  decideExistingCandidateHandoff(prs);
  return Object.freeze({ headSha, changedFiles, prs });
}

function ensurePullRequest({ repositoryIdentity, branchName, baseSha, headSha, enhancement, existingPrs, root, runCommand }) {
  const decision = decideExistingCandidateHandoff(existingPrs);
  if (decision === "create-pr") {
    try {
      command(runCommand, "gh", ["pr", "create", "--repo", repositoryIdentity, "--base", "main", "--head", branchName, "--title", enhancement.title, "--body", `${enhancement.summary}\n\nProduced by Mahoraga sovereign zero-credit candidate cycle.`], root);
    } catch (error) {
      const classified = classifyPullRequestCreationFailure(error);
      throw codedError(classified.code, classified);
    }
  }

  let pr;
  try {
    pr = JSON.parse(command(runCommand, "gh", ["pr", "view", branchName, "--repo", repositoryIdentity, "--json", "number,headRefOid,baseRefOid,baseRefName,state"], root));
  } catch {
    throw codedError("candidate-pr-readback-failed", {
      stage: "pull-request-readback",
      publicDetail: "The candidate branch exists, but GitHub pull-request metadata could not be read back for immutable receipt validation.",
    });
  }
  validatePr(pr, { baseSha, headSha });
  return pr;
}

function dispatchVerify({ repositoryIdentity, branchName, root, runCommand }) {
  try {
    command(runCommand, "gh", ["workflow", "run", "verify.yml", "--repo", repositoryIdentity, "--ref", branchName], root);
  } catch {
    throw codedError("candidate-verify-dispatch-failed", {
      stage: "verify-dispatch",
      publicDetail: "The candidate PR exists, but the explicit Verify dispatch failed; the branch and PR are retained for safe retry.",
    });
  }
}

function candidateReceipt({ baseSha, headSha, branchName, pr, changedFiles }) {
  return Object.freeze({
    baseSha,
    headSha,
    branch: branchName,
    pullRequestNumber: pr.number,
    changedFilesDigest: candidateChangedFilesDigest(changedFiles),
  });
}

function validatePr(pr, { baseSha, headSha }) {
  if (!pr || pr.state !== "OPEN" || pr.baseRefName !== "main" || pr.baseRefOid !== baseSha || pr.headRefOid !== headSha || !Number.isSafeInteger(pr.number) || pr.number < 1) {
    throw codedError("candidate-pr-invalid", {
      stage: "pull-request-validate",
      publicDetail: "GitHub pull-request metadata did not match the immutable candidate branch receipt.",
    });
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

function diagnosticText(errorLike) {
  const values = [errorLike?.stderr, errorLike?.stdout, errorLike?.message];
  return values.map((value) => Buffer.isBuffer(value) ? value.toString("utf8") : String(value ?? "")).join("\n").slice(0, 4096);
}

function command(runCommand, executable, args, cwd) {
  return String(runCommand(executable, args, cwd) ?? "").trim();
}

function fixedCommand(executable, args, cwd) {
  return execFileSync(executable, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: process.env });
}

function codedError(code, { stage = null, publicDetail = null } = {}) {
  const error = new Error(code);
  error.code = code;
  if (stage) error.stage = stage;
  if (publicDetail) error.publicDetail = publicDetail;
  return error;
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
if (invoked && process.argv.includes("--scan-only")) {
  const report = buildGapAudit(await loadManifest());
  const enhancement = scanForSafeEnhancement({
    gapAudit: report,
    readFile: (relative) => {
      try {
        return readFileSync(path.join(ROOT, relative), "utf8");
      } catch {
        return null;
      }
    },
  });
  process.stdout.write(`${JSON.stringify({ status: enhancement ? "actionable" : "no-actionable-work", enhancement, blockedGapIds: report.open.filter((item) => item.state === "blocked").map((item) => item.id).sort() })}\n`);
}
