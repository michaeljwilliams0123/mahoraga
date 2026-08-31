import { appendFileSync, readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { autonomyPolicySnapshot } from "../src/autonomy-policy.mjs";
import { evaluateAutonomousIntegration } from "../src/autonomous-integration.mjs";

const inputPath = argument("--input");
if (!inputPath) throw new TypeError("--input is required");
const manifest = JSON.parse(readFileSync(new URL("../mahoraga.manifest.json", import.meta.url), "utf8"));
const input = JSON.parse(readFileSync(inputPath, "utf8"));
const decision = evaluateAutonomousIntegration(input, autonomyPolicySnapshot(manifest));
process.stdout.write(`${JSON.stringify(decision)}\n`);

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(safeGithubOutputPath(), [
    `eligible=${decision.eligible}`,
    `reason=${decision.reason}`,
    `pull_request=${decision.pullRequestNumber ?? ""}`,
    `head_sha=${decision.headSha ?? ""}`,
    `deploy_pages=${decision.deployPages === true}`,
    "",
  ].join("\n"));
}

function safeGithubOutputPath() {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) throw new TypeError("GITHUB_OUTPUT is required");

  const workspaceRoot = resolve(process.env.GITHUB_WORKSPACE ?? process.cwd());
  const candidate = resolve(outputPath);
  const workspacePrefix = workspaceRoot.endsWith(sep) ? workspaceRoot : `${workspaceRoot}${sep}`;

  if (candidate !== workspaceRoot && !candidate.startsWith(workspacePrefix)) {
    throw new TypeError("GITHUB_OUTPUT must be within GITHUB_WORKSPACE");
  }

  return candidate;
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}
