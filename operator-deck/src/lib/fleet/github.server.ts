import { assignIssueOwner } from "./classifier";
import type {
  CyclePulse,
  GithubIssueDetail,
  GithubIssueLite,
  GithubSnapshot,
  OpenPull,
  RepoContracts,
  WorkflowRunLite,
  WriteStatus,
} from "./types";
import { loadWriteStatus } from "./write.server";

const REPO = "michaeljwilliams0123/mahoraga";
const API = `https://api.github.com/repos/${REPO}`;
const HTML = `https://github.com/${REPO}`;
const HEADERS = {
  Accept: "application/vnd.github+json",
  "User-Agent": "Mahoraga-Fleet/1.0",
  "X-GitHub-Api-Version": "2022-11-28",
};
const READ_UNAVAILABLE = "authenticated-read-unavailable";

const FOUR_HOURS_SEC = 4 * 60 * 60;
const CYCLE_WORKFLOW = "sovereign-eight-hour-cycle.yml";
const CYCLE_URL = `${HTML}/actions/workflows/${CYCLE_WORKFLOW}`;

function idleWrite(error?: string): WriteStatus {
  return {
    ok: false,
    login: null,
    rulesetName: null,
    rulesetEnforcement: null,
    requiredChecks: [],
    error,
  };
}

function emptySnapshot(error: string): GithubSnapshot {
  return {
    fetchedAt: new Date().toISOString(),
    ok: false,
    error,
    fullName: REPO,
    description: "",
    defaultBranch: "main",
    pushedAt: "",
    openIssues: 0,
    openPrs: 0,
    headSha: "",
    headMessage: "",
    visibility: "unknown",
    issues: [],
    openPulls: [],
    workflows: [],
    cycle: null,
    write: idleWrite(error),
  };
}

function readToken(): string {
  const token = process.env.MAHORAGA_GITHUB_READ_TOKEN?.trim()
    || process.env.GH_TOKEN?.trim()
    || process.env.GITHUB_TOKEN?.trim();
  if (!token || token.length > 4096 || /[\r\n]/.test(token)) throw new Error(READ_UNAVAILABLE);
  return token;
}

async function gh<T>(path: string): Promise<T> {
  const token = readToken();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(`${API}${path}`, {
      headers: { ...HEADERS, Authorization: `Bearer ${token}` },
      signal: ctrl.signal, redirect: "error", cache: "no-store",
    });
    if (!res.ok) throw new Error(READ_UNAVAILABLE);
    return (await res.json()) as T;
  } catch {
    throw new Error(READ_UNAVAILABLE);
  } finally {
    clearTimeout(timer);
  }
}

function asPulls(items: Array<{ number: number; title?: string; html_url?: string; user?: { login?: string } }>): OpenPull[] {
  return items.map((item) => ({
    number: item.number,
    title: item.title ?? `Pull #${item.number}`,
    htmlUrl: item.html_url ?? `${HTML}/pull/${item.number}`,
    author: item.user?.login ?? "unknown",
  }));
}

function windowFromEpoch(epoch: number): string {
  return new Date(epoch * 1000).toISOString();
}

function deriveCycleWindows(anchorEpoch: number | null, completeEpochs: number[], nowSec: number) {
  if (!anchorEpoch) {
    return { anchorUtc: null, completeUtc: null, nextWindowUtc: null, currentWindowComplete: false };
  }
  const completeUtc = completeEpochs.length ? windowFromEpoch(Math.max(...completeEpochs)) : null;
  if (nowSec < anchorEpoch) {
    return {
      anchorUtc: windowFromEpoch(anchorEpoch),
      completeUtc,
      nextWindowUtc: windowFromEpoch(anchorEpoch),
      currentWindowComplete: false,
    };
  }
  const idx = Math.floor((nowSec - anchorEpoch) / FOUR_HOURS_SEC);
  const current = anchorEpoch + idx * FOUR_HOURS_SEC;
  const currentWindowComplete = completeEpochs.includes(current);
  return {
    anchorUtc: windowFromEpoch(anchorEpoch),
    completeUtc,
    nextWindowUtc: windowFromEpoch(currentWindowComplete ? current + FOUR_HOURS_SEC : current),
    currentWindowComplete,
  };
}

