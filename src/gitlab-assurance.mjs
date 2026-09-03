import { readFileSync } from "node:fs";

export function validateGitLabAssurance({ objective = {}, github = {}, gitlab = {} } = {}) {
  const mismatches = [];
  compare("repositoryIdentity", github.repositoryIdentity, gitlab.repositoryIdentity, mismatches);
  compare("branch", github.branch, gitlab.branch, mismatches);
  compare("commitSha", github.commitSha, gitlab.commitSha, mismatches);
  compare("workflowVersion", github.workflowVersion, gitlab.workflowVersion, mismatches);
  const githubCommands = normalizeCommands(github.commands);
  const gitlabCommands = normalizeCommands(gitlab.commands);
  compare("commandIds", githubCommands.map((command) => command.id).join(","), gitlabCommands.map((command) => command.id).join(","), mismatches);
  for (const command of [...githubCommands, ...gitlabCommands]) if (!["success", "passed"].includes(command.conclusion)) mismatches.push({ field: `command:${command.id}`, reason: "unsuccessful-conclusion" });
  for (const command of githubCommands) {
    const peer = gitlabCommands.find((candidate) => candidate.id === command.id);
    if (peer && command.conclusion !== peer.conclusion && !(command.conclusion === "success" && peer.conclusion === "passed")) mismatches.push({ field: `command:${command.id}`, reason: "conclusion-mismatch" });
  }
  if (mismatches.length > 0) return Object.freeze({ ok: false, reason: "dual-ledger-sha-mismatch", objectiveId: objective.id ?? null, mismatches });
  return Object.freeze({ ok: true, reason: null, objectiveId: objective.id ?? null, repositoryIdentity: github.repositoryIdentity, branch: github.branch, commitSha: github.commitSha });
}

function compare(field, left, right, mismatches) { if (!left || !right || left !== right) mismatches.push({ field, github: left ?? null, gitlab: right ?? null }); }
function normalizeCommands(commands = []) { return commands.map((command) => ({ id: String(command.id), conclusion: String(command.conclusion).toLowerCase() })).sort((a, b) => a.id.localeCompare(b.id)); }

if (import.meta.url === `file://${process.argv[1]}`) {
  const raw = process.env.MAHORAGA_GITLAB_ASSURANCE_JSON || (process.stdin.isTTY ? "" : readFileSync(0, "utf8"));
  if (!raw.trim()) {
    console.error(JSON.stringify({ ok: false, reason: "assurance-input-missing" }));
    process.exit(1);
  }
  const result = validateGitLabAssurance(JSON.parse(raw));
  console.log(JSON.stringify(result));
  process.exit(result.ok ? 0 : 1);
}
