import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";
// @ts-expect-error: Existing GitHub App client is bounded MJS migration debt.
import { proveGithubAppNativeGrants } from "../src/github-native-client.mjs";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const env = { GITHUB_APP_ID: "123", GITHUB_INSTALLATION_ID: "456", GITHUB_APP_PRIVATE_KEY: pem };
const repo = "michaeljwilliams0123/mahoraga";
const expected = [
  { contents: "write", pull_requests: "write", metadata: "read" },
  { actions: "write", contents: "read", metadata: "read" },
];
const json = (body: unknown, status = 200) => Response.json(body, { status });

test("native grant preflight scopes, verifies, and revokes both capability tokens", async () => {
  const calls: { pathname: string; method: string; body: unknown; authorization: string | null }[] = [];
  let minted = 0;
  const fetchImpl = async (url: string | URL, options: RequestInit) => {
    const pathname = new URL(url).pathname;
    calls.push({ pathname, method: options.method ?? "GET", body: options.body ? JSON.parse(String(options.body)) : null, authorization: new Headers(options.headers).get("authorization") });
    if (pathname.endsWith("/access_tokens")) {
      const n = minted++;
      return json({ token: `synthetic-only-token-${n}`, expires_at: "2099-01-01T00:00:00Z", permissions: expected[n] }, 201);
    }
    if (pathname === "/installation/token") return new Response(null, { status: 204 });
    throw new Error("unexpected path");
  };
  const receipt = await proveGithubAppNativeGrants({ env, fetchImpl });
  assert.deepEqual(receipt, { status: "verified", repository: repo, capabilities: ["repository-write", "verify-dispatch"] });
  assert.deepEqual(calls.map(c => [c.method, c.pathname]), [
    ["POST", "/app/installations/456/access_tokens"], ["DELETE", "/installation/token"],
    ["POST", "/app/installations/456/access_tokens"], ["DELETE", "/installation/token"],
  ]);
  assert.deepEqual(calls.filter(c => c.method === "POST").map(c => c.body), expected.map(permissions => ({ repositories: ["mahoraga"], permissions })));
  assert.equal(calls[1]?.authorization, "Bearer synthetic-only-token-0");
  assert.equal(calls[3]?.authorization, "Bearer synthetic-only-token-1");
  assert.doesNotMatch(JSON.stringify(receipt), /synthetic-only-token|PRIVATE KEY/);
});

test("grant denied: no dispatch claim and previously issued token revoked", async () => {
  let minted = 0, revoked = 0;
  const fetchImpl = async (url: string | URL, options: RequestInit) => {
    if (new URL(url).pathname === "/installation/token") {
      revoked++;
      return new Response(null, { status: 204 });
    }
    if (minted++ === 0) return json({ token: "synthetic", expires_at: "2099", permissions: expected[0] }, 201);
    return json({ message: "permissions denied; internal-sensitive-detail" }, 422);
  };
  await assert.rejects(
    proveGithubAppNativeGrants({ env, fetchImpl }),
    (error: unknown) => {
      const actual = error as { code?: string; message?: string };
      return actual?.code === "github-native-grant-verify-dispatch-unavailable"
        && !String(actual.message).includes("internal-sensitive-detail");
    },
  );
  assert.equal(revoked, 1);
});

test("overstated grant fails closed but revokes the issued token", async () => {
  let revocations = 0;
  const fetchImpl = async (url: string | URL) => {
    if (new URL(url).pathname === "/installation/token") {
      revocations++;
      return new Response(null, { status: 204 });
    }
    return json({ token: "synthetic", expires_at: "2099", permissions: { contents: "read", metadata: "read" } }, 201);
  };
  await assert.rejects(proveGithubAppNativeGrants({ env, fetchImpl }), { code: "github-native-grant-repository-write-mismatch" });
  assert.equal(revocations, 1);
});

test("revocation failure blocks release rather than claiming verified authority", async () => {
  const fetchImpl = async (url: string | URL) => new URL(url).pathname === "/installation/token"
    ? json({ message: "denied" }, 403)
    : json({ token: "synthetic", expires_at: "2099", permissions: expected[0] }, 201);
  await assert.rejects(proveGithubAppNativeGrants({ env, fetchImpl }), { code: "github-native-grant-repository-write-revoke-failed" });
});

test("preflight is before any runtime/provider/gateway deploy and cannot mutate GitHub source", () => {
  const workflow = readFileSync(new URL("../.github/workflows/cloudflare-execution-runtime.yml", import.meta.url), "utf8");
  const index = workflow.indexOf("run: node scripts/github-app-grant-preflight.ts");
  assert.ok(index > 0);
  for (const needle of ["node scripts/cloudflare-execution-runtime.ts deploy", "node scripts/cloudflare-zero-credit-attestation.mjs"]) {
    assert.ok(index < workflow.indexOf(needle), needle);
  }
  const preflight = readFileSync(new URL("../scripts/github-app-grant-preflight.ts", import.meta.url), "utf8");
  assert.doesNotMatch(preflight, /\bpush\b|createPullRequest|workflow.*dispatch|\bput\b|\bPATCH\b/);
});