function pickCandidate(openPulls: OpenPull[]): OpenPull | null {
  return (
    openPulls.find((pull) => pull.number === 97) ??
    openPulls.find((pull) => pull.number === 99) ??
    openPulls.find((pull) => /sovereign|scan report|candidate/i.test(pull.title) && pull.author.includes("github-actions")) ??
    null
  );
}

function pickIntegration(openPulls: OpenPull[]): OpenPull | null {
  return (
    openPulls.find((pull) => pull.number === 98) ??
    openPulls.find((pull) => /integration dispatch gap/i.test(pull.title)) ??
    null
  );
}

function windowsFromTags(tagNames: string[]) {
  const anchor = tagNames.find((name) => name.startsWith("sovereign-cycle-anchor-v2-"));
  const completeEpochs = tagNames
    .filter((name) => name.startsWith("sovereign-cycle-complete-v2-"))
    .map((name) => Number(name.slice("sovereign-cycle-complete-v2-".length)))
    .filter((value) => Number.isFinite(value));
  const anchorEpoch = anchor ? Number(anchor.slice("sovereign-cycle-anchor-v2-".length)) : null;
  return deriveCycleWindows(
    Number.isFinite(anchorEpoch) ? (anchorEpoch as number) : null,
    completeEpochs,
    Math.floor(Date.now() / 1000),
  );
}

function pulseFromApiRuns(
  list: Array<{
    run_number: number;
    event: string;
    conclusion: string | null;
    created_at: string;
    html_url: string;
    status: string;
  }>,
  tagNames: string[],
  openPulls: OpenPull[],
): CyclePulse {
  const last = list[0];
  const lastSchedule = list.find((run) => run.event === "schedule");
  const lastSuccess = list.find((run) => run.conclusion === "success");
  let skippedStreak = 0;
  for (const run of list) {
    if (run.conclusion === "skipped") skippedStreak += 1;
    else break;
  }
  const windows = windowsFromTags(tagNames);
  return {
    workflow: "Sovereign Four Hour Candidate Cycle",
    htmlUrl: CYCLE_URL,
    lastRunNumber: last?.run_number ?? null,
    lastEvent: last?.event ?? "",
    lastConclusion: last?.conclusion ?? last?.status ?? "unknown",
    lastAt: last?.created_at ?? "",
    lastUrl: last?.html_url ?? CYCLE_URL,
    lastScheduleConclusion: lastSchedule?.conclusion ?? lastSchedule?.status ?? "none",
    lastScheduleAt: lastSchedule?.created_at ?? "",
    lastScheduleUrl: lastSchedule?.html_url ?? CYCLE_URL,
    lastSuccessNumber: lastSuccess?.run_number ?? null,
    lastSuccessEvent: lastSuccess?.event ?? "",
    lastSuccessConclusion: lastSuccess?.conclusion ?? "",
    lastSuccessAt: lastSuccess?.created_at ?? "",
    lastSuccessUrl: lastSuccess?.html_url ?? CYCLE_URL,
    skippedStreak,
    smokeComplete: tagNames.includes("sovereign-producer-smoke-v1"),
    candidatePr: pickCandidate(openPulls),
    integrationPr: pickIntegration(openPulls),
    ...windows,
  };
}

async function loadCyclePulse(openPulls: OpenPull[]): Promise<CyclePulse> {
  const [runs, tags] = await Promise.all([
    gh<{ workflow_runs: Array<{ run_number: number; event: string; conclusion: string | null; created_at: string; html_url: string; status: string }> }>(`/actions/workflows/${CYCLE_WORKFLOW}/runs?per_page=20`),
    gh<Array<{ name: string }>>("/tags?per_page=40"),
  ]);
  return pulseFromApiRuns(runs.workflow_runs ?? [], tags.map((tag) => tag.name), openPulls);
}

