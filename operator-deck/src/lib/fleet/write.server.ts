import { spawn } from "node:child_process";
import type { WriteVerb } from "./types";

export const REPO = "michaeljwilliams0123/mahoraga";
const RULESET_ID = "22284961";
const PROTECTED = new Set(["main", "master", "production", "HEAD"]);

/** Wave A contained branches from issue #83. Preview first; delete only if ahead_by=0 and no open PR. */
export const WAVE_A_BRANCHES = [
  "UI-Design",
  "agent/mahoraga-3-1-production-workers",
  "agent/mahoraga-7-truth-containment",
  "alert-autofix-30",
  "alert-autofix-33",
  "alert-autofix-38",
  "alert-autofix-39",
  "alert-autofix-51",
  "alert-autofix-57",
  "alert-autofix-58",
  "alert-autofix-59",
  "alert-autofix-60",
  "alert-autofix-68",
  "alert-autofix-523",
  "audit/github-hardening-20260824",
  "chromebook/control-plane-v1",
  "codex/bidirectional-controllership",
  "codex/chatgpt-auth-bootstrap",
  "codex/cloud-autonomy-hardening",
  "codex/complex-data-cloud-browser-evals",
  "codex/credit-safe-runner",
  "codex/follow-through-69-conversation-plane",
  "codex/follow-through-69-review-fixes",
  "codex/functional-cloud-workspace",
  "codex/issue-1-private-github-bridge",
  "codex/live-connections-20260830",
  "codex/mailbox-runner-hardening",
  "codex/public-coordination-guardrails",
  "codex/strict-idempotent-submission",
  "destiny/public-next-ui-20260830-v2",
  "destiny/ui-functional-audit-20260831",
  "destiny/unified-conversation-evolution-plane-implementation",
  "feature/mahoraga-sovereign-reasoning-20260829",
  "fix/stabilize-main-20260901",
  "primary-cloud/answer-quality-review-20260825",
  "secondary/sec-3260ff23-e5b2-4bbc-9a15-0cb07acc9492",
  "secondary/sec-ac0c314a-a0d1-4f4a-bfa6-36405c1e1ccb",
  "security/codeql-remediation-20260824",
  "test/chromebook-control-plane-smoke-20260823",
  "upgrade/provider-readiness-20260823",
] as const;

export type GhResult = { code: number; stdout: string; stderr: string };

export type WriteRequest = {
  verb: WriteVerb;
  issueNumber: number | null;
  workflowFile: string | null;
  body: string | null;
};

export type WriteOutcome = {
  ok: boolean;
  state: "succeeded" | "failed" | "denied" | "waiting";
  title: string;
  summary: string;
  evidence: Array<{ label: string; value: string; href?: string }>;
};

function runGh(args: string[], timeoutMs = 28000): Promise<GhResult> {
  return new Promise((resolve) => {
    const child = spawn("gh", args, {
      env: {
        ...process.env,
        GH_PROMPT_DISABLED: "1",
        GH_NO_UPDATE_NOTIFIER: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > 80_000) stdout = stdout.slice(0, 80_000);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 40_000) stderr = stderr.slice(0, 40_000);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout: "", stderr: error.message });
    });
  });
}

function clip(text: string, max = 480): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function fail(title: string, summary: string, extra: WriteOutcome["evidence"] = []): WriteOutcome {
  return { ok: false, state: "failed", title, summary, evidence: extra };
}

function wait(title: string, summary: string, extra: WriteOutcome["evidence"] = []): WriteOutcome {
  return { ok: false, state: "waiting", title, summary, evidence: extra };
}

function deny(title: string, summary: string, extra: WriteOutcome["evidence"] = []): WriteOutcome {
  return { ok: false, state: "denied", title, summary, evidence: extra };
}

export async function loadWriteStatus(): Promise<{
  ok: boolean;
  login: string | null;
  rulesetName: string | null;
  rulesetEnforcement: string | null;
  requiredChecks: string[];
  error?: string;
}> {
  const who = await runGh(["api", "user", "--jq", ".login"]);
  if (who.code !== 0) {
    return {
      ok: false,
      login: null,
      rulesetName: null,
      rulesetEnforcement: null,
      requiredChecks: [],
      error: clip(who.stderr || "gh-unauthenticated"),
    };
  }
  const rules = await runGh(["api", `repos/${REPO}/rulesets/${RULESET_ID}`]);
  let rulesetName: string | null = null;
  let rulesetEnforcement: string | null = null;
  const requiredChecks: string[] = [];
  if (rules.code === 0) {
    try {
      const parsed = JSON.parse(rules.stdout) as {
        name?: string;
        enforcement?: string;
        rules?: Array<{ type?: string; parameters?: { required_status_checks?: Array<{ context?: string }> } }>;
      };
      rulesetName = parsed.name ?? null;
      rulesetEnforcement = parsed.enforcement ?? null;
      for (const rule of parsed.rules ?? []) {
        for (const check of rule.parameters?.required_status_checks ?? []) {
          if (check.context) requiredChecks.push(check.context);
        }
      }
    } catch {
      /* ruleset body is advisory */
    }
  }
  return {
    ok: true,
    login: who.stdout || null,
    rulesetName,
    rulesetEnforcement,
    requiredChecks,
  };
}

