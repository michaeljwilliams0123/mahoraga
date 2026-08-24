import { buildGithubAudit, renderGithubAuditMarkdown } from "../src/github-audit.mjs";

const report = await buildGithubAudit();
const formatIndex = process.argv.indexOf("--format");
const format = formatIndex === -1 ? "json" : process.argv[formatIndex + 1];
if (!new Set(["json", "markdown"]).has(format)) throw new TypeError("GitHub audit format must be json or markdown.");
process.stdout.write(format === "markdown" ? renderGithubAuditMarkdown(report) : `${JSON.stringify(report, null, 2)}\n`);
if (!report.healthy) process.exitCode = 1;
