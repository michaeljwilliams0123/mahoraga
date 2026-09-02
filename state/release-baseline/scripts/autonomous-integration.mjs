import { appendFileSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { autonomyPolicySnapshot } from "../src/autonomy-policy.mjs";
import { evaluateAutonomousIntegration } from "../src/autonomous-integration.mjs";

const inputPath = argument("--input");
if (!inputPath) throw new TypeError("--input is required");
const manifest = JSON.parse(readFileSync(new URL("../mahoraga.manifest.json", import.meta.url), "utf8"));
const input = JSON.parse(readFileSync(safeWorkflowInputPath(inputPath), "utf8"));
const decision = evaluateAutonomousIntegration(input, autonomyPolicySnapshot(manifest));
process.stdout.write(`${JSON.stringify(decision)}\n`);

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(safeGithubOutputPath(), [
    `eligible=${decision.eligible}`,
    `reason=${decision.reason}`,
    `pull_request=${decision.pullRequestNumber ?? ""}`,
    `head_sha=${decision.headSha ?? ""}`,
    "",
  ].join("\n"));
}

function safeWorkflowInputPath(value) {
  return resolveWithin(process.env.GITHUB_WORKSPACE ?? process.cwd(), value, "workflow-input-path-invalid");
}

function safeGithubOutputPath() {
  const outputPath = process.env.GITHUB_OUTPUT;
  const runnerTemp = process.env.RUNNER_TEMP;
  if (!outputPath || !runnerTemp) throw new TypeError("GITHUB_OUTPUT and RUNNER_TEMP are required");
  return resolveWithin(runnerTemp, outputPath, "github-output-path-invalid");
}

function resolveWithin(root, candidate, code) {
  if (typeof root !== "string" || typeof candidate !== "string") throw new TypeError(code);
  const base = resolve(root);
  const target = resolve(base, candidate);
  const child = relative(base, target);
  if (!child || child.startsWith("..") || isAbsolute(child)) throw new TypeError(code);
  return target;
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}