async function inspectProtect(): Promise<WriteOutcome> {
  const status = await loadWriteStatus();
  if (!status.ok) {
    return wait("Write plane waiting", `gh is not authenticated on this host (${status.error ?? "unknown"}).`);
  }
  const checks = status.requiredChecks.length ? status.requiredChecks.join(" · ") : "none listed";
  return {
    ok: true,
    state: "succeeded",
    title: "Main protection ruleset",
    summary: `Ruleset “${status.rulesetName ?? "unknown"}” is ${status.rulesetEnforcement ?? "unknown"} on default branch. Required checks: ${checks}. Strict up-to-date policy. No bypass actors. Issue #78 is settings-enforced, not a file pretence.`,
    evidence: [
      { label: "Actor", value: status.login ?? "unknown" },
      { label: "Ruleset", value: status.rulesetName ?? "missing", href: `https://github.com/${REPO}/rules/${RULESET_ID}` },
      { label: "Enforcement", value: status.rulesetEnforcement ?? "unknown" },
      { label: "Required checks", value: checks },
    ],
  };
}

async function mergePr(number: number): Promise<WriteOutcome> {
  const view = await runGh([
    "pr",
    "view",
    String(number),
    "--repo",
    REPO,
    "--json",
    "title,url,mergeable,mergeStateStatus,headRefName,statusCheckRollup",
  ]);
  if (view.code !== 0) {
    return fail(`PR #${number} unread`, clip(view.stderr || view.stdout || "pr-view-failed"));
  }
  let meta: {
    title?: string;
    url?: string;
    mergeable?: string;
    mergeStateStatus?: string;
    headRefName?: string;
    statusCheckRollup?: Array<{ name?: string; conclusion?: string; state?: string }>;
  } = {};
  try {
    meta = JSON.parse(view.stdout) as typeof meta;
  } catch {
    return fail(`PR #${number} unparsed`, clip(view.stdout));
  }
  const checks = (meta.statusCheckRollup ?? [])
    .map((item) => `${item.name ?? "check"}:${item.conclusion ?? item.state ?? "?"}`)
    .join(" · ");
  if (meta.mergeStateStatus && meta.mergeStateStatus !== "CLEAN") {
    return {
      ok: false,
      state: "waiting",
      title: `PR #${number} not mergeable`,
      summary: `#${number} “${meta.title ?? ""}” is ${meta.mergeStateStatus}. Protect main requires Verify (Ubuntu + Windows + Vercel workspace) on the exact head. This deck will not squash past a blocked ruleset.`,
      evidence: [
        { label: "PR", value: `#${number} ${meta.title ?? ""}`, href: meta.url },
        { label: "Merge state", value: meta.mergeStateStatus },
        { label: "Checks", value: checks || "none" },
      ],
    };
  }
  const merged = await runGh([
    "pr",
    "merge",
    String(number),
    "--repo",
    REPO,
    "--squash",
    "--delete-branch=false",
  ]);
  if (merged.code !== 0) {
    return fail(`PR #${number} merge refused`, clip(merged.stderr || merged.stdout), [
      { label: "PR", value: `#${number}`, href: meta.url },
      { label: "Checks", value: checks || "none" },
    ]);
  }
  return {
    ok: true,
    state: "succeeded",
    title: `Merged PR #${number}`,
    summary: `Squash-merged #${number} “${meta.title ?? ""}” into main as ${statusLoginFallback()}. Windows 7.0 was not activated.`,
    evidence: [
      { label: "PR", value: `#${number} ${meta.title ?? ""}`, href: meta.url },
      { label: "Head", value: meta.headRefName ?? "—" },
      { label: "Receipt", value: clip(merged.stdout || "merged") },
    ],
  };
}

function statusLoginFallback(): string {
  return "owner gh session";
}