async function loadFromApi(): Promise<GithubSnapshot> {
  const [repo, issues, pulls, commits] = await Promise.all([
    gh<{
      full_name: string;
      description: string | null;
      default_branch: string;
      pushed_at: string;
      visibility?: string;
      private?: boolean;
    }>(""),
    gh<
      Array<{
        number: number;
        title: string;
        state: string;
        html_url: string;
        updated_at: string;
        pull_request?: unknown;
        labels: Array<{ name: string }>;
      }>
    >("/issues?state=open&per_page=20"),
    gh<
      Array<{
        number: number;
        title: string;
        html_url: string;
        user?: { login?: string };
      }>
    >("/pulls?state=open&per_page=20"),
    gh<Array<{ sha: string; commit: { message: string } }>>("/commits?per_page=1"),
  ]);

  const issueRows: GithubIssueLite[] = issues
    .filter((item) => !item.pull_request)
    .map((item) => {
      const labels = item.labels.map((label) => label.name);
      return {
        number: item.number,
        title: item.title,
        state: item.state,
        labels,
        htmlUrl: item.html_url,
        updatedAt: item.updated_at,
        assignedAgent: assignIssueOwner(item.title, labels),
      };
    });

  const openPulls = asPulls(pulls);
  const cycle = await loadCyclePulse(openPulls);

  return {
    fetchedAt: new Date().toISOString(),
    ok: true,
    fullName: repo.full_name,
    description: repo.description ?? "",
    defaultBranch: repo.default_branch,
    pushedAt: repo.pushed_at,
    openIssues: issueRows.length,
    openPrs: pulls.length,
    headSha: commits[0]?.sha ?? "",
    headMessage: (commits[0]?.commit.message ?? "").split("\n")[0] ?? "",
    visibility: repo.private === true ? "private" : repo.private === false ? "public" : (repo.visibility ?? "unknown"),
    issues: issueRows,
    openPulls,
    workflows: [],
    cycle,
    write: idleWrite(),
  };
}

export async function loadGithubSnapshot(_force = false): Promise<GithubSnapshot> {
  try {
    return await attachWrite(await loadFromApi());
  } catch {
    return emptySnapshot(READ_UNAVAILABLE);
  }
}

async function attachWrite(snapshot: GithubSnapshot): Promise<GithubSnapshot> {
  try {
    const write = await loadWriteStatus();
    return { ...snapshot, write: write.ok ? write : idleWrite("write-unavailable") };
  } catch (error) {
    return {
      ...snapshot,
      write: idleWrite("write-unavailable"),
    };
  }
}

async function loadIssueFromApi(number: number): Promise<GithubIssueDetail> {
  const item = await gh<{
    number: number;
    title: string;
    state: string;
    html_url: string;
    updated_at: string;
    body: string | null;
    labels: Array<{ name: string }>;
  }>(`/issues/${number}`);
  const labels = item.labels.map((label) => label.name);
  return {
    ok: true,
    number: item.number,
    title: item.title,
    state: item.state,
    labels,
    htmlUrl: item.html_url,
    updatedAt: item.updated_at,
    assignedAgent: assignIssueOwner(item.title, labels),
    bodyExcerpt: (item.body ?? "").replace(/\s+/g, " ").trim().slice(0, 720),
  };
}

export async function loadGithubIssue(number: number): Promise<GithubIssueDetail> {
  try {
    if (!Number.isSafeInteger(number) || number < 1) throw new Error(READ_UNAVAILABLE);
    return await loadIssueFromApi(number);
  } catch {
    return {
      ok: false, error: READ_UNAVAILABLE, number, title: `Issue #${number}`,
      state: "unknown", labels: [], htmlUrl: `${HTML}/issues/${number}`,
      updatedAt: "", assignedAgent: "admin", bodyExcerpt: "",
    };
  }
}

