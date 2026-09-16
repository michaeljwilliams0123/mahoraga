# CF-1 Cloudflare Control Ingress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy an Access-authenticated Cloudflare owner gateway that safely projects owner identity into Mahoraga's canonical Railway runtime without widening authority or exposing secrets.

**Architecture:** Keep Railway as the canonical execution core and GitHub `main` as source authority. Harden the existing Cloudflare Worker to trust `ctx.access` rather than spoofable request headers, fail closed on missing runtime bindings, strip caller assertions, and sign a fresh HMAC assertion for the Railway workspace. Make deployment repeatable with pinned Wrangler commands and keep all Wrangler state outside Git.

**Tech Stack:** Node.js >=24 ESM, Node test runner, Cloudflare Workers, Cloudflare Access, Wrangler 4.132.0, Railway, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-15-cloudflare-cognitive-control-fabric-design.md`

## Global Constraints

- Cloudflare is the primary always-on cognitive/control fabric; Railway remains the canonical cloud execution core for this phase.
- GitHub `main` remains canonical source authority; Windows/local remains a trusted execution plane.
- Preserve the canonical `AuthorityDecision`; the edge gateway authenticates and projects identity but does not authorize capabilities.
- No provider may expand its own authority and no automatic paid fallback is introduced.
- No credentials, HMAC values, Access tokens, cookies, or private content may be committed, logged, or placed in diagnostics.
- Raw local `4782/4783` listeners remain non-public.
- Source, deployment, runtime, provider, authority, and verification truth remain separate evidence domains.
- Do not duplicate PR #543 UI scope; CF-1 changes gateway/deployment contracts only.
- Windows production remains locked to 3.6.0; do not activate 7.0.0-alpha.2 on Windows.
- Do not copy Navin AGPL implementation code into Mahoraga.

---### Task 1: Make the deployment contract secret-safe and Wrangler-clean

**Files:**
- Modify: `.gitignore`
- Modify: `deploy/cloudflare-owner-gateway/wrangler.toml`
- Create: `test/cloudflare-owner-gateway-deployment-contract.test.mjs`

**Interfaces:**
- Consumes: existing Worker name `mahoraga-owner-gateway` and canonical Railway origin.
- Produces: a Wrangler config that requires `MAHORAGA_CLOUD_OWNER_ID` and `MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET` as Cloudflare secrets, while keeping only `MAHORAGA_RUNTIME_ORIGIN` as a tracked non-secret variable.

- [ ] **Step 1: Write the failing deployment-contract test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const config = readFileSync(new URL("../deploy/cloudflare-owner-gateway/wrangler.toml", import.meta.url), "utf8");
const ignore = readFileSync(new URL("../.gitignore", import.meta.url), "utf8");

test("owner gateway keeps identity and assertion key out of tracked vars", () => {
  assert.match(config, /\[secrets\][\s\S]*MAHORAGA_CLOUD_OWNER_ID[\s\S]*MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET/);
  assert.doesNotMatch(config, /owner@example\.invalid/);
  assert.match(config, /MAHORAGA_RUNTIME_ORIGIN\s*=\s*"https:\/\/mahoraga-runtime-main-production\.up\.railway\.app\/"/);
});

test("Wrangler local state is ignored everywhere in the repository", () => {
  assert.match(ignore, /(^|\n)\.wrangler\/(\r?\n|$)/);
});
```
- [ ] **Step 2: Run the test and confirm RED**

Run:
```powershell
node --test test/cloudflare-owner-gateway-deployment-contract.test.mjs
```
Expected: FAIL because the current config tracks `owner@example.invalid`, has no `[secrets]` declaration, and `.gitignore` does not ignore `.wrangler/`.

- [ ] **Step 3: Make the minimal config and ignore changes**

Set `deploy/cloudflare-owner-gateway/wrangler.toml` to:

```toml
name = "mahoraga-owner-gateway"
main = "worker.mjs"
compatibility_date = "2026-09-01"

[vars]
MAHORAGA_RUNTIME_ORIGIN = "https://mahoraga-runtime-main-production.up.railway.app/"

[secrets]
required = ["MAHORAGA_CLOUD_OWNER_ID", "MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET"]
```

Append this exact line to root `.gitignore`:

```gitignore
.wrangler/
```
- [ ] **Step 4: Run focused checks and confirm GREEN**

