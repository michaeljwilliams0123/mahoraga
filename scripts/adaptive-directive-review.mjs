import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { buildImpactMap, classifyDirectiveChange, compileDirective, evaluateReviewStop } from "../src/adaptive-directive-review.mjs";
import { loadAdaptiveReviewPolicy } from "../src/adaptive-review-policy.mjs";
import { buildTrustedStateLedger } from "../src/trusted-state-ledger.mjs";

const execFileAsync = promisify(execFile);
const text = process.argv.slice(2).join(" ").trim();
if (!text) {
  process.stderr.write("usage: npm run review:directive -- \"<owner direction>\"\n");
  process.exitCode = 2;
} else {
  const policy = await loadAdaptiveReviewPolicy();
  const directive = compileDirective({ text, policy });
  const impactMap = buildImpactMap({ directive, policy });
  const now = new Date().toISOString();
  const sourceCommit = await currentCommit();
  const observations = [
    { id: "review-policy", surface: "policy", source: "repo-contract", authority: "contract", value: policy.mode, observedAt: now, evidenceRef: "config/adaptive-review-policy.json" },
  ];
  if (sourceCommit) observations.push({ id: "source-head", surface: "repository", source: "git-head", authority: "authoritative", value: sourceCommit, observedAt: now, evidenceRef: `git:${sourceCommit}` });
  const ledger = buildTrustedStateLedger({ observations, policy, now });
  const reviewStop = evaluateReviewStop({ impactMap, ledger, contradictions: [], policy });
  const covered = new Set(ledger.facts.filter((fact) => fact.trusted).map((fact) => fact.surface));
  const coverage = impactMap.nodes.length === 0 ? 0 : impactMap.nodes.filter((node) => covered.has(node.id)).length / impactMap.nodes.length;
  const output = {
    schemaVersion: 1,
    mode: policy.mode,
    directive,
    impactMap,
    trustedState: ledger,
    classification: classifyDirectiveChange({ directive, existingCoverage: coverage, contradictions: [], blockers: [] }),
    reviewStop,
    nextStep: reviewStop.stop ? "complete" : directive.evidenceLadder[1] ?? "trusted-ledger",
    zeroCredit: true,
    providerRequired: false,
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

async function currentCommit() {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { windowsHide: true });
    const sha = stdout.trim().toLowerCase();
    return /^[a-f0-9]{40}$/.test(sha) ? sha : null;
  } catch { return null; }
}
