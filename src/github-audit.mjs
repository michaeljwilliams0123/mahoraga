import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
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

  const actions = [];
  for (const [file, source] of workflowSources) {
    for (const match of source.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)\s*$/gm)) {
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

export function isDeterministicDependency(specification) {
  if (typeof specification !== "string") return false;
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(specification)
    || /^(?:file|link):[^\r\n]+$/.test(specification)
    || /^git\+https:\/\/[^\s#]+#[a-f0-9]{40}$/i.test(specification);
}

async function trackedFiles(root) {
  const { stdout } = await execFileAsync("git", ["-C", root, "ls-files", "-z", "--cached", "--others", "--exclude-standard"], { encoding: "buffer", maxBuffer: 4 * 1024 * 1024, windowsHide: true });
  return stdout.toString("utf8").split("\u0000").filter(Boolean).map((file) => file.replaceAll("\\", "/"));
}

function isSensitiveRuntimePath(file) {
  return /(?:^|\/)(?:\.env(?:\..*)?|\.git-credentials|\.netrc|\.npmrc|\.pypirc|\.token_cache\.bin)$/i.test(file)
    || /(?:^|\/)(?:credentials?|secrets?|tokens?)(?:\.[^/]*)?$/i.test(file)
    || /(?:^|\/)[^/]+\.(?:key|p12|pfx|pem|token)$/i.test(file);
}

async function publicPrivacyFindings(root, files) {
  const findings = [];
  const secretPatterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\bgh[pousr]_[A-Za-z0-9]{36,}\b/,
    /\bgithub_pat_[A-Za-z0-9_]{40,}\b/,
    /\bAKIA[0-9A-Z]{16}\b/,
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