Run:
```powershell
node --test test/cloudflare-owner-gateway-deployment-contract.test.mjs test/github-audit.test.mjs
```
Expected: PASS with zero failures; no `.wrangler` path is reported by the GitHub privacy audit.

- [ ] **Step 5: Commit Task 1**

```powershell
git add .gitignore deploy/cloudflare-owner-gateway/wrangler.toml test/cloudflare-owner-gateway-deployment-contract.test.mjs
git commit -m "chore(cloudflare): harden owner gateway deployment contract"
```

### Task 2: Trust Cloudflare Access context, not caller-supplied identity headers

**Files:**
- Modify: `deploy/cloudflare-owner-gateway/worker.mjs`
- Create: `test/cloudflare-owner-gateway-security.test.mjs`
- Modify: `test/cloudflare-owner-gateway-runtime-origin.test.mjs`

**Interfaces:**
- Consumes: Cloudflare Worker handler `fetch(request, env, ctx)` and `ctx.access.getIdentity()`.
- Produces: `403 owner-access-required` without an authenticated Access context, `401 owner-auth-required` for the wrong authenticated owner, `503 gateway-environment-invalid` for missing bindings, and a freshly HMAC-signed owner assertion only after all checks pass.
- [ ] **Step 1: Write failing Access-context tests**

Create `test/cloudflare-owner-gateway-security.test.mjs` with:

```js
import test from "node:test";
import assert from "node:assert/strict";
import gateway from "../deploy/cloudflare-owner-gateway/worker.mjs";

const baseEnv = {
  MAHORAGA_CLOUD_OWNER_ID: "owner@example.com",
  MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET: "x".repeat(64),
  MAHORAGA_RUNTIME_ORIGIN: "https://mahoraga-runtime-main-production.up.railway.app/",
};
const request = (headers = {}) => new Request("https://mahoraga-owner-gateway.example/api/runtime/session?probe=1", { headers });
const access = (email) => ({ access: { async getIdentity() { return { email }; } } });

test("caller cannot spoof Access identity with a request header", async () => {
  const response = await gateway.fetch(request({ "cf-access-authenticated-user-email": baseEnv.MAHORAGA_CLOUD_OWNER_ID }), baseEnv, {});
  assert.equal(response.status, 403);
  assert.equal(await response.text(), "owner-access-required");
});

test("authenticated Access identity must match the pinned owner", async () => {
  const response = await gateway.fetch(request(), baseEnv, access("other@example.com"));
  assert.equal(response.status, 401);
  assert.equal(await response.text(), "owner-auth-required");
});
```
Add three more tests in the same file:

```js
test("gateway fails closed when the HMAC secret is unavailable", async () => {
  const env = { ...baseEnv, MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET: "" };
  const response = await gateway.fetch(request(), env, access(baseEnv.MAHORAGA_CLOUD_OWNER_ID));
  assert.equal(response.status, 503);
  assert.equal(await response.text(), "gateway-environment-invalid");
});

test("malformed upstream origin is rejected before proxying", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("proxy-must-not-run"); };
  try {
    const env = { ...baseEnv, MAHORAGA_RUNTIME_ORIGIN: "http://user:pass@example.com/path" };
    const response = await gateway.fetch(request(), env, access(baseEnv.MAHORAGA_CLOUD_OWNER_ID));
    assert.equal(response.status, 503);
    assert.equal(await response.text(), "gateway-origin-invalid");
  } finally { globalThis.fetch = originalFetch; }
});

test("valid Access identity gets a fresh assertion and caller assertions are replaced", async () => {
  const originalFetch = globalThis.fetch;
  let forwarded;
  globalThis.fetch = async (next) => { forwarded = next; return new Response("ok", { status: 200 }); };
  try {
    const response = await gateway.fetch(request({
      "x-mahoraga-owner": "forged@example.com",
      "x-mahoraga-owner-timestamp": "1",
      "x-mahoraga-owner-nonce": "forged",
      "x-mahoraga-owner-signature": "forged",
    }), baseEnv, access(baseEnv.MAHORAGA_CLOUD_OWNER_ID));
    assert.equal(response.status, 200);
    assert.equal(forwarded.url, "https://mahoraga-runtime-main-production.up.railway.app/api/runtime/session?probe=1");
    assert.equal(forwarded.headers.get("x-mahoraga-owner"), baseEnv.MAHORAGA_CLOUD_OWNER_ID);
    assert.notEqual(forwarded.headers.get("x-mahoraga-owner-nonce"), "forged");
    assert.notEqual(forwarded.headers.get("x-mahoraga-owner-signature"), "forged");
    assert.equal(forwarded.redirect, "manual");
  } finally { globalThis.fetch = originalFetch; }
});
```
- [ ] **Step 2: Run security tests and confirm RED**

