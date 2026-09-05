import { execFile } from "node:child_process";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { ROOT } from "./config.mjs";

const execFileAsync = promisify(execFile);
const GOVERNANCE_FILES = Object.freeze([
  ".github/CODEOWNERS",
  ".github/dependabot.yml",
  ".github/pull_request_template.md",
  "SECURITY.md",
  "docs/GITHUB-OPERATIONS.md",
  "docs/GITHUB-SECURITY-BASELINE.md",
  "docs/DESTINY-CODEX-RELAY.md",
]);
const SAFE_EMAIL_DOMAINS = new Set(["example.com", "odata.bind", "users.noreply.github.com"]);
const TEXT_FILE = /(?:^|\/)(?:[^/]+\.(?:cjs|css|html|js|json|md|mjs|ps1|py|sh|txt|yaml|yml)|AGENTS\.md|CODEOWNERS)$/i;

export async function buildGithubAudit({ root = ROOT, listTrackedFiles = trackedFiles } = {}) {
  const files = (await listTrackedFiles(root)).sort();
  const fileSet = new Set(files);
  const checks = [];
  const add = (id, healthy, severity, summary, evidence = undefined) => {
    checks.push(Object.freeze({ id, healthy, severity, summary, ...(evidence ? { evidence } : {}) }));
  };

  const missingGovernance = GOVERNANCE_FILES.filter((file) => !fileSet.has(file));
  add(
    "governance-files",
    missingGovernance.length === 0,
    "blocking",
    missingGovernance.length ? `${missingGovernance.length} required governance file(s) are missing.` : "Repository governance files are present.",
    missingGovernance.length ? { files: missingGovernance } : undefined,
  );

  const canonicalWorkspaceFiles = [
    "cloud-app/app/page.tsx",
    "cloud-app/components/workspace.tsx",
    "cloud-app/vercel.json",
  ];
  const retiredWorkspaceFiles = [
    ".github/workflows/pages.yml",
    "cloud/index.html",
    "cloud/app.js",
    "web/index.html",
    "web/app.js",
  ];
  const missingWorkspaceFiles = canonicalWorkspaceFiles.filter((file) => !fileSet.has(file));
  const retainedLegacyFiles = retiredWorkspaceFiles.filter((file) => fileSet.has(file));
  const workspaceHealthy = missingWorkspaceFiles.length === 0 && retainedLegacyFiles.length === 0;
  add(
    "single-vercel-workspace",
    workspaceHealthy,
    "blocking",
    workspaceHealthy ? "Vercel is the sole browser UI and legacy Pages or loopback entry points are absent." : "The single Vercel workspace contract is incomplete.",
    workspaceHealthy ? undefined : { files: [...missingWorkspaceFiles, ...retainedLegacyFiles] },
  );

  const sensitivePaths = files.filter(isSensitiveRuntimePath);
  add(
    "tracked-runtime-secrets",
    sensitivePaths.length === 0,
    "blocking",
    sensitivePaths.length ? `${sensitivePaths.length} secret-bearing runtime path(s) are tracked.` : "No runtime token, credential, key, or environment file is tracked.",
    sensitivePaths.length ? { files: sensitivePaths.slice(0, 20) } : undefined,
  );

  const packageFiles = files.filter((file) => path.posix.basename(file) === "package.json" && !file.startsWith("state/release-baseline/"));
  const dependencyIssues = [];
  for (const file of packageFiles) {
    const value = JSON.parse(await readFile(path.join(root, file), "utf8"));
    for (const section of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
      for (const [name, specification] of Object.entries(value[section] ?? {})) {
        if (!isDeterministicDependency(specification)) dependencyIssues.push({ file, dependency: name, section });
      }
    }
  }
  add(
    "deterministic-dependencies",
    dependencyIssues.length === 0,
    "blocking",
    dependencyIssues.length ? `${dependencyIssues.length} dependency specification(s) are not exact.` : "Tracked runtime dependency specifications are exact.",
    dependencyIssues.length ? { dependencies: dependencyIssues.slice(0, 20) } : undefined,
  );

  const workflowFiles = files.filter((file) => /^\.github\/workflows\/[^/]+\.ya?ml$/i.test(file));
  const workflowSources = await Promise.all(workflowFiles.map(async (file) => [file, await readFile(path.join(root, file), "utf8")]));
  const missingPermissions = workflowSources.filter(([, source]) => !/^permissions:\s*(?:\r?\n|$)/m.test(source)).map(([file]) => file);
  add(
    "workflow-permissions",
    missingPermissions.length === 0,
    "blocking",
    missingPermissions.length ? `${missingPermissions.length} workflow(s) lack an explicit top-level permission block.` : "Every workflow declares an explicit top-level permission block.",
    missingPermissions.length ? { files: missingPermissions } : undefined,
  );

  const unsafeTriggers = workflowSources.filter(([, source]) => /(^|\s)pull_request_target\s*:/m.test(source)).map(([file]) => file);
  add(
    "workflow-trigger-boundary",
    unsafeTriggers.length === 0,
    "blocking",
    unsafeTriggers.length ? "A workflow uses pull_request_target." : "No workflow uses pull_request_target.",
    unsafeTriggers.length ? { files: unsafeTriggers } : undefined,
  );

  const autonomousWorkflow = workflowSources.find(([file]) => file === ".github/workflows/autonomous-integration.yml")?.[1] ?? "";
  const autonomousFiles = [
    ".github/workflows/autonomous-integration.yml",
    "scripts/autonomous-integration.mjs",
    "src/autonomous-integration.mjs",
    "src/autonomy-policy.mjs",
    "src/incumbent-trust-epoch.mjs",
    "state/incumbent-trust-epoch.json",
  ];
  const autonomousMissing = autonomousFiles.filter((file) => !fileSet.has(file));
  const autonomousTrusted = autonomousMissing.length === 0 && isTrustedAutonomousIntegrationWorkflow(autonomousWorkflow);
  add(
    "autonomous-integration",
    autonomousTrusted,
    "blocking",
    autonomousTrusted ? "Automatic integration is bound to trusted main policy, exact verified heads, incumbent epoch transport, and current base." : "Automatic integration authority is missing or broader than the trusted contract.",
    autonomousMissing.length ? { files: autonomousMissing } : undefined,
  );

  let incumbentEpochHealthy = false;
  let incumbentEpochSummary = "The incumbent trust epoch is missing or invalid.";
  try {
    const { parseIncumbentTrustEpoch } = await import("./incumbent-trust-epoch.mjs");
    const epoch = parseIncumbentTrustEpoch(await readFile(path.join(root, "state/incumbent-trust-epoch.json"), "utf8"));
    incumbentEpochHealthy = epoch.trustedCommit.length === 40;
    incumbentEpochSummary = incumbentEpochHealthy
      ? "Incumbent trust epoch is present, schema-valid, and bound to a full commit SHA."
      : incumbentEpochSummary;
  } catch {
    incumbentEpochHealthy = false;
  }
  add(
    "incumbent-trust-epoch",
    incumbentEpochHealthy,
    "blocking",
    incumbentEpochSummary,
  );

  const liveProtectionFiles = [
    "config/main-protection.contract.json",
    "src/github-live-protection.mjs",
    "scripts/github-live-protection.mjs",
  ];
  const liveProtectionMissing = liveProtectionFiles.filter((file) => !fileSet.has(file));
  const packageSource = await readFile(path.join(root, "package.json"), "utf8");
  let liveContractHealthy = false;
  try {
    const { parseMainProtectionContract, LIVE_PROTECTION_PROBE } = await import("./github-live-protection.mjs");
    parseMainProtectionContract(await readFile(path.join(root, "config/main-protection.contract.json"), "utf8"));
    liveContractHealthy = liveProtectionMissing.length === 0 && packageSource.includes(LIVE_PROTECTION_PROBE);
  } catch {
    liveContractHealthy = false;
  }
  add(
    "live-main-protection-contract",
    liveContractHealthy,
    "blocking",
    liveContractHealthy
      ? "Live main-protection contract, evaluator, and zero-credit probe are present."
      : "Live main-protection contract is missing or is not wired into verify.",
    liveProtectionMissing.length ? { files: liveProtectionMissing } : undefined,
  );

  const destinyWorkflow = workflowSources.find(([file]) => file === ".github/workflows/destiny-codex-relay.yml")?.[1] ?? "";
  const destinyFiles = [
    ".github/workflows/destiny-codex-relay.yml",
    "scripts/destiny-codex-dispatch.mjs",
    "src/destiny-codex-dispatch.mjs",
    "docs/DESTINY-CODEX-RELAY.md",
  ];
  const destinyMissing = destinyFiles.filter((file) => !fileSet.has(file));
  const destinyTrusted = destinyMissing.length === 0
    && /path:\s*trusted/.test(destinyWorkflow)
    && /path:\s*candidate/.test(destinyWorkflow)
    && /node trusted\/scripts\/destiny-codex-dispatch\.mjs validate-pr --root candidate/.test(destinyWorkflow)
    && !/contents:\s*write/.test(destinyWorkflow)
    && !/pull-requests:\s*write/.test(destinyWorkflow);
  add(
    "destiny-codex-relay",
    destinyTrusted,
    "blocking",
    destinyTrusted ? "Destiny Codex dispatches use an owner-bound, trusted-base, read-only validation gate." : "The Destiny Codex trusted relay contract is incomplete or writable.",
    destinyMissing.length ? { files: destinyMissing } : undefined,
  );

  const workspaceAgentReceiver = workflowSources.find(([file]) => file === ".github/workflows/workspace-agent-receiver.yml")?.[1] ?? "";
  const cloudTaskGateway = workflowSources.find(([file]) => file === ".github/workflows/cloud-task-gateway.yml")?.[1] ?? "";
  const workspaceAgentReceiverFiles = [
    ".github/workflows/workspace-agent-receiver.yml",
    "scripts/workspace-agent-receiver.mjs",
    "scripts/workspace-agent.mjs",
    "src/workspace-agent-worker.mjs",
  ];
  const workspaceAgentReceiverMissing = workspaceAgentReceiverFiles.filter((file) => !fileSet.has(file));
  const workspaceAgentReceiverTrusted = workspaceAgentReceiverMissing.length === 0
    && /push:\s*[\s\S]*branches:\s*\[main\][\s\S]*coordination\/assignments\/\*\.json/.test(workspaceAgentReceiver)
    && /issue_comment:\s*[\s\S]*types:\s*\[created\]/.test(workspaceAgentReceiver)
    && /github\.actor == github\.repository_owner/.test(workspaceAgentReceiver)
    && /contents:\s*read/.test(workspaceAgentReceiver)
    && !/contents:\s*write/.test(workspaceAgentReceiver)
    && !/pull-requests:\s*write/.test(workspaceAgentReceiver)
    && /AGENT_ACCESS_TOKEN:\s*\$\{\{ secrets\.AGENT_ACCESS_TOKEN \}\}/.test(workspaceAgentReceiver)
    && /WORKSPACE_AGENT_TRIGGER_ID:\s*\$\{\{ secrets\.WORKSPACE_AGENT_TRIGGER_ID \}\}/.test(workspaceAgentReceiver)
    && /node scripts\/workspace-agent-receiver\.mjs receive --event-file "\$GITHUB_EVENT_PATH"/.test(workspaceAgentReceiver)
    && /actions:\s*write/.test(cloudTaskGateway)
    && /actions\.createWorkflowDispatch/.test(cloudTaskGateway)
    && /workflow_id:\s*"workspace-agent-receiver\.yml"/.test(cloudTaskGateway)
    && /inputs:\s*\{ assignment_id: process\.env\.ASSIGNMENT_ID \}/.test(cloudTaskGateway)
    && /steps\.gateway\.outputs\.mode == 'desktop'/.test(cloudTaskGateway)
    && /continue-on-error:\s*true/.test(cloudTaskGateway)
    && /steps\.workspace_receiver\.outcome == 'failure'/.test(cloudTaskGateway)
    && !/secrets\.AGENT_ACCESS_TOKEN|secrets\.WORKSPACE_AGENT_TRIGGER_ID/.test(cloudTaskGateway);
  add(
    "workspace-agent-receiver",
    workspaceAgentReceiverTrusted,
    "blocking",
    workspaceAgentReceiverTrusted
      ? "Workspace Agent delivery is owner-bound, read-only in GitHub, assignment-scoped, and secret-backed."
      : "The Workspace Agent receiver boundary is missing or broader than its trusted contract.",
    workspaceAgentReceiverMissing.length ? { files: workspaceAgentReceiverMissing } : undefined,
  );

  const actions = [];
  for (const [file, source] of workflowSources) {
    for (const match of source.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)(?:\s+#.*)?\s*$/gm)) {
      const value = match[1];
      if (value.startsWith("./") || value.startsWith("docker://")) continue;
      const [action, reference = ""] = value.split("@");
      actions.push({ file, action, reference });
    }
  }
  const externalActions = actions.filter(({ action }) => !action.startsWith("actions/"));
  add(
    "github-action-owners",
    externalActions.length === 0,
    "blocking",
    externalActions.length ? `${externalActions.length} action reference(s) are not GitHub-owned.` : "All remote action references are GitHub-owned.",
    externalActions.length ? { actions: externalActions.slice(0, 20) } : undefined,
  );

  const mutableActions = actions.filter(({ reference }) => !/^[a-f0-9]{40}$/i.test(reference));
  add(
    "github-action-sha-pinning",
    mutableActions.length === 0,
    "advisory",
    mutableActions.length ? `${mutableActions.length} GitHub-owned action reference(s) still use mutable tags.` : "Action references use immutable commit SHAs.",
    mutableActions.length ? { files: [...new Set(mutableActions.map(({ file }) => file))] } : undefined,
  );

  const privacyFindings = await publicPrivacyFindings(root, files);
  add(
    "public-repository-privacy",
    privacyFindings.length === 0,
    "blocking",
    privacyFindings.length ? `${privacyFindings.length} tracked file(s) contain a prohibited public-repository pattern.` : "Tracked text contains no high-confidence credential or personal-email pattern.",
    privacyFindings.length ? { files: privacyFindings.slice(0, 20) } : undefined,
  );

  const manifest = JSON.parse(await readFile(path.join(root, "mahoraga.manifest.json"), "utf8"));
  add(
    "loopback-runtime",
    manifest.runtime?.host === "127.0.0.1" && manifest.browser?.controlCenterUrl === "http://127.0.0.1:4782/",
    "blocking",
    "Runtime and browser control addresses must remain fixed to loopback.",
  );

  const hookSource = await readFile(path.join(root, ".githooks", "pre-push"), "utf8");
  add(
    "history-guard",
    /refs\/heads\/main/.test(hookSource) && /merge-base --is-ancestor/.test(hookSource),
    "blocking",
    "The versioned pre-push hook guards main against deletion and non-fast-forward updates.",
  );

  const blocking = checks.filter((check) => check.severity === "blocking");
  return Object.freeze({
    schemaVersion: 1,
    scope: "candidate-repository-state-only",
    healthy: blocking.every((check) => check.healthy),
    counts: {
      checks: checks.length,
      blockingFailures: blocking.filter((check) => !check.healthy).length,
      advisories: checks.filter((check) => check.severity === "advisory" && !check.healthy).length,
    },
    checks,
    note: "Live GitHub settings and historical Git objects require GitHub-native verification; no credential or file content is emitted.",
  });
}

