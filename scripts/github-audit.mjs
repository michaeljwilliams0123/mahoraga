import { buildGithubAudit } from "../src/github-audit.mjs";

const report = await buildGithubAudit();
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.healthy) process.exitCode = 1;
