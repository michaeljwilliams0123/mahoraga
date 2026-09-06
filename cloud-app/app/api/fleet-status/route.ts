import { NextResponse } from "next/server";

const OWNER = "michaeljwilliams0123";
const REPO = "mahoraga";
const BASE = `https://api.github.com/repos/${OWNER}/${REPO}`;
const PRODUCTION_BASELINE = "3.6.0";
const CANDIDATE = "7.0.0-alpha.2";
const ROLLBACK_SHA = "397acebf16766f44e3b4317f9d8b68b10de5f821";

type Pull = { number: number; title: string; html_url: string; head: { ref: string }; draft: boolean };
type WorkflowRun = { name: string; conclusion: string | null; status: string; html_url: string; head_branch: string; created_at: string };

export async function GET() {
  try {
    const [repoRes, pullsRes, runsRes] = await Promise.all([
      fetch(BASE, { headers: { Accept: "application/vnd.github+json", "User-Agent": "mahoraga-workspace" }, cache: "no-store" }),
      fetch(`${BASE}/pulls?state=open&per_page=8`, { headers: { Accept: "application/vnd.github+json", "User-Agent": "mahoraga-workspace" }, cache: "no-store" }),
      fetch(`${BASE}/actions/runs?per_page=8`, { headers: { Accept: "application/vnd.github+json", "User-Agent": "mahoraga-workspace" }, cache: "no-store" }),
    ]);
    if (!repoRes.ok) throw new Error("repo-status-unavailable");
    const repo = (await repoRes.json()) as { default_branch: string; pushed_at: string };
    const pulls = pullsRes.ok ? ((await pullsRes.json()) as Pull[]) : [];
    const runsPayload = runsRes.ok ? ((await runsRes.json()) as { workflow_runs?: WorkflowRun[] }) : { workflow_runs: [] };
    const runs = runsPayload.workflow_runs ?? [];
    const cycleRun = runs.find((run) => /sovereign|four hour|candidate cycle/i.test(run.name)) ?? runs[0] ?? null;
    const cycleOnMain = cycleRun?.head_branch === repo.default_branch;
    return NextResponse.json({
      ok: true,
      authority: "paired-mahoraga-core",
      writePlane: "denied-on-workspace",
      surfaces: {
        workspace: CANDIDATE,
        windowsProduction: PRODUCTION_BASELINE,
        rollbackSha: ROLLBACK_SHA.slice(0, 12),
      },
      repo: {
        defaultBranch: repo.default_branch,
        pushedAt: repo.pushed_at,
        url: `https://github.com/${OWNER}/${REPO}`,
      },
      cycle: cycleRun
        ? {
            name: cycleRun.name,
            status: cycleRun.status,
            conclusion: cycleRun.conclusion,
            branch: cycleRun.head_branch,
            url: cycleRun.html_url,
            createdAt: cycleRun.created_at,
            landedOnMain: cycleOnMain && cycleRun.conclusion === "success",
            adaptabilityGap: cycleRun.conclusion === "success" && !cycleOnMain,
          }
        : null,
      openPulls: pulls.map((pull) => ({
        number: pull.number,
        title: pull.title,
        url: pull.html_url,
        branch: pull.head.ref,
        draft: pull.draft,
      })),
    });
  } catch {
    return NextResponse.json({ ok: false, error: "fleet-status-unavailable", writePlane: "denied-on-workspace" }, { status: 200 });
  }
}