export async function loadWorkflowRun(file: string): Promise<WorkflowRunLite> {
  const href = `${HTML}/actions/workflows/${encodeURIComponent(file)}`;
  try {
    if (!/^[A-Za-z0-9._-]+\.ya?ml$/.test(file)) throw new Error(READ_UNAVAILABLE);
    const result = await gh<{ workflow_runs: Array<{
      name?: string; run_number: number; event: string; conclusion: string | null;
      status: string; created_at: string; html_url: string; head_sha: string;
    }> }>(`/actions/workflows/${encodeURIComponent(file)}/runs?per_page=1`);
    const run = result.workflow_runs[0];
    if (!run) return { ok: false, error: "no-runs", name: file, file, number: null, event: "", conclusion: "unknown", status: "unknown", createdAt: "", htmlUrl: href, headSha: "" };
    return {
      ok: true, name: run.name ?? file, file, number: run.run_number,
      event: run.event, conclusion: run.conclusion ?? run.status, status: run.status,
      createdAt: run.created_at, htmlUrl: run.html_url, headSha: run.head_sha,
    };
  } catch {
    return { ok: false, error: READ_UNAVAILABLE, name: file, file, number: null, event: "", conclusion: "unknown", status: "unknown", createdAt: "", htmlUrl: href, headSha: "" };
  }
}

async function rawText(path: string): Promise<string> {
  const result = await gh<{ encoding: string; content: string }>(`/contents/${path}?ref=main`);
  if (result.encoding !== "base64" || typeof result.content !== "string") throw new Error(READ_UNAVAILABLE);
  return Buffer.from(result.content, "base64").toString("utf8");
}

export async function loadRepoContracts(_force = false): Promise<RepoContracts> {
  try {
    const [agentsMd, readme, pkgRaw, manifestRaw] = await Promise.all([
      rawText("AGENTS.md"),
      rawText("README.md"),
      rawText("package.json"),
      rawText("mahoraga.manifest.json"),
    ]);
    let packageVersion = "";
    try {
      packageVersion = String((JSON.parse(pkgRaw) as { version?: string }).version ?? "");
    } catch {
      packageVersion = "";
    }
    const workerNames: string[] = [];
    try {
      const manifest = JSON.parse(manifestRaw) as {
        workers?: Record<string, unknown> | Array<{ id?: string; name?: string }>;
      };
      if (Array.isArray(manifest.workers)) {
        for (const worker of manifest.workers) {
          const name = worker.id ?? worker.name;
          if (name) workerNames.push(String(name));
        }
      } else if (manifest.workers && typeof manifest.workers === "object") {
        workerNames.push(...Object.keys(manifest.workers));
      }
    } catch {
      /* manifest shape is advisory */
    }
    const value: RepoContracts = {
      ok: true,
      agentContract: agentsMd.replace(/\s+/g, " ").trim().slice(0, 900),
      readmeExcerpt: readme.replace(/\s+/g, " ").trim().slice(0, 720),
      packageVersion,
      workerNames: workerNames.slice(0, 12),
    };
    return value;
  } catch (error) {
    return {
      ok: false,
      error: READ_UNAVAILABLE,
      agentContract: "",
      readmeExcerpt: "",
      packageVersion: "",
      workerNames: [],
    };
  }
}

export async function fetchAllowlistedPage(href: string): Promise<{
  ok: boolean;
  status: number;
  finalUrl: string;
  title: string;
  excerpt: string;
  bytes: number;
  error?: string;
}> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(href, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": "Mahoraga-Fleet/1.0", Accept: "text/html,application/json,text/plain" },
      signal: ctrl.signal,
    });
    const finalUrl = res.url || href;
    const buf = new Uint8Array(await res.arrayBuffer());
    const limited = buf.slice(0, 180_000);
    const text = new TextDecoder("utf-8", { fatal: false }).decode(limited);
    const titleMatch = text.match(/<title[^>]*>([^<]{1,180})<\/title>/i);
    const stripped = text
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return {
      ok: res.ok,
      status: res.status,
      finalUrl,
      title: (titleMatch?.[1] ?? "").trim() || new URL(finalUrl).pathname,
      excerpt: stripped.slice(0, 720),
      bytes: limited.byteLength,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      finalUrl: href,
      title: "",
      excerpt: "",
      bytes: 0,
      error: error instanceof Error ? error.message : "fetch-failed",
    };
  } finally {
    clearTimeout(timer);
  }
}