Run:
```powershell
node --test test/cloudflare-owner-gateway-security.test.mjs test/cloudflare-owner-gateway-runtime-origin.test.mjs
```
Expected: the spoofed-header test fails because the current Worker trusts `cf-access-authenticated-user-email`; the empty-secret test also fails because the current Worker does not fail closed before signing/proxying.

- [ ] **Step 3: Implement the minimal Access-context and environment hardening**

Change the start of `fetch` in `deploy/cloudflare-owner-gateway/worker.mjs` to:

```js
export default {
  async fetch(request, env, ctx) {
    const ownerId = typeof env?.MAHORAGA_CLOUD_OWNER_ID === "string" ? env.MAHORAGA_CLOUD_OWNER_ID.trim() : "";
    const assertionSecret = typeof env?.MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET === "string" ? env.MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET : "";
    if (!ownerId || assertionSecret.length < 32) {
      return new Response("gateway-environment-invalid", { status: 503 });
    }
    if (!ctx?.access || typeof ctx.access.getIdentity !== "function") {
      return new Response("owner-access-required", { status: 403 });
    }
    let identity;
    try { identity = await ctx.access.getIdentity(); }
    catch { return new Response("owner-access-required", { status: 403 }); }
    const owner = typeof identity?.email === "string" ? identity.email.trim() : "";
    if (!owner || owner !== ownerId) return new Response("owner-auth-required", { status: 401 });
```
Keep the existing origin validation, path/query preservation, forged-header deletion, and `redirect: "manual"` behavior. Change only the HMAC import to use the validated local variable:

```js
const key = await crypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(assertionSecret),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign"],
);
```

Extend `test/cloudflare-owner-gateway-runtime-origin.test.mjs` with:

```js
test("owner gateway trusts Cloudflare Access context rather than a caller identity header", () => {
  assert.match(worker, /ctx\?\.access/);
  assert.match(worker, /ctx\.access\.getIdentity/);
  assert.doesNotMatch(worker, /request\.headers\.get\("cf-access-authenticated-user-email"\)/);
});
```

- [ ] **Step 4: Run security and existing gateway tests and confirm GREEN**

Run:
```powershell
node --test test/cloudflare-owner-gateway-security.test.mjs test/cloudflare-owner-gateway-runtime-origin.test.mjs test/cloud-always-on-runtime.test.mjs
```
Expected: PASS with zero failures.

- [ ] **Step 5: Commit Task 2**

```powershell
git add deploy/cloudflare-owner-gateway/worker.mjs test/cloudflare-owner-gateway-security.test.mjs test/cloudflare-owner-gateway-runtime-origin.test.mjs
git commit -m "fix(cloudflare): bind owner gateway to Access context"
```
### Task 3: Add pinned, repeatable Wrangler operator commands

**Files:**
- Modify: `package.json`
- Modify: `test/cloudflare-owner-gateway-deployment-contract.test.mjs`

**Interfaces:**
- Consumes: Wrangler 4.132.0 and `deploy/cloudflare-owner-gateway/wrangler.toml`.
- Produces: repository-scoped commands for auth inspection, secret installation, deployment, and deployment-history inspection without putting any secret value on a command line.

- [ ] **Step 1: Extend the deployment-contract test and confirm RED**

Add to `test/cloudflare-owner-gateway-deployment-contract.test.mjs`:

