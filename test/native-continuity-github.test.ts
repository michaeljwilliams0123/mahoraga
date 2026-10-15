import assert from "node:assert/strict";
import test from "node:test";
import { inspectNativeSourceProduction, publishNativeSourceProductionEvidence } from "../deploy/cloudflare-execution-runtime/github-workspace.ts";

const sha = "a".repeat(40);
const marker = "b".repeat(64);
async function credentials() {
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const privateKey = Buffer.from(await crypto.subtle.exportKey("pkcs8", pair.privateKey)).toString("base64");
  return { GITHUB_APP_ID: "123", GITHUB_INSTALLATION_ID: "456", GITHUB_APP_PRIVATE_KEY: `-----BEGIN PRIVATE KEY-----\n${privateKey}\n-----END PRIVATE KEY-----` };
}
const json = (value: unknown, status = 200) => Response.json(value, { status });
test("native inspection requires both strict Verify jobs and both Cloudflare publication jobs", async () => {
  const permissions: unknown[] = [];
  const mock = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/access_tokens")) {
      permissions.push(JSON.parse(String(init?.body)).permissions);
      return json({ token: "fake", expires_at: "2099-01-01" }, 201);
    }
    if (url.includes("workflows/verify.yml/runs?")) return json({ workflow_runs: [{ id: 100, head_sha: sha, head_branch: "main", conclusion: "success", status: "completed", event: "push" }] });
    if (url.includes("workflows/cloudflare-execution-runtime.yml/runs?")) return json({ workflow_runs: [{ id: 101, head_sha: sha, head_branch: "main", conclusion: "success", status: "completed", event: "workflow_run" }] });
    if (url.includes("runs/100/jobs?")) return json({ jobs: [{ name: "Verify (ubuntu-latest)", conclusion: "success" }, { name: "Verify (windows-latest)", conclusion: "success" }] });
    if (url.includes("runs/101/jobs?")) return json({ jobs: [{ name: "Deploy and accept exact verified main", conclusion: "success" }, { name: "Publish the paired Cloudflare cockpit / Publish exact verified main as a candidate UI", conclusion: "success" }] });
    throw new Error("unexpected API route "+url);
  };
  const result = await inspectNativeSourceProduction(sha, sha, { env: await credentials(), fetchImpl: mock });
  assert.equal(result.ubuntuPassed, true);
  assert.equal(result.windowsPassed, true);
  assert.equal(result.acceptancePassed, true);
  assert.deepEqual(permissions, [{ actions: "read", metadata: "read" }]);
});
test("success wrapper without actual workspace publication job cannot certify production", async () => {
  const mock = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/access_tokens")) return json({ token: "fake", expires_at: "2099-01-01" }, 201);
    if (url.includes("workflows/verify.yml/runs?")) return json({ workflow_runs: [{ id: 100, head_sha: sha, head_branch: "main", conclusion: "success", status: "completed", event: "push" }] });
    if (url.includes("workflows/cloudflare-execution-runtime.yml/runs?")) return json({ workflow_runs: [{ id: 101, head_sha: sha, head_branch: "main", conclusion: "success", status: "completed", event: "workflow_run" }] });
    if (url.includes("runs/100/jobs?")) return json({ jobs: [{ name: "Verify (ubuntu-latest)", conclusion: "success" }, { name: "Verify (windows-latest)", conclusion: "success" }] });
    if (url.includes("runs/101/jobs?")) return json({ jobs: [{ name: "Deploy and accept exact verified main", conclusion: "success" }, { name: "Publish the paired Cloudflare cockpit", conclusion: "skipped" }] });
    throw new Error("unexpected URL");
  };
  const r = await inspectNativeSourceProduction(sha, sha, { env: await credentials(), fetchImpl: mock });
  assert.equal(r.acceptancePassed, false);
});
test("native evidence publisher requests only Issues write and reconciles an existing comment", async () => {
  const permissionRequests: unknown[] = [];
  let posts = 0;
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/access_tokens")) { permissionRequests.push(JSON.parse(String(init?.body)).permissions); return json({ token: "fake", expires_at: "2099" }, 201); }
    if (url.endsWith("/issues/786")) return json({ number: 786, state: "open", comments: 120 });
    if (url.includes("/comments?per_page=")) return json([{ id: 999, body: `prior\n<!-- mahoraga-native-evidence:${marker} -->` }]);
    if (init?.method === "POST") { posts++; return json({ id: 999 }, 201); }
    throw new Error("unexpected URL");
  };
  const p = await publishNativeSourceProductionEvidence(marker, "accepted exact SHA, verify and workspace acceptance receipts", { env: await credentials(), fetchImpl });
  assert.equal(p.alreadyPresent, true); assert.equal(p.id, 999); assert.equal(posts, 0);
  assert.deepEqual(permissionRequests, [{ issues: "write", metadata: "read" }]);
});
