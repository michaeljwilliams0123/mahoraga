import { appendFileSync, readFileSync } from "node:fs";
import { autonomyPolicySnapshot } from "../src/autonomy-policy.mjs";
import { evaluateAutonomousIntegration } from "../src/autonomous-integration.mjs";

const inputPath = argument("--input");
if (!inputPath) throw new TypeError("--input is required");
const manifest = JSON.parse(readFileSync(new URL("../mahoraga.manifest.json", import.meta.url), "utf8"));
const input = JSON.parse(readFileSync(inputPath, "utf8"));
const decision = evaluateAutonomousIntegration(input, autonomyPolicySnapshot(manifest));
process.stdout.write(`${JSON.stringify(decision)}\n`);

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, [
    `eligible=${decision.eligible}`,
    `reason=${decision.reason}`,
    `pull_request=${decision.pullRequestNumber ?? ""}`,
    `head_sha=${decision.headSha ?? ""}`,
    `deploy_pages=${decision.deployPages === true}`,
    "",
  ].join("\n"));
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}