```js
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const wrangler = "npx --yes wrangler@4.132.0";
const cfg = "--config deploy/cloudflare-owner-gateway/wrangler.toml";

test("owner gateway operator commands pin Wrangler and never embed secret values", () => {
  assert.equal(pkg.scripts["cloudflare:owner-gateway:whoami"], `${wrangler} whoami`);
  assert.equal(pkg.scripts["cloudflare:owner-gateway:deploy"], `${wrangler} deploy ${cfg}`);
  assert.equal(pkg.scripts["cloudflare:owner-gateway:deployments"], `${wrangler} deployments list ${cfg}`);
  assert.equal(pkg.scripts["cloudflare:owner-gateway:secret:owner"], `${wrangler} secret put MAHORAGA_CLOUD_OWNER_ID ${cfg}`);
  assert.equal(pkg.scripts["cloudflare:owner-gateway:secret:assertion"], `${wrangler} secret put MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET ${cfg}`);
  for (const value of Object.values(pkg.scripts).filter((value) => value.includes("cloudflare:owner-gateway") || value.includes("wrangler@4.132.0"))) {
    assert.doesNotMatch(value, /owner@example|secret=.*|token=.*|password=/i);
  }
});
```
Run:
```powershell
node --test test/cloudflare-owner-gateway-deployment-contract.test.mjs
```
Expected: FAIL because these scripts do not yet exist.

- [ ] **Step 2: Add the exact pinned package scripts**

Add these entries under `package.json` Ã¢â€ â€™ `scripts`:

```json
"cloudflare:owner-gateway:whoami": "npx --yes wrangler@4.132.0 whoami",
"cloudflare:owner-gateway:deploy": "npx --yes wrangler@4.132.0 deploy --config deploy/cloudflare-owner-gateway/wrangler.toml",
"cloudflare:owner-gateway:deployments": "npx --yes wrangler@4.132.0 deployments list --config deploy/cloudflare-owner-gateway/wrangler.toml",
"cloudflare:owner-gateway:secret:owner": "npx --yes wrangler@4.132.0 secret put MAHORAGA_CLOUD_OWNER_ID --config deploy/cloudflare-owner-gateway/wrangler.toml",
"cloudflare:owner-gateway:secret:assertion": "npx --yes wrangler@4.132.0 secret put MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET --config deploy/cloudflare-owner-gateway/wrangler.toml"
```

- [ ] **Step 3: Run the contract and dependency audit**

```powershell
node --test test/cloudflare-owner-gateway-deployment-contract.test.mjs test/dependency-audit.test.mjs
```
Expected: PASS; the exact Wrangler version satisfies the repository's deterministic dependency rule.

- [ ] **Step 4: Commit Task 3**

```powershell
git add package.json test/cloudflare-owner-gateway-deployment-contract.test.mjs
git commit -m "chore(cloudflare): pin owner gateway operator commands"
```
### Task 4: Turn the production-verification notes into an exact Access-first runbook

**Files:**
- Modify: `docs/CLOUD-ALWAYS-ON-RUNTIME.md`
- Create: `test/cloudflare-owner-gateway-runbook.test.mjs`

**Interfaces:**
- Consumes: the pinned package scripts from Task 3 and Cloudflare's authenticated `ctx.access` behavior from Task 2.
- Produces: a deterministic first-deploy/rotation sequence that is safe even before Access is enabled because the Worker itself rejects requests without `ctx.access`.

- [ ] **Step 1: Write the failing runbook contract test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const docs = readFileSync(new URL("../docs/CLOUD-ALWAYS-ON-RUNTIME.md", import.meta.url), "utf8");

test("owner gateway runbook is Access-first, pinned, and secret-safe", () => {
  for (const token of [
    "ctx.access", "cloudflare:owner-gateway:whoami", "cloudflare:owner-gateway:secret:owner",
    "cloudflare:owner-gateway:secret:assertion", "cloudflare:owner-gateway:deploy",
    "MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET", "MAHORAGA_CLOUD_OWNER_ID",
  ]) assert.match(docs, new RegExp(token.replaceAll(":", "\\:")));
  assert.match(docs, /same assertion secret/i);
  assert.match(docs, /Access[\s\S]*production `workers\.dev` URL/i);
  assert.match(docs, /without `ctx\.access`[\s\S]*403/i);
  assert.doesNotMatch(docs, /MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET\s*=\s*[A-Za-z0-9_-]{32,}/);
});
```
Run:
```powershell
node --test test/cloudflare-owner-gateway-runbook.test.mjs
```
Expected: FAIL because the current document describes the intent but not the pinned commands or the `ctx.access` fail-closed sequence.

- [ ] **Step 2: Add the exact deployment sequence to `docs/CLOUD-ALWAYS-ON-RUNTIME.md`**

Add a `## Cloudflare owner gateway deployment` section with this sequence:

