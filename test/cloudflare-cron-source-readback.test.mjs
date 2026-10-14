import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expectedCronSchedule, verifyCronScheduleSnapshot, readLiveCronSchedules } from "../scripts/cloudflare-cron-source-readback.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const accountId = "a".repeat(32), apiToken = "not-a-real-cloudflare-test-token-12345678";
const response = (crons) => ({success:true,result:{schedules:crons.map(cron=>({cron}))}});
const desired = {
  "mahoraga-execution-runtime": ["*/5 * * * *", "0 0 * * *"],
  "mahoraga-owner-gateway": ["* * * * *"],
};
const readConfig = (p) => readFileSync(join(root,p),"utf8");

test("Cron expectations derive from the two protected Wrangler source files", () => {
  assert.deepEqual(expectedCronSchedule(readConfig("deploy/cloudflare-owner-gateway/wrangler.toml"), "toml"), desired["mahoraga-owner-gateway"]);
  assert.deepEqual(expectedCronSchedule(readConfig("deploy/cloudflare-execution-runtime/wrangler.jsonc"), "json"), [...desired["mahoraga-execution-runtime"]].sort());
  for (const bad of ["", "[triggers]\ncrons = []", '[triggers]\ncrons = ["* * * * *","* * * * *"]']) {
    assert.throws(()=>expectedCronSchedule(bad,"toml"),/cron-source-config-invalid/);
  }
});

test("exact live schedules pass; out-of-band PUT, duplicates, missing and additional schedules fail", () => {
  for(const [worker,crons] of Object.entries(desired)) {
    assert.equal(verifyCronScheduleSnapshot(worker,crons,response(crons)).sourceMatched,true);
  }
  for(const observed of [["*/5 * * * *"], [], ["* * * * *","* * * * *"], ["* * * * *","*/5 * * * *"]]) {
    assert.throws(()=>verifyCronScheduleSnapshot("mahoraga-owner-gateway",desired["mahoraga-owner-gateway"],response(observed)),/cron-source-drift/);
  }
  for(const payload of [{success:false,result:{schedules:[]}}, {success:true,result:{}}, response([null])]) {
    assert.throws(()=>verifyCronScheduleSnapshot("mahoraga-owner-gateway",desired["mahoraga-owner-gateway"],payload),/cron-readback-invalid/);
  }
});

test("only authenticated GET requests to the two fixed Cloudflare Cron endpoints; no token exposure", async () => {
  const urls=[];
  const receipt=await readLiveCronSchedules({accountId,apiToken,readConfig,fetchImpl:async(url,init)=>{
    assert.equal(init.method,"GET"); assert.equal(init.redirect,"error");
    assert.equal(init.headers.authorization,"Bearer "+apiToken); urls.push(url);
    const worker=url.split("/workers/scripts/")[1].split("/schedules")[0];
    return Response.json(response(desired[worker]));
  }});
  assert.equal(receipt.status,"verified");assert.equal(urls.length,2);
  assert.ok(urls.every(url=>/^https:\/\/api\.cloudflare\.com\/client\/v4\/accounts\/a{32}\/workers\/scripts\/mahoraga-(execution-runtime|owner-gateway)\/schedules$/.test(url)));
  assert.doesNotMatch(JSON.stringify(receipt),/not-a-real|Bearer|apiToken|accountId/);
});

test("bounded Cron propagation retry does not hide persistent drift", async()=>{
  let calls=0,waits=0;
  const receipt=await readLiveCronSchedules({accountId,apiToken,readConfig,attempts:2,delayMs:0,sleep:async()=>{waits++;},fetchImpl:async(url)=>{
    const worker=url.includes("execution-runtime")?"mahoraga-execution-runtime":"mahoraga-owner-gateway";
    calls++;return Response.json(response(calls===1?["* * * * *"]:desired[worker]));
  }});
  assert.equal(receipt.status,"verified");assert.equal(waits,1);assert.equal(calls,3);
  await assert.rejects(readLiveCronSchedules({accountId,apiToken,readConfig,attempts:2,delayMs:0,sleep:async()=>{},fetchImpl:async()=>Response.json(response(["*/5 * * * *"]))}),/cron-source-drift/);
});

test("unauthorized, unreachable or malformed API is fail-closed and sanitized",async()=>{
  await assert.rejects(readLiveCronSchedules({accountId,apiToken:""}),/cron-readback-credentials-unavailable/);
  await assert.rejects(readLiveCronSchedules({accountId,apiToken,readConfig,fetchImpl:async()=>{throw Error("leak-test-token");}}),/cron-readback-api-unavailable/);
  await assert.rejects(readLiveCronSchedules({accountId,apiToken,readConfig,fetchImpl:async()=>Response.json({}, {status:403})}),/cron-readback-api-unavailable/);
});