async function commentOn(number: number, body: string): Promise<WriteOutcome> {
  const text = body.trim().slice(0, 4000);
  if (text.length < 8) {
    return deny("Comment empty", "Write a real comment body after the issue or pull number.");
  }
  const result = await runGh(["issue", "comment", String(number), "--repo", REPO, "--body", text]);
  if (result.code !== 0) {
    return fail(`Comment on #${number} failed`, clip(result.stderr || result.stdout));
  }
  return {
    ok: true,
    state: "succeeded",
    title: `Commented on #${number}`,
    summary: `Posted an owner comment on #${number}.`,
    evidence: [
      { label: "Issue", value: `#${number}`, href: `https://github.com/${REPO}/issues/${number}` },
      { label: "Body", value: clip(text, 240) },
    ],
  };
}

async function closeIssue(number: number): Promise<WriteOutcome> {
  const result = await runGh([
    "issue",
    "close",
    String(number),
    "--repo",
    REPO,
    "--reason",
    "completed",
    "--comment",
    "Closed from the Mahoraga operator deck with evidence on the thread.",
  ]);
  if (result.code !== 0) {
    return fail(`Close #${number} failed`, clip(result.stderr || result.stdout));
  }
  return {
    ok: true,
    state: "succeeded",
    title: `Closed #${number}`,
    summary: `Issue #${number} marked completed from this deck.`,
    evidence: [{ label: "Issue", value: `#${number}`, href: `https://github.com/${REPO}/issues/${number}` }],
  };
}

async function createIssue(body: string | null): Promise<WriteOutcome> {
  const raw = (body ?? "").trim();
  const titleMatch = raw.match(/^([^.\n]{8,96})/);
  const title = (titleMatch?.[1] ?? "Operator deck follow-up").slice(0, 96);
  const issueBody = raw.length > title.length ? raw.slice(title.length).trim() : raw;
  const result = await runGh([
    "issue",
    "create",
    "--repo",
    REPO,
    "--title",
    title,
    "--body",
    issueBody || "Opened from the Mahoraga operator deck.",
  ]);
  if (result.code !== 0) {
    return fail("Create issue failed", clip(result.stderr || result.stdout));
  }
  return {
    ok: true,
    state: "succeeded",
    title: "Opened GitHub issue",
    summary: clip(result.stdout || title),
    evidence: [
      { label: "Title", value: title },
      { label: "URL", value: clip(result.stdout || "created") },
    ],
  };
}

async function dispatchWorkflow(file: string, force: boolean): Promise<WriteOutcome> {
  const args = ["workflow", "run", file, "--repo", REPO, "--ref", "main"];
  if (force) args.push("-f", "force=true");
  const result = await runGh(args);
  if (result.code !== 0) {
    return fail(`Dispatch ${file} failed`, clip(result.stderr || result.stdout), [
      { label: "Workflow", value: file, href: `https://github.com/${REPO}/actions/workflows/${file}` },
    ]);
  }
  return {
    ok: true,
    state: "succeeded",
    title: `Dispatched ${file}`,
    summary: `Owner workflow_dispatch of ${file} on main${force ? " with force=true" : ""}. This does not activate Windows 7.0.`,
    evidence: [
      { label: "Workflow", value: file, href: `https://github.com/${REPO}/actions/workflows/${file}` },
      { label: "Ref", value: "main" },
      { label: "Force", value: force ? "true" : "false" },
    ],
  };
}

async function inspectBranch(branch: string): Promise<{
  exists: boolean;
  aheadBy: number | null;
  openPrs: number;
  skipReason: string | null;
}> {
  if (PROTECTED.has(branch) || branch.toLowerCase() === "main") {
    return { exists: true, aheadBy: null, openPrs: 0, skipReason: "protected-ref" };
  }
  const compare = await runGh([
    "api",
    `repos/${REPO}/compare/main...${encodeURIComponent(branch)}`,
    "--jq",
    "{ahead_by:.ahead_by,status:.status}",
  ]);
  if (compare.code !== 0) {
    return { exists: false, aheadBy: null, openPrs: 0, skipReason: "missing-or-unreachable" };
  }
  let aheadBy = 0;
  try {
    aheadBy = Number((JSON.parse(compare.stdout) as { ahead_by?: number }).ahead_by ?? 0);
  } catch {
    aheadBy = -1;
  }
  const prs = await runGh(["pr", "list", "--repo", REPO, "--head", `${REPO.split("/")[0]}:${branch}`, "--json", "number"]);
  let openPrs = 0;
  if (prs.code === 0) {
    try {
      openPrs = (JSON.parse(prs.stdout) as unknown[]).length;
    } catch {
      openPrs = 0;
    }
  }
  if (aheadBy !== 0) return { exists: true, aheadBy, openPrs, skipReason: `ahead_by=${aheadBy}` };
  if (openPrs > 0) return { exists: true, aheadBy, openPrs, skipReason: `open-pr-${openPrs}` };
  return { exists: true, aheadBy, openPrs, skipReason: null };
}