```text
1. `npm run cloudflare:owner-gateway:whoami` must identify the intended Cloudflare account.
2. Confirm Railway production is the canonical `mahoraga-runtime-main` service and `/api/ready` is green at current GitHub `main`.
3. Run `npm run cloudflare:owner-gateway:secret:owner` and enter only the owner identity authorized by the Access policy.
4. Run `npm run cloudflare:owner-gateway:secret:assertion` and enter the same assertion secret configured as Railway `MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET`; never print or commit the value.
5. Run `npm run cloudflare:owner-gateway:deploy`.
6. Protect the exact production `workers.dev` URL for `mahoraga-owner-gateway` with Cloudflare Access and allow only the pinned owner identity.
7. Until Access authenticates the invocation, `ctx.access` is absent and the Worker must return `403 owner-access-required`; a caller-supplied identity header is never sufficient.
8. Authenticate through Access as the owner and verify the Worker reaches the canonical Railway hostname, establishes the normal server-side owner session, and never exposes the HMAC assertion secret.
9. Run `npm run cloudflare:owner-gateway:deployments` and record the deployment/version identifier with the exact Git SHA used for verification.
```

- [ ] **Step 3: Run the docs contract and focused gateway suite**

```powershell
node --test test/cloudflare-owner-gateway-runbook.test.mjs test/cloudflare-owner-gateway-security.test.mjs test/cloudflare-owner-gateway-runtime-origin.test.mjs
```
Expected: PASS with zero failures.

- [ ] **Step 4: Commit Task 4**

```powershell
git add docs/CLOUD-ALWAYS-ON-RUNTIME.md test/cloudflare-owner-gateway-runbook.test.mjs
git commit -m "docs(cloudflare): codify owner gateway deployment"
```
### Task 5: Verify exact head, align secrets, deploy, and prove the live ingress

**Files:**
- No new source files. This task mutates authorized Cloudflare/Railway deployment state and records evidence on the implementation PR.

**Interfaces:**
- Consumes: exact implementation head, Cloudflare OAuth/Wrangler authentication, Cloudflare Access, Railway `mahoraga-runtime-main`, and the gateway scripts from Task 3.
- Produces: a deployed `mahoraga-owner-gateway`, owner-only Access boundary, matching Railway/Cloudflare HMAC assertion secret, and a live acceptance receipt tied to exact source/deployment SHAs.

- [ ] **Step 1: Start from the resolved UI lane and current source authority**

Before creating the implementation branch, require PR #543 to be merged or closed. Then:

```powershell
git fetch origin main
git switch --detach origin/main
git rev-parse HEAD
git status --short
```

Expected: exact current `origin/main`; no CF-1 source changes exist in another active worktree. Generated steward reports may remain dirty only in the old reference checkout and must not be copied into the implementation branch.

- [ ] **Step 2: Run focused verification, then the one required full gate**

```powershell
node --test test/cloudflare-owner-gateway-deployment-contract.test.mjs test/cloudflare-owner-gateway-security.test.mjs test/cloudflare-owner-gateway-runtime-origin.test.mjs test/cloudflare-owner-gateway-runbook.test.mjs test/cloud-always-on-runtime.test.mjs test/github-audit.test.mjs test/dependency-audit.test.mjs
git diff --check
npm run verify
```

Expected: focused suite passes; `git diff --check` is clean; `npm run verify` exits 0 on the exact implementation head.

- [ ] **Step 3: Push the isolated implementation branch and open the PR**

```powershell
git push -u origin feature/cloudflare-control-ingress
```

Open a PR to `main` containing only CF-1 files. Do not bundle #543 UI files or generated runtime reports.
- [ ] **Step 4: Confirm canonical Railway before touching the edge**

Using the connected Railway control plane, confirm:

```text
project: Mahoraga
service: mahoraga-runtime-main
environment: production
latest deployment: SUCCESS
commitHash: exact current GitHub main SHA
```

Then verify the canonical Railway `/api/live` returns 200 and `/api/ready` returns 200 with that same served commit. If source/deployment/runtime provenance disagree, stop CF-1 deployment and reconcile Railway first.

- [ ] **Step 5: Align owner identity and assertion secret without exposing values**

