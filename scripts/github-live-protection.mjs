import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";
import { evaluateLiveMainProtection, parseMainProtectionContract } from "../src/github-live-protection.mjs";

const REPO = "michaeljwilliams0123/mahoraga";
const RULESETS_URL = `https://api.github.com/repos/${REPO}/rulesets`;

const contract = parseMainProtectionContract(await readFile(path.join(ROOT, "config", "main-protection.contract.json"), "utf8"));
const rulesets = await fetchLiveRulesets();
const detailed = await Promise.all(rulesets.map((ruleset) => fetchRulesetDetail(ruleset.id)));
const report = evaluateLiveMainProtection({ rulesets: detailed, contract });
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) process.exitCode = 1;

async function fetchLiveRulesets() {
  const payload = await githubJson(RULESETS_URL);
  if (!Array.isArray(payload)) throw Object.assign(new Error("live-rulesets-invalid"), { code: "live-rulesets-invalid" });
  return payload;
}

async function fetchRulesetDetail(id) {
  if (!Number.isInteger(id)) return { id, enforcement: "disabled", rules: [] };
  return githubJson(`${RULESETS_URL}/${id}`);
}

async function githubJson(url) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "mahoraga-live-protection",
  };
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (typeof token === "string" && token.length > 0) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, { headers, redirect: "error" });
  if (!response.ok) {
    throw Object.assign(new Error(`live-protection-http-${response.status}`), { code: "live-protection-unobserved" });
  }
  return response.json();
}
