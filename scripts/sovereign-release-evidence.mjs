import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const SHA = /^[a-f0-9]{40}$/;
const REPOSITORY = "michaeljwilliams0123/mahoraga";

/**
 * Read an authoritative list of completed Staged Release workflow runs from
 * the GitHub Actions API, not untrusted event actor metadata.
 * A matching release attests only that release.yml completed successfully.
 */
export function selectSovereignReleaseEvidence(payload, sourceSha) {
  if (typeof sourceSha !== "string" || !SHA.test(sourceSha)) throw Error("source-sha-invalid");
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.workflow_runs)) throw Error("release-runs-invalid");
  const matches = payload.workflow_runs.slice(0, 100).filter(run => {
    if (!run || typeof run !== "object") return false;
    if (run.name !== "Publish Staged Mahoraga Update" || run.head_sha !== sourceSha
      || run.head_branch !== "main" || run.head_repository?.full_name !== REPOSITORY
      || run.status !== "completed" || run.conclusion !== "success"
      || !Number.isSafeInteger(run.id) || run.id <= 0) return false;
    const timestamp = Date.parse(run.updated_at);
    return typeof run.updated_at === "string" && Number.isFinite(timestamp)
      && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(run.updated_at);
  });
  matches.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at) || b.id - a.id);
  if (!matches.length) return Object.freeze({status:"unavailable",sourceSha});
  const match = matches[0];
  return Object.freeze({status:"verified-release",sourceSha,releasedAt:match.updated_at,releaseRunId:match.id});
}

async function main(args) {
  if (args.length !== 1) throw Error("source-sha-invalid");
  let input="";
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 3_000_000) throw Error("release-runs-too-large");
  }
  const output=selectSovereignReleaseEvidence(JSON.parse(input),args[0]);
  process.stdout.write(JSON.stringify(output)+"\n");
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).catch(err => {
    process.stderr.write((/^[a-z-]+$/.test(err?.message||"")?err.message:"release-evidence-unavailable")+"\n");
    process.exitCode=1;
  });
}
