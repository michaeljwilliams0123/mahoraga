/** Read-only GitHub PR preflight used by the existing required Verify workflow. */
import { evaluatePrIntake } from "../src/pr-intake-policy.mjs";

const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
const number = Number(process.env.PR_NUMBER);
if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repo ?? "") || !Number.isSafeInteger(number) || number < 1)
  throw new Error("pr-intake-credentials-or-scope-missing");
const headers = {
  accept: "application/vnd.github+json", authorization: `Bearer ${token}`,
  "x-github-api-version": "2022-11-28", "user-agent": "mahoraga-pr-intake",
};
async function read(path) {
  const response = await fetch(`https://api.github.com/repos/${repo}/${path}`, {
    headers, signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`pr-intake-github-read-failed:${response.status}`);
  return response.json();
}
const prs = [];
for (let page = 1; page <= 10; page++) {
  const batch = await read(`pulls?state=open&per_page=100&page=${page}`);
  if (!Array.isArray(batch)) throw new Error("pr-intake-list-invalid");
  prs.push(...batch);
  if (batch.length < 100) break;
  if (page === 10) throw new Error("pr-intake-pagination-incomplete");
}
const candidate = prs.find(pr => pr.number === number) ?? await read(`pulls/${number}`);
if (candidate.state !== "open") throw new Error("pr-intake-candidate-not-open");
const decision = evaluatePrIntake({ candidate, openPulls: prs });
console.log(JSON.stringify({ ...decision, pullRequest: number }));
if (!decision.allowed) process.exitCode = 1;
