/**
 * Read-only consolidation of remote-ref, branch-ancestry, PR-history and live-source
 * reference evidence. No deletion, push, commit or source modification is possible.
 * Runs against the currently fetched origin/main and independently checks ls-remote.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
// @ts-ignore Existing JS migration-debt module is the canonical ledger.
import { classifyCleanupBranch } from "../src/branch-cleanup-ledger.mjs";

const GIT = "git";
const GH = process.platform === "win32" ? "gh.exe" : "gh";
const PR_LIMIT = 2000;
type Pull = { headRefName: string; state: string; number: number };
type GitHubBranch = { name: string; protected: boolean; commit: { sha: string } };
type Row = {
  name: string; headSha: string; aheadBy: number; behindBy: number;
  netChangedPathCount: number; openPrCount: number; prHistoryComplete: boolean;
  refVerified: boolean; activeRefCount: number; activeRefPaths: string[];
  prNumbers: number[]; disposition: string; reason: string;
};

function command(bin: string, args: string[]): string {
  return execFileSync(bin, args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
    timeout: 60000, windowsHide: true }).trim();
}
const lines = (value: string): string[] => value ? value.split(/\r?\n/).filter(Boolean) : [];
function parseHeadRefs(raw: string): Map<string,string> {
  const refs = new Map<string,string>();
  for (const line of lines(raw)) {
    const [sha, ref] = line.split(/\s+/);
    if (!sha || !/^[a-f0-9]{40}$/.test(sha) || !ref?.startsWith("refs/heads/")) {
      throw new Error("branch-ref-proof-malformed");
    }
    const name = ref.slice("refs/heads/".length);
    if (refs.has(name)) throw new Error("branch-ref-proof-duplicate");
    refs.set(name, sha);
  }
  return refs;
}
function collectActiveSourceReferences(branchNames: string[]): Map<string,string[]> {
  const found = new Map<string,string[]>();
  for (const name of branchNames) found.set(name, []);
  const activeDirs = /^(?:\.github\/workflows\/|config\/|src\/|scripts\/|deploy\/|cloud-app\/|operator-deck\/|relay\/)/;
  const eligible = /\.(?:ts|tsx|mjs|js|cjs|json|jsonc|ya?ml|ps1)$/;
  const tracked = lines(command(GIT, ["ls-files", "-z"]).replaceAll("\0", "\n"));
  for (const path of tracked) {
    if (!activeDirs.test(path) || !eligible.test(path) || /(?:^|\/)(?:node_modules|state\/release-baseline)(?:\/|$)/.test(path)) continue;
    if (/package-lock\.json$/.test(path)) continue;
    let body = "";
    try {
      const full = join(process.cwd(), ...path.split("/"));
      if (statSync(full).size > 2 * 1024 * 1024) continue;
      body = readFileSync(full, "utf8");
    } catch { throw new Error("branch-active-source-unreadable"); }
    for (const name of branchNames) {
      if (body.includes(name)) found.get(name)?.push(path);
    }
  }
  return found;
}
function main(): void {
  const root = command(GIT, ["rev-parse", "--show-toplevel"]);
  if (root.toLowerCase().replaceAll("\\", "/") !== process.cwd().toLowerCase().replaceAll("\\", "/")) {
    throw new Error("branch-audit-run-from-repository-root");
  }
  const sha = command(GIT, ["rev-parse", "refs/remotes/origin/main"]);
  const remote = parseHeadRefs(command(GIT, ["ls-remote", "--heads", "origin"]));
  if (remote.get("main") !== sha) throw new Error("branch-audit-main-sha-stale");
  const localRaw = command(GIT, ["for-each-ref", "--format=%(refname:short)%09%(objectname)", "refs/remotes/origin"]);
  const refs = lines(localRaw).map(line => line.split("\t"))
    .filter(([name, ref]) => name?.startsWith("origin/") && ref && name !== "origin/HEAD")
    .map(([name, ref]) => ({ name: name!.slice(7), headSha: ref! })).filter(r => r.name !== "main");
  if (refs.length !== remote.size - 1 || refs.some(x => !remote.has(x.name))) {
    throw new Error("branch-audit-remote-ref-set-stale");
  }
  const repo = command(GH, ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]);
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo)) throw new Error("branch-audit-repo-identity-invalid");
  const pages = JSON.parse(command(GH, ["api", "--paginate", "--slurp",
    `repos/${repo}/branches?per_page=100`])) as GitHubBranch[][];
  if (!Array.isArray(pages) || !pages.every(Array.isArray)) throw new Error("branch-audit-protection-read-unavailable");
  const githubBranches = pages.flat();
  const protectedRefs = new Map<string,GitHubBranch>();
  for (const branch of githubBranches) {
    if (!branch || typeof branch.name !== "string" || typeof branch.protected !== "boolean"
      || !/^[a-f0-9]{40}$/.test(branch.commit?.sha ?? "") || protectedRefs.has(branch.name)) {
      throw new Error("branch-audit-protection-read-invalid");
    }
    protectedRefs.set(branch.name, branch);
  }
  if (protectedRefs.size !== remote.size) throw new Error("branch-audit-protection-incomplete");
  const prs = JSON.parse(command(GH, ["pr", "list", "--state", "all", "--limit", String(PR_LIMIT),
    "--json", "headRefName,state,number"])) as Pull[];
  if (!Array.isArray(prs)) throw new Error("branch-audit-pr-history-invalid");
  const prHistoryComplete = prs.length < PR_LIMIT;
  const byName = new Map<string,Pull[]>();
  for (const pr of prs) {
    if (!pr || typeof pr.headRefName !== "string" || typeof pr.state !== "string" || !Number.isInteger(pr.number)) {
      throw new Error("branch-audit-pr-history-invalid");
    }
    const list = byName.get(pr.headRefName) ?? []; list.push(pr); byName.set(pr.headRefName,list);
  }
  const refUses = collectActiveSourceReferences(refs.map(x => x.name));
  const rows: Row[] = [];
  for (const b of refs) {
    const [behindStr,aheadStr] = command(GIT, ["rev-list","--left-right","--count", "origin/main...origin/" + b.name]).split(/\s+/);
    const aheadBy = Number(aheadStr), behindBy = Number(behindStr);
    if (!Number.isSafeInteger(aheadBy) || !Number.isSafeInteger(behindBy)) throw new Error("branch-audit-ancestry-invalid");
    const pathCount = aheadBy === 0 ? 0 : lines(command(GIT, ["diff", "--name-only", "origin/main...origin/" + b.name])).length;
    const paths = refUses.get(b.name) ?? [];
    const pp = byName.get(b.name) ?? [];
    const liveBranch = protectedRefs.get(b.name);
    if (!liveBranch) throw new Error("branch-audit-protection-incomplete");
    const refVerified = remote.get(b.name) === b.headSha && liveBranch.commit.sha === b.headSha;
    const record = classifyCleanupBranch({
      name: b.name, aheadBy, openPrCount: pp.filter(pr => pr.state === "OPEN").length,
      isProtected: liveBranch.protected, netChangedPathCount: pathCount,
      refVerified, prHistoryComplete,
      activeRefCount: paths.length,
    }) as {disposition: string; reason: string};
    rows.push({
      name:b.name, headSha:b.headSha, aheadBy, behindBy,
      netChangedPathCount:pathCount, openPrCount:pp.filter(pr=>pr.state==="OPEN").length,
      prHistoryComplete, refVerified,
      activeRefCount:paths.length, activeRefPaths: paths,
      prNumbers: pp.map(pr=>pr.number),
      disposition:record.disposition, reason:record.reason,
    });
  }
  const counts = rows.reduce<Record<string,number>>((acc,row) => {
    acc[row.disposition]=(acc[row.disposition]??0)+1;return acc;
  },{});
  console.log(JSON.stringify({
    schemaVersion:1, kind:"branch-retention-ref-proof", readOnly:true, spentCredits:0,
    mainSha:sha, branchCount: rows.length, prHistoryCount:prs.length,
    prHistoryComplete, counts, rows,
    note:"Reference/ancestry classification is advisory. Revalidate each exact remote SHA, PR state and archive evidence before any destructive action.",
  }, null, 2));
}
main();
