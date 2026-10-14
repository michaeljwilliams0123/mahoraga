/**
 * Read-only Cloudflare Cron Trigger reconciliation for canonical production workers.
 * Expected schedules come from protected-source Wrangler config, not live guesses.
 */
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const WORKERS = [
  { name: "mahoraga-execution-runtime", config: "deploy/cloudflare-execution-runtime/wrangler.jsonc", format: "json" },
  { name: "mahoraga-owner-gateway", config: "deploy/cloudflare-owner-gateway/wrangler.toml", format: "toml" },
];
const record = (x) => x !== null && typeof x === "object" && !Array.isArray(x) ? x : null;
const validCrons = (a) => Array.isArray(a) && a.length > 0 && a.every(x => typeof x === "string" && x.length >= 9 && x.length <= 100) && new Set(a).size === a.length;

export function expectedCronSchedule(config, format) {
  let value;
  try {
    if (format === "json") value = JSON.parse(config)?.triggers?.crons;
    else if (format === "toml") {
      const section = config.match(/(?:^|\n)\[triggers\][^\r\n]*\r?\n([\s\S]*?)(?=\r?\n\[|$)/);
      const list = section?.[1]?.match(/^\s*crons\s*=\s*(\[[^\r\n]*\])\s*$/m)?.[1];
      value = JSON.parse(list ?? "");
    }
  } catch { throw new Error("cron-source-config-invalid"); }
  if (!validCrons(value)) throw new Error("cron-source-config-invalid");
  return [...value].sort();
}

export function verifyCronScheduleSnapshot(worker, expected, payload) {
  if (!WORKERS.some(x => x.name === worker) || !validCrons(expected)) throw new Error("cron-source-config-invalid");
  const result = record(payload)?.result;
  const schedules = record(result)?.schedules;
  if (record(payload)?.success !== true || !Array.isArray(schedules)
    || schedules.some(x => !record(x) || typeof x.cron !== "string")) throw new Error("cron-readback-invalid");
  const actual = schedules.map(x => x.cron);
  const desired = [...expected].sort();
  if (!validCrons(actual) || actual.length !== desired.length
    || actual.sort().some((cron, i) => cron !== desired[i])) throw new Error("cron-source-drift");
  return Object.freeze({ worker, crons: desired, sourceMatched: true });
}

export async function readLiveCronSchedules({
  accountId, apiToken, readConfig = (path) => readFile(path, "utf8"),
  fetchImpl = fetch, sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  attempts = 4, delayMs = 2000,
} = {}) {
  if (typeof accountId !== "string" || !/^[a-f0-9]{32}$/.test(accountId)
    || typeof apiToken !== "string" || apiToken.trim().length < 32) throw new Error("cron-readback-credentials-unavailable");
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 5
    || !Number.isInteger(delayMs) || delayMs < 0 || delayMs > 5000) throw new Error("cron-readback-retry-invalid");
  const receipts = [];
  for (const item of WORKERS) {
    const expected = expectedCronSchedule(await readConfig(item.config), item.format);
    let receipt;
    for (let n = 1; n <= attempts; n++) {
      let payload;
      try {
        const url = "https://api.cloudflare.com/client/v4/accounts/" + accountId
          + "/workers/scripts/" + item.name + "/schedules";
        const res = await fetchImpl(url, {
          method: "GET", redirect: "error", signal: AbortSignal.timeout(8000),
          headers: { authorization: "Bearer " + apiToken, accept: "application/json", "cache-control": "no-store" },
        });
        if (!res.ok) throw new Error("cron-readback-api-unavailable");
        const body = await res.text();
        if (body.length > 65536) throw new Error("cron-readback-invalid");
        payload = JSON.parse(body);
      } catch { throw new Error("cron-readback-api-unavailable"); }
      try { receipt = verifyCronScheduleSnapshot(item.name, expected, payload); break; }
      catch (e) {
        if (!(e instanceof Error) || e.message !== "cron-source-drift" || n === attempts) throw e;
        await sleep(delayMs);
      }
    }
    receipts.push(receipt);
  }
  return Object.freeze({ kind: "cloudflare-cron-source-readback", status: "verified", workers: receipts });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const receipt = await readLiveCronSchedules({
      accountId: (process.env.CLOUDFLARE_ACCOUNT_ID ?? "").trim(),
      apiToken: (process.env.CLOUDFLARE_API_TOKEN ?? "").trim(),
    });
    process.stdout.write(JSON.stringify(receipt) + "\n");
  } catch (e) {
    const codes = new Set(["cron-source-config-invalid", "cron-readback-credentials-unavailable", "cron-readback-retry-invalid", "cron-readback-api-unavailable", "cron-readback-invalid", "cron-source-drift"]);
    process.stderr.write("::error::" + (e instanceof Error && codes.has(e.message) ? e.message : "cron-readback-failed") + "\n");
    process.exitCode = 1;
  }
}
