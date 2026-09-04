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
const RAW = `https://raw.githubusercontent.com/${REPO}/main`;
const HEADERS = {
  Accept: "application/vnd.github+json",
  "User-Agent": "Mahoraga-Fleet/1.0",
  "X-GitHub-Api-Version": "2022-11-28",
};
const WEB_HEADERS = {
  "User-Agent": "Mahoraga-Fleet/1.0",
  Accept: "text/html,application/atom+xml,text/plain",
};

type CacheEntry = { at: number; value: GithubSnapshot };
let cache: CacheEntry | null = null;
let lastGood: GithubSnapshot | null = null;
const TTL_MS = 180_000;

type ContractsCache = { at: number; value: RepoContracts };
let contractsCache: ContractsCache | null = null;

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
    visibility: "public",
    issues: [],
    openPulls: [],
    workflows: [],
    cycle: null,
    write: idleWrite(error),
  };
}

async function gh<T>(path: string): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(`${API}${path}`, { headers: HEADERS, signal: ctrl.signal });
    if (!res.ok) {
      throw new Error(`GitHub ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

async function webText(href: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(href, { headers: WEB_HEADERS, signal: ctrl.signal, redirect: "follow" });
    if (!res.ok) throw new Error(`web ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function remember(snapshot: GithubSnapshot): GithubSnapshot {
  cache = { at: Date.now(), value: snapshot };
  if (snapshot.ok) lastGood = snapshot;
  return snapshot;
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

function parseCycleHtml(actionsHtml: string, tagsHtml: string, openPulls: OpenPull[]): CyclePulse {
  const labels = [...actionsHtml.matchAll(/aria-label="([^"]*Run (\d+) of Sovereign[^"]*)"/g)];
  const first = labels[0];
  const successful = labels.find((match) => /successfully/i.test(match[1]));
  const runHref = actionsHtml.match(/\/michaeljwilliams0123\/mahoraga\/actions\/runs\/(\d+)/);
  const lastNumber = first ? Number(first[2]) : runHref ? Number(runHref[1]) : null;
  const lastLabel = first?.[1] ?? "";
  const lastConclusion = /skip/i.test(lastLabel)
    ? "skipped"
    : /success/i.test(lastLabel)
      ? "success"
      : /fail/i.test(lastLabel)
        ? "failure"
        : lastLabel
          ? "unknown"
          : "none";
  const datetimes = [...actionsHtml.matchAll(/datetime="([^"]+)"/g)].map((match) => match[1]);
  const lastUrl = lastNumber ? `${HTML}/actions/runs/${lastNumber}` : CYCLE_URL;
  const lastEvent = /Scheduled/i.test(actionsHtml.slice(0, actionsHtml.indexOf(String(lastNumber ?? "")) + 400))
    ? "schedule"
    : "workflow_run";
  const scheduleNumber = successful ? Number(successful[2]) : null;
  const tagNames = [
    ...new Set([...tagsHtml.matchAll(/sovereign-(?:cycle-anchor|cycle-complete|producer-smoke)-v[0-9]+(?:-\d+)?/g)].map((match) => match[0])),
  ];
  const windows = windowsFromTags(tagNames);
  return {
    workflow: "Sovereign Four Hour Candidate Cycle",
    htmlUrl: CYCLE_URL,
    lastRunNumber: lastNumber,
    lastEvent,
    lastConclusion,
    lastAt: datetimes[0] ?? "",
    lastUrl,
    lastScheduleConclusion: successful ? "success" : "none",
    lastScheduleAt: scheduleNumber ? (datetimes[0] ?? "") : "",
    lastScheduleUrl: scheduleNumber ? `${HTML}/actions/runs/${scheduleNumber}` : CYCLE_URL,
    lastSuccessNumber: scheduleNumber,
    lastSuccessEvent: scheduleNumber ? "schedule" : "",
    lastSuccessConclusion: successful ? "success" : "",
    lastSuccessAt: scheduleNumber ? (datetimes[0] ?? "") : "",
    lastSuccessUrl: scheduleNumber ? `${HTML}/actions/runs/${scheduleNumber}` : CYCLE_URL,
    skippedStreak: lastConclusion === "skipped" ? 1 : 0,
    smokeComplete: tagNames.includes("sovereign-producer-smoke-v1"),
    candidatePr: pickCandidate(openPulls),
    integrationPr: pickIntegration(openPulls),
    ...windows,
  };
}

async function loadCyclePulse(openPulls: OpenPull[]): Promise<CyclePulse | null> {
  try {
    const [runs, tags] = await Promise.all([
      gh<{
        workflow_runs: Array<{
          run_number: number;
          event: string;
          conclusion: string | null;
          created_at: string;
          html_url: string;
          status: string;
        }>;
      }>(`/actions/workflows/${CYCLE_WORKFLOW}/runs?per_page=20`),
      gh<Array<{ name: string }>>("/tags?per_page=40"),
    ]);
    return pulseFromApiRuns(runs.workflow_runs ?? [], tags.map((tag) => tag.name), openPulls);
  } catch {
    try {
      const [actionsHtml, tagsHtml] = await Promise.all([
        webText(`${HTML}/actions/workflows/${CYCLE_WORKFLOW}`),
        webText(`${HTML}/tags`),
      ]);
      return parseCycleHtml(actionsHtml, tagsHtml, openPulls);
    } catch {
      return null;
    }
  }
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
    visibility: repo.private ? "private" : (repo.visibility ?? "public"),
    issues: issueRows,
    openPulls,
    workflows: [],
    cycle,
    write: idleWrite(),
  };
}

async function loadFromPublicWeb(): Promise<GithubSnapshot> {
  const [issuesHtml, pullsHtml, atom] = await Promise.all([
    webText(`${HTML}/issues?q=is%3Aissue+is%3Aopen`),
    webText(`${HTML}/pulls`),
    webText(`${HTML}/commits/main.atom`),
  ]);

  const issuePattern =
    /href="\/michaeljwilliams0123\/mahoraga\/issues\/(\d+)"[^>]*data-testid="issue-pr-title-link"[\s\S]{0,500}?data-component="Text">([^<]+)/g;
  const issues: GithubIssueLite[] = [];
  const seen = new Set<number>();
  for (const match of issuesHtml.matchAll(issuePattern)) {
    const number = Number(match[1]);
    const title = match[2].replace(/\s+/g, " ").trim();
    if (!number || seen.has(number) || !title) continue;
    seen.add(number);
    issues.push({
      number,
      title,
      state: "open",
      labels: [],
      htmlUrl: `https://github.com/${REPO}/issues/${number}`,
      updatedAt: "",
      assignedAgent: assignIssueOwner(title, []),
    });
  }

  const pullNumbers = new Set(
    [...pullsHtml.matchAll(/href="\/michaeljwilliams0123\/mahoraga\/pull\/(\d+)"/g)].map((m) => Number(m[1])),
  );
  const shaMatch = atom.match(/Grit::Commit\/([0-9a-f]{40})/i);
  const titleMatch = atom.match(/<entry>[\s\S]*?<title>\s*([\s\S]*?)\s*<\/title>/i);
  const updatedMatch = atom.match(/<entry>[\s\S]*?<updated>([^<]+)<\/updated>/i);
  const cycle = await loadCyclePulse([]);

  return {
    fetchedAt: new Date().toISOString(),
    ok: true,
    fullName: REPO,
    description: "autonomous local control plane",
    defaultBranch: "main",
    pushedAt: updatedMatch?.[1] ?? "",
    openIssues: issues.length,
    openPrs: pullNumbers.size,
    headSha: shaMatch?.[1] ?? "",
    headMessage: (titleMatch?.[1] ?? "").replace(/\s+/g, " ").trim(),
    visibility: "public",
    issues,
    openPulls: [],
    workflows: [],
    cycle,
    write: idleWrite(),
  };
}

export async function loadGithubSnapshot(force = false): Promise<GithubSnapshot> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.value;
  try {
    return remember(await attachWrite(await loadFromApi()));
  } catch {
    try {
      return remember(await attachWrite(await loadFromPublicWeb()));
    } catch (error) {
      if (lastGood) return lastGood;
      const message = error instanceof Error ? error.message : "github-unreachable";
      return emptySnapshot(message);
    }
  }
}

async function attachWrite(snapshot: GithubSnapshot): Promise<GithubSnapshot> {
  try {
    return { ...snapshot, write: await loadWriteStatus() };
  } catch (error) {
    return {
      ...snapshot,
      write: idleWrite(error instanceof Error ? error.message : "write-unreachable"),
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

async function loadIssueFromPublicWeb(number: number): Promise<GithubIssueDetail> {
  const html = await webText(`${HTML}/issues/${number}`);
  const h1 = html.match(/<h1[^>]*>([\s\S]{0,500})<\/h1>/i)?.[1] ?? "";
  const title = h1
    .replace(/<[^>]+>/g, " ")
    .replace(/#\d+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 720);
  if (!title) throw new Error("issue-html-unparsed");
  return {
    ok: true,
    number,
    title,
    state: "open",
    labels: [],
    htmlUrl: `https://github.com/${REPO}/issues/${number}`,
    updatedAt: "",
    assignedAgent: assignIssueOwner(title, []),
    bodyExcerpt: body,
  };
}

export async function loadGithubIssue(number: number): Promise<GithubIssueDetail> {
  try {
    return await loadIssueFromApi(number);
  } catch {
    try {
      return await loadIssueFromPublicWeb(number);
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "issue-unreachable",
        number,
        title: `Issue #${number}`,
        state: "unknown",
        labels: [],
        htmlUrl: `https://github.com/${REPO}/issues/${number}`,
        updatedAt: "",
        assignedAgent: "admin",
        bodyExcerpt: "",
      };
    }
  }
}

export async function loadWorkflowRun(file: string): Promise<WorkflowRunLite> {
  const href = `${HTML}/actions/workflows/${file}`;
  try {
    const html = await webText(href);
    const label = html.match(/aria-label="([^"]*Run (\d+) of [^"]*)"/);
    const runId = html.match(/\/michaeljwilliams0123\/mahoraga\/actions\/runs\/(\d+)/);
    const when = html.match(/datetime="([^"]+)"/);
    const text = label?.[1] ?? "";
    const conclusion = /skip/i.test(text)
      ? "skipped"
      : /success/i.test(text)
        ? "success"
        : /fail/i.test(text)
          ? "failure"
          : text
            ? "unknown"
            : "none";
    const number = label ? Number(label[2]) : runId ? Number(runId[1]) : null;
    return {
      ok: Boolean(number),
      error: number ? undefined : "no-runs",
      name: file,
      file,
      number,
      event: /Scheduled/i.test(html) ? "schedule" : "github",
      conclusion,
      status: "completed",
      createdAt: when?.[1] ?? "",
      htmlUrl: number ? `${HTML}/actions/runs/${number}` : href,
      headSha: "",
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "workflow-unreachable",
      name: file,
      file,
      number: null,
      event: "",
      conclusion: "unknown",
      status: "unknown",
      createdAt: "",
      htmlUrl: href,
      headSha: "",
    };
  }
}

async function rawText(path: string): Promise<string> {
  return webText(`${RAW}/${path}`);
}

export async function loadRepoContracts(force = false): Promise<RepoContracts> {
  if (!force && contractsCache && Date.now() - contractsCache.at < TTL_MS) return contractsCache.value;
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
    contractsCache = { at: Date.now(), value };
    return value;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "contracts-unreachable",
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