First inspect whether Railway already has `MAHORAGA_CLOUD_OWNER_ID` and `MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET`. Reuse the existing assertion secret if the connected Railway tool can supply it without rendering it to user-visible output. If the secret is unavailable/redacted, rotate once across both providers:

```powershell
$bytes = New-Object byte[] 48
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$assertionSecret = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
```

Keep `$assertionSecret` only in process/tool memory. Pipe it directly into the pinned Cloudflare secret command; do not `Write-Host`, log, commit, or paste it into a PR:

```powershell
$assertionSecret | npx --yes wrangler@4.132.0 secret put MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET --config deploy/cloudflare-owner-gateway/wrangler.toml
```

Set the exact same value as Railway production `MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET` through the connected Railway `set-variables` action. Set `MAHORAGA_CLOUD_OWNER_ID` to the same owner identity in Railway and through `npm run cloudflare:owner-gateway:secret:owner`. If Railway already has both matching values, do not rotate them.
- [ ] **Step 6: Deploy the Worker and immediately bind Cloudflare Access**

Run:
```powershell
npm run cloudflare:owner-gateway:deploy
npm run cloudflare:owner-gateway:deployments
```

Expected: Worker `mahoraga-owner-gateway` deploys successfully under the authenticated account. The Worker is fail-closed without `ctx.access`, so a bare request cannot authenticate by spoofing headers.

In Cloudflare Access, protect the production `workers.dev` URL for this Worker and create an allow policy containing only the pinned owner identity. Do not create a public bypass policy, service-token bypass, or broad email-domain allow rule for CF-1.

- [ ] **Step 7: Prove unauthenticated and authenticated behavior**

From a fresh unauthenticated HTTP client, request the production Worker URL. Expected: Cloudflare Access intercepts the request, or the Worker returns `403 owner-access-required`; it must never forward merely because a caller supplies `cf-access-authenticated-user-email`.

Then authenticate to Cloudflare Access as the pinned owner in the attended browser and request `/api/runtime/session`. Expected chain:

```text
Cloudflare Access authenticated owner
-> Worker ctx.access identity
-> fresh HMAC owner assertion
-> canonical Railway workspace
-> signed HttpOnly owner session
```

Verify the browser receives no HMAC assertion secret and no server credential. Verify Railway remains on the expected exact source SHA.

- [ ] **Step 8: Require exact-head GitHub verification and integrate**

Wait for `Verify Mahoraga` on both required Ubuntu and Windows jobs for the implementation PR head. Do not substitute Codex review, Vercel status, or stale runs. Once the exact head is green and mergeable, squash-merge through the normal protected-main policy.

- [ ] **Step 9: Verify post-merge production truth**

After merge, confirm GitHub `main` advanced to the merge SHA, Railway deploys that exact SHA successfully, `/api/live` and `/api/ready` are 200, and the Access-authenticated Worker still establishes the owner session. Record only content-free identifiers: Git SHA, Railway deployment ID, Cloudflare deployment/version ID, test conclusions, and timestamps.
- [ ] **Step 10: Reconcile the program tracker without overstating completion**

Post the content-free CF-1 evidence to issue #455 and link the implementation PR. State separately whether source, Cloudflare deployment, Railway deployment, live readiness, and authenticated owner-session proof passed. Do not close #455 solely because the edge Worker deployed if the real owner-bound answer acceptance vertical is still incomplete.

## Plan Self-Review Result

- **Spec coverage:** CF-1/F0 is fully covered: owner ingress deployment, secret/identity configuration, Access authentication, forged-header resistance, malformed-origin rejection, canonical Railway forwarding, Wrangler-state hygiene, exact-head CI, and live acceptance evidence. `mahoraga-relay` is intentionally unchanged in this tranche.
- **Scope:** CF-2 objective Durable Objects/Workflows, CF-3 observation, CF-4 #547 failover, CF-5 experience/skill synthesis, and CF-6 differential evolution remain separate implementation plans.
- **Type/interface consistency:** `MAHORAGA_CLOUD_OWNER_ID`, `MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET`, `MAHORAGA_RUNTIME_ORIGIN`, `ctx.access`, and the five pinned package-script names are consistent across tasks.
- **Security:** Caller identity headers are never authority. Missing Access context or secret material fails closed. The plan does not print or commit secret values.
- **Rollout:** Railway remains canonical and Cloudflare can be removed without destroying source authority or canonical objective state.