test("canonical deploy reads live Cron after gateway deploy but before acceptance",()=>{
  const yaml=readConfig(".github/workflows/cloudflare-execution-runtime.yml");
  const runtime=yaml.indexOf("- name: Deploy exact verified execution runtime");
  const gateway=yaml.indexOf("- name: Deploy exact verified owner gateway");
  const check=yaml.indexOf("- name: Verify live Cloudflare Cron triggers match source");
  const acceptance=yaml.indexOf("- name: Prove Access, provenance, Cloudflare cognition, replay, and no Railway fallthrough");
  assert.ok(runtime>=0&&gateway>runtime&&check>gateway&&acceptance>check);
  const block=yaml.slice(check,acceptance);
  assert.match(block,/node scripts\/verify-exact-head.mjs/);
  assert.match(block,/unset GITHUB_TOKEN/);
  assert.match(block,/node scripts\/cloudflare-cron-source-readback.mjs/);
  assert.doesNotMatch(block,/wrangler.*deploy|secret put|curl.*-X PUT/);
});

const finalReadbackName = "- name: Verify final Cloudflare Cron triggers before accepting release";

test("final Cron readback follows acceptance redeployment and gates summary and artifact publication", () => {
  const yaml = readConfig(".github/workflows/cloudflare-execution-runtime.yml");
  const proof = yaml.indexOf("- name: Prove Access, provenance, Cloudflare cognition, replay, and no Railway fallthrough");
  const final = yaml.indexOf(finalReadbackName);
  const retain = yaml.indexOf("- name: Retain sanitized Cloudflare acceptance receipt");
  assert.ok(final > proof && retain > final, "final readback must follow redeployment and precede acceptance publication");
  assert.doesNotMatch(yaml.slice(proof, final), /GITHUB_STEP_SUMMARY/);
  const block = yaml.slice(final, retain);
  assert.match(block, /set -euo pipefail/);
  assert.match(block, /node scripts\/verify-exact-head.mjs[\s\S]*unset GITHUB_TOKEN[\s\S]*node scripts\/cloudflare-cron-source-readback.mjs[\s\S]*GITHUB_STEP_SUMMARY/);
  assert.doesNotMatch(yaml.slice(final), /wrangler.*deploy|node scripts\/cloudflare-execution-runtime.ts deploy/);
  assert.match(yaml.slice(retain), /- name: Remove temporary Cloudflare secret files\s+if: always\(\)/);
});

test("final readback shell fails closed without publishing a summary, and publishes only after success", () => {
  const yaml = readConfig(".github/workflows/cloudflare-execution-runtime.yml");
  const start = yaml.indexOf(finalReadbackName);
  assert.notEqual(start, -1, "final deployment Cron gate must exist");
  const block = yaml.slice(start, yaml.indexOf("- name: Retain sanitized Cloudflare acceptance receipt"));
  const script = block.split("run: |\n")[1].split("\n").map(line => line.replace(/^ {10}/, "")).join("\n");
  const dir = mkdtempSync(join(tmpdir(), "mahoraga-final-cron-"));
  try {
    mkdirSync(join(dir, "scripts")); mkdirSync(join(dir, "reports"));
    writeFileSync(join(dir, "reports/cloudflare-execution-runtime-acceptance.json"), '{"status":"accepted"}');
    writeFileSync(join(dir, "scripts/verify-exact-head.mjs"), 'process.stdout.write("source-rechecked\\n");');
    writeFileSync(join(dir, "scripts/cloudflare-cron-source-readback.mjs"), 'if (process.env.GITHUB_TOKEN) process.exit(2); process.exitCode = Number(process.env.TEST_READBACK_EXIT);');
    const summary = join(dir, "summary.md");
    for (const exit of [1, 0]) {
      const result = spawnSync("bash", ["-c", script], { cwd: dir, encoding: "utf8", env: { ...process.env, GITHUB_TOKEN: "fixture-only", GITHUB_STEP_SUMMARY: summary, TEST_READBACK_EXIT: String(exit) } });
      assert.equal(result.status, exit, result.stderr);
      assert.match(result.stdout, /source-rechecked/);
      if (exit) assert.equal(existsSync(summary), false, "failed final readback must not publish acceptance");
      else assert.match(readFileSync(summary, "utf8"), /\{"status":"accepted"\}/);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