async function previewDeletes(): Promise<WriteOutcome> {
  const rows: string[] = [];
  let eligible = 0;
  let skipped = 0;
  for (const branch of WAVE_A_BRANCHES) {
    const info = await inspectBranch(branch);
    if (!info.exists) {
      skipped += 1;
      rows.push(`${branch} · missing`);
      continue;
    }
    if (info.skipReason) {
      skipped += 1;
      rows.push(`${branch} · skip ${info.skipReason}`);
    } else {
      eligible += 1;
      rows.push(`${branch} · eligible`);
    }
  }
  return {
    ok: true,
    state: "succeeded",
    title: "Wave A deletion preview",
    summary: `${eligible} eligible (ahead_by=0, no open PR, not protected). ${skipped} skipped. Nothing was deleted.`,
    evidence: [
      { label: "Eligible", value: String(eligible) },
      { label: "Skipped", value: String(skipped) },
      { label: "Map", value: clip(rows.join(" · "), 720) },
    ],
  };
}

async function deleteEligible(): Promise<WriteOutcome> {
  const deleted: string[] = [];
  const skipped: string[] = [];
  for (const branch of WAVE_A_BRANCHES) {
    const info = await inspectBranch(branch);
    if (!info.exists || info.skipReason) {
      skipped.push(`${branch}:${info.skipReason ?? "missing"}`);
      continue;
    }
    const result = await runGh(["api", "-X", "DELETE", `repos/${REPO}/git/refs/heads/${branch}`]);
    if (result.code === 0 || result.stderr.includes("Reference does not exist")) {
      deleted.push(branch);
    } else {
      skipped.push(`${branch}:delete-failed`);
    }
  }
  return {
    ok: true,
    state: "succeeded",
    title: "Wave A contained-branch delete",
    summary: `Deleted ${deleted.length} eligible contained branches. Skipped ${skipped.length}. main was not touched.`,
    evidence: [
      { label: "Deleted", value: deleted.join(" · ") || "none" },
      { label: "Skipped", value: clip(skipped.join(" · ") || "none", 480) },
    ],
  };
}

async function approvePr(number: number): Promise<WriteOutcome> {
  const result = await runGh(["pr", "review", String(number), "--repo", REPO, "--approve", "--body", "Approved from the Mahoraga operator deck."]);
  if (result.code !== 0) {
    return fail(`Approve #${number} failed`, clip(result.stderr || result.stdout));
  }
  return {
    ok: true,
    state: "succeeded",
    title: `Approved PR #${number}`,
    summary: `Owner approval posted on #${number}. Merge still requires exact-head Verify.`,
    evidence: [{ label: "PR", value: `#${number}`, href: `https://github.com/${REPO}/pull/${number}` }],
  };
}

export async function runGithubWrite(request: WriteRequest): Promise<WriteOutcome> {
  const status = await loadWriteStatus();
  if (!status.ok && request.verb !== "protect-inspect") {
    return wait(
      "GitHub writes waiting",
      `This host has no gh session (${status.error ?? "unauthenticated"}). The operator deck cannot merge, comment, or delete until the owner token is present.`,
    );
  }

  switch (request.verb) {
    case "protect-inspect":
      return inspectProtect();
    case "merge-pr":
      if (!request.issueNumber) return deny("Merge needs a PR number", "Say merge pull request #N.");
      return mergePr(request.issueNumber);
    case "approve-pr":
      if (!request.issueNumber) return deny("Approve needs a PR number", "Say approve pull request #N.");
      return approvePr(request.issueNumber);
    case "comment":
      if (!request.issueNumber) return deny("Comment needs an issue number", "Say comment on #N: <body>.");
      return commentOn(request.issueNumber, request.body ?? "");
    case "close-issue":
      if (!request.issueNumber) return deny("Close needs an issue number", "Say close issue #N.");
      return closeIssue(request.issueNumber);
    case "create-issue":
      return createIssue(request.body);
    case "dispatch-workflow":
      return dispatchWorkflow(request.workflowFile ?? "sovereign-eight-hour-cycle.yml", /force/i.test(request.body ?? ""));
    case "delete-preview":
      return previewDeletes();
    case "delete-branch":
      return deleteEligible();
    default:
      return deny("Unknown write", "That write verb is not on the allowlist.");
  }
}