export function isTrustedAutonomousIntegrationWorkflow(source) {
  if (typeof source !== "string") return false;
  return /workflow_run\s*:/.test(source)
    && /workflows:\s*\[[^\]]*"Verify Mahoraga"[^\]]*"Validate Destiny Codex Relay"[^\]]*\]/.test(source)
    && !/issue_comment\s*:/.test(source)
    && !/latestExactDestinyResult/.test(source)
    && /actions:\s*write/.test(source)
    && /contents:\s*write/.test(source)
    && /pull-requests:\s*write/.test(source)
    && /github\.event\.workflow_run\.event == 'pull_request'/.test(source)
    && /github\.event\.workflow_run\.head_repository\.full_name == github\.repository/.test(source)
    && /ref:\s*main/.test(source)
    && /persist-credentials:\s*false/.test(source)
    && /node scripts\/autonomous-integration\.mjs --input state\/autonomous-integration-input\.json/.test(source)
    && /latestExactWorkflowRun\(runs,\s*\{\s*name:\s*"Verify Mahoraga",\s*headSha:\s*detail\.head\.sha\s*\}\)/.test(source)
    && /latestExactWorkflowRun\(runs,\s*\{\s*name:\s*"Validate Destiny Codex Relay",\s*headSha:\s*detail\.head\.sha\s*\}\)/.test(source)
    && /verify\?\.status === "completed" && verify\.conclusion === "success"/.test(source)
    && /relay\?\.status === "completed" && relay\.conclusion === "success"/.test(source)
    && /freshDecision = evaluateAutonomousIntegration/.test(source)
    && /policy-changed-before-merge/.test(source)
    && /headContainsMain:\s*ancestry\.data\.behind_by === 0/.test(source)
    && /freshDecision\.headSha !== expectedHead/.test(source)
    && /pulls\.merge\(\{[\s\S]*sha:\s*expectedHead[\s\S]*merge_method:\s*"squash"/.test(source)
    && /actions\.createWorkflowDispatch\(\{[\s\S]*workflow_id:\s*"verify\.yml"[\s\S]*ref:\s*"main"/.test(source)
    && /incumbent-trust-epoch\.json/.test(source)
    && /trustedEpoch/.test(source)
    && /sovereignEvolution/.test(source);
}

export function isDeterministicDependency(specification) {
  if (typeof specification !== "string") return false;
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(specification)
    || /^(?:file|link):[^\r\n]+$/.test(specification)
    || /^git\+https:\/\/[^\s#]+#[a-f0-9]{40}$/i.test(specification);
}

export function renderGithubAuditMarkdown(report) {
  const status = report.healthy && report.counts.advisories === 0 ? "Ready" : report.healthy ? "Review advisories" : "Blocked";
  const rows = report.checks.map((check) => {
    const state = check.healthy ? "Pass" : check.severity === "blocking" ? "Blocked" : "Advisory";
    return `| ${markdown(check.id)} | ${state} | ${markdown(check.severity)} | ${markdown(check.summary)} |`;
  });
  return [
    "## Mahoraga GitHub assurance",
    "",
    `**${status}** · ${report.counts.checks} controls · ${report.counts.blockingFailures} blocking failures · ${report.counts.advisories} advisories`,
    "",
    "| Control | State | Level | Evidence |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
    "> Deterministic repository audit only. It does not invoke Codex, consume model credits, expose localhost, or emit credentials or file content.",
    "",
  ].join("\n");
}

async function trackedFiles(root) {
  const { stdout } = await execFileAsync("git", ["-C", root, "ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "buffer", maxBuffer: 4 * 1024 * 1024, windowsHide: true });
  const candidates = stdout.toString("utf8").split("\u0000").filter(Boolean).map((file) => file.replaceAll("\\", "/"));
  const present = await Promise.all(candidates.map(async (file) => {
    try { await lstat(path.join(root, file)); return file; }
    catch (error) { if (error?.code === "ENOENT") return null; throw error; }
  }));
  return present.filter(Boolean);
}

function isSensitiveRuntimePath(file) {
  if (/(?:^|\/)\.env\.example$/i.test(file)) return false;
  return /(?:^|\/)(?:\.env(?:\..*)?|\.git-credentials|\.netrc|\.npmrc|\.pypirc|\.token_cache\.bin)$/i.test(file)
    || /(?:^|\/)(?:credentials?|secrets?|tokens?)(?:\.[^/]*)?$/i.test(file)
    || /(?:^|\/)[^/]+\.(?:key|p12|pfx|pem|token)$/i.test(file);
}

function markdown(value) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").replaceAll("\\", "\\\\").replaceAll("|", "\\|");
}

async function publicPrivacyFindings(root, files) {
  const findings = [];
  const secretPatterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\bgh[pousr]_[A-Za-z0-9]{36,}\b/,
    /\bgithub_pat_[A-Za-z0-9_]{40,}\b/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\b[A-Z]:\\Users\\(?!<USER>\\)[^\\\r\n]+\\\.cache\\/i,
    /\/(?:Users|home)\/(?!<USER>\/)[^/\r\n]+\/\.cache\//,
  ];
  const emailPattern = /\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi;
  for (const file of files.filter((candidate) => TEXT_FILE.test(candidate))) {
    const source = await readFile(path.join(root, file), "utf8");
    let prohibited = secretPatterns.some((pattern) => pattern.test(source));
    if (!prohibited) {
      for (const match of source.matchAll(emailPattern)) {
        if (!SAFE_EMAIL_DOMAINS.has(match[1].toLowerCase())) { prohibited = true; break; }
      }
    }
    if (prohibited) findings.push(file);
  }
  return findings;
}
