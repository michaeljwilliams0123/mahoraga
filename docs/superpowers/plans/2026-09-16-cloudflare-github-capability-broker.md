# Cloudflare GitHub Capability Broker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authorized Cloudflare-hosted Mahoraga workers perform bounded GitHub repository mutations through short-lived GitHub App installation tokens, canonical Mahoraga authority, runtime policy, idempotency, verification, and content-minimized receipts.

**Architecture:** Add a pure policy/envelope layer, a GitHub App token minter, and an injected GitHub API broker core that can run inside a dedicated Cloudflare Worker. The canonical Mahoraga runtime admits repository capabilities before broker execution; the broker never widens the admitted repository/branch/path/action scope and never exposes credentials. The first tranche proves private-repo read, branch creation, one bounded file write, PR create/update, verified merge, replay suppression, and fail-closed direct-write denial.

**Tech Stack:** Node.js >=24 ESM, Node test runner, Web Crypto RS256/HMAC, GitHub REST API 2022-11-28, GitHub App installation tokens, Cloudflare Workers/Wrangler 4.132.0, existing Mahoraga `AuthorityDecision`, capability registry/UCF, release-baseline verification.

**Spec:** `docs/superpowers/specs/2026-09-16-cloudflare-github-capability-broker-design.md`

## Global Constraints

- GitHub `main` remains canonical source authority; no credential trick may bypass repository rulesets, required checks, or required review.
- Railway remains the canonical execution core for Mahoraga admission/authority until separately superseded.
- Use a dedicated GitHub App installed only on approved repositories; do not use a long-lived PAT as the normal broker credential.
- GitHub App private key, App ID, installation ID, dispatch secret, and installation tokens remain server-side and never enter Git, browser storage, receipts, prompts, or model output.
- Missing, malformed, stale, expired, or unverifiable policy/authority fails closed before token minting.
- Direct write is narrower than branch+PR work; `main` direct write remains `verified-only` and GitHub protection is authoritative.
- Existing owner gateway stays owner ingress/identity projection only; do not place GitHub App credentials or generic repository execution in `deploy/cloudflare-owner-gateway/worker.mjs`.
- Every mutation must have an objective ID, action ID, idempotency key, authority decision reference, bounded target, expiry, attempt limit, and verification contract.
- Duplicate idempotency keys must not repeat an external GitHub mutation.
- First tranche profiles are Observe, Builder, and Integrator. Operator, Maintainer, broad direct-write, runtime policy editing, and elevated-session UI are follow-on tranches.
- Preserve deterministic/zero-marginal routing defaults and existing release-baseline/verification gates.

---

## File Structure

- Create `src/github-capability-policy.mjs` — parse, validate, freeze, and evaluate versioned GitHub broker policy.
- Create `src/github-capability-envelope.mjs` — canonical request/receipt schemas, hashing, expiry and idempotency validation.
- Create `src/github-app-auth.mjs` — RS256 GitHub App JWT and scoped installation-token minting.
- Create `src/github-capability-broker.mjs` — admitted GitHub REST operations, replay suppression, verification, sanitized errors, receipts.
- Create `deploy/cloudflare-github-capability-broker/worker.mjs` — Cloudflare HTTP adapter only; authenticate dispatch and call broker core.
- Create `deploy/cloudflare-github-capability-broker/wrangler.toml` — dedicated Worker config and secret declarations.
- Create `scripts/github-capability-canary.mjs` — bounded live acceptance canary; no secrets printed.
- Modify `src/capability-registry.mjs` and `mahoraga.manifest.json` — register broker capabilities as deterministic Cloudflare routes without replacing the existing local repository worker.
- Modify `package.json` — focused tests, Wrangler deploy/status commands, live canary command.
- Modify `src/repair.mjs` and refresh `state/release-baseline/**` — protect new core files after verification.
- Add focused tests under `test/` for every new unit and cross-unit contract.

---

### Task 1: Canonical policy and mutation envelope

**Files:**
- Create: `src/github-capability-policy.mjs`
- Create: `src/github-capability-envelope.mjs`
- Create: `test/github-capability-policy.test.mjs`
- Create: `test/github-capability-envelope.test.mjs`

**Interfaces:**
- Produces `validateGithubCapabilityPolicy(value, { now }) -> frozen policy`.
- Produces `evaluateGithubCapabilityPolicy(policy, request, { now }) -> { allowed, profile, reason, permissions, directWrite }`.
- Produces `createGithubCapabilityEnvelope(input, { now }) -> frozen envelope`.
- Produces `validateGithubCapabilityEnvelope(value, { now }) -> frozen envelope`.
- Produces `githubCapabilityRequestDigest(envelope) -> lowercase sha256 hex`.
- Capability names in tranche 1: `github.repo.read`, `github.branch.create`, `github.contents.write`, `github.pr.write`, `github.pr.merge`.

- [ ] **Step 1: Write failing policy tests** covering Observe/Builder/Integrator inheritance, exact repository match, branch globs, path globs, expiry, maximum actions, `verified-only` main handling, and denial of unknown capability/profile fields.

```js
const policy = validateGithubCapabilityPolicy(fixturePolicy(), { now: NOW });
assert.equal(evaluateGithubCapabilityPolicy(policy, request({ capability: "github.contents.write", path: "docs/a.md" }), { now: NOW }).allowed, true);
assert.equal(evaluateGithubCapabilityPolicy(policy, request({ capability: "github.contents.write", path: "src/authority-decision.mjs", directWrite: true }), { now: NOW }).reason, "path-out-of-scope");
```

- [ ] **Step 2: Run RED**

Run: `node --test --test-isolation=none test/github-capability-policy.test.mjs`
Expected: FAIL because `src/github-capability-policy.mjs` does not exist.

- [ ] **Step 3: Implement strict policy validation/evaluation** with exact-key validation, maximum lengths/counts, immutable output, profile capability sets, glob matching limited to repository paths/branches, and fail-closed unknowns. Do not accept executable regex or arbitrary callbacks from policy data.

- [ ] **Step 4: Write failing envelope tests** proving canonical key order/digest stability, expiry rejection, duplicate/oversized paths rejection, authority decision mismatch rejection, and required `expectedSourceSha` for `github.pr.merge` and verified direct writes.

```js
const envelope = createGithubCapabilityEnvelope({
  objectiveId: "obj-1",
  actionId: "act-1",
  idempotencyKey: "idem-1",
  capability: "github.branch.create",
  repository: "michaeljwilliams0123/mahoraga",
  head: "automation/obj-1",
  authorityDecision: allowDecision("github.branch.create"),
  expiresAt: "2026-09-16T15:00:00.000Z",
  maximumAttempts: 2,
  verification: { kind: "source-sha", required: true },
}, { now: NOW });
assert.match(githubCapabilityRequestDigest(envelope), /^[a-f0-9]{64}$/);
```

- [ ] **Step 5: Implement envelope schema and digest** using deterministic JSON projection; reject authority decisions unless `kind === "authority-decision-v1"`, `decision === "allow"`, `request.capability === envelope.capability`, and the authority timing has not expired.

- [ ] **Step 6: Run GREEN**

Run: `node --test --test-isolation=none test/github-capability-policy.test.mjs test/github-capability-envelope.test.mjs`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/github-capability-policy.mjs src/github-capability-envelope.mjs test/github-capability-policy.test.mjs test/github-capability-envelope.test.mjs
git commit -m "feat(github): define broker policy and mutation envelope"
```

---

### Task 2: GitHub App JWT and least-privilege installation tokens

**Files:**
- Create: `src/github-app-auth.mjs`
- Create: `test/github-app-auth.test.mjs`

**Interfaces:**
- Produces `createGithubAppJwt({ appId, privateKeyPem, now, cryptoImpl }) -> Promise<string>`.
- Produces `mintGithubInstallationToken({ appId, privateKeyPem, installationId, repository, permissions, fetchImpl, now }) -> Promise<{ token, expiresAt, installationId, permissions }>`.
- Token material is returned only to the broker call frame and must never be included in thrown error text.

- [ ] **Step 1: Write RED tests** with an injected fake `crypto.subtle`/fetch path that asserts RS256 JWT claims (`iat`, `exp <= iat + 600`, `iss`), the installation-token URL, single-repository restriction, exact minimum permissions, and sanitized 401/403/429 failures.

```js
assert.deepEqual(body.repositories, ["mahoraga"]);
assert.deepEqual(body.permissions, { contents: "write", metadata: "read", pull_requests: "write" });
assert.equal(result.installationId, "12345");
assert.equal(JSON.stringify(result).includes("PRIVATE KEY"), false);
```

- [ ] **Step 2: Run RED**

Run: `node --test --test-isolation=none test/github-app-auth.test.mjs`
Expected: FAIL because auth module is missing.

- [ ] **Step 3: Implement PEM-to-PKCS8 import and RS256 JWT signing** with Web Crypto only; validate App/installation IDs and keep JWT lifetime <=10 minutes.

- [ ] **Step 4: Implement permission projection** from admitted capability to minimum GitHub App installation-token permissions:
  - read: `metadata:read`, `contents:read`;
  - branch/write: `metadata:read`, `contents:write`;
  - PR create/update/merge: add `pull_requests:write`;
  - verification reads: `checks:read`, `actions:read` only when required.

- [ ] **Step 5: Implement token minting** against `POST /app/installations/{installation_id}/access_tokens`, passing `repositories:[repoName]` and projected `permissions`; accept only a bounded token string and future ISO expiry; sanitize provider bodies before errors.

- [ ] **Step 6: Run GREEN**

Run: `node --test --test-isolation=none test/github-app-auth.test.mjs`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/github-app-auth.mjs test/github-app-auth.test.mjs
git commit -m "feat(github): mint scoped GitHub App installation tokens"
```

---

### Task 3: Broker core, GitHub actions, idempotency, and receipts

**Files:**
- Create: `src/github-capability-broker.mjs`
- Create: `test/github-capability-broker.test.mjs`

**Interfaces:**
- Produces `createGithubCapabilityBroker({ policy, mintToken, fetchImpl, receiptStore, now })`.
- Broker exposes `execute({ envelope }) -> Promise<mutationReceipt>`.
- `receiptStore` contract: `get(idempotencyKey)`, `put(idempotencyKey, receipt)`; tranche-1 Cloudflare adapter supplies Durable Object/KV-backed storage, tests use an in-memory Map.
- Receipt kind: `github-mutation-receipt-v1` with objective/action IDs, capability, repository, bounded target summary, pre/post identifiers, profile, installation ID, status class, verification, timestamps, latency, and replay disposition.

- [ ] **Step 1: Write RED tests** for each action with fake GitHub REST responses:
  - `github.repo.read`: GET repo metadata/default branch/head only;
  - `github.branch.create`: read base ref then POST git ref;
  - `github.contents.write`: PUT one bounded path with expected blob SHA / branch;
  - `github.pr.write`: create or update PR only for admitted head/base;
  - `github.pr.merge`: re-read PR head, required checks, expected source SHA, then merge.

- [ ] **Step 2: Add denial/recovery tests** asserting policy denial happens before `mintToken`, source mismatch does not retry, branch protection 403 maps to `branch-protection-denied`, 429 maps to `rate-limited`, and replay returns the stored receipt without another fetch/mutation.

- [ ] **Step 3: Run RED**

Run: `node --test --test-isolation=none test/github-capability-broker.test.mjs`
Expected: FAIL because broker module is missing.

- [ ] **Step 4: Implement action-specific GitHub client calls** inside the broker; no generic arbitrary-method/arbitrary-URL escape hatch. Build every URL from the validated `owner/repo` plus action-specific bounded fields.

- [ ] **Step 5: Implement verification-before-merge**: fetch PR, require current head SHA equals `envelope.expectedSourceSha`, require configured required check contexts to be successful, and call merge with the expected head SHA. If GitHub rejects protection, preserve the concrete denial in the receipt and do not weaken checks.

- [ ] **Step 6: Implement receipt sanitation and replay suppression**. Store only content-minimized metadata; never store file contents, response bodies, auth headers, JWTs, or installation tokens.

- [ ] **Step 7: Run GREEN**

Run: `node --test --test-isolation=none test/github-capability-broker.test.mjs`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/github-capability-broker.mjs test/github-capability-broker.test.mjs
git commit -m "feat(github): execute admitted repository mutations"
```

---

### Task 4: Register broker capabilities in Mahoraga authority/routing truth

**Files:**
- Modify: `mahoraga.manifest.json`
- Modify: `src/capability-registry.mjs` only if projected cloud routes require a context adapter; prefer manifest registration if sufficient.
- Create: `test/github-capability-route.test.mjs`

**Interfaces:**
- Add worker ID `cloudflare-github-broker` with tranche-1 capabilities, `costClass:"deterministic"`, `executionPlane:"cloudflare"`, `interfaceType:"native-api"`, `permissionClass:"bounded-repository-write"`, `requiresAttendedDesktop:false`, and `authorityScopesByCapability` mapped to existing `repo.write` / `pr.manage` scopes.
- Broker route is not routable unless readiness evidence says the Cloudflare Worker and GitHub App installation are verified.

- [ ] **Step 1: Write RED route tests** proving the new capabilities appear in `buildCapabilityRegistry`, remain non-routable with stale/unknown readiness, require the correct owner authority scopes, and do not remove or supersede the existing local `repository` worker.

- [ ] **Step 2: Run RED**

Run: `node --test --test-isolation=none test/github-capability-route.test.mjs`
Expected: FAIL because the broker worker/capabilities are absent.

- [ ] **Step 3: Add the manifest worker** and capability canary declarations. Use write canary TTL already defined by `truthContracts.capabilityReadiness.writeCanaryTtlMs`; do not invent a second freshness policy.

- [ ] **Step 4: Extend capability projection only if necessary** so Cloudflare broker readiness can be supplied as observed provider/canary evidence without hard-coding GitHub special cases into the router.

- [ ] **Step 5: Run GREEN plus authority regression**

Run: `node --test --test-isolation=none test/github-capability-route.test.mjs test/authority-decision.test.mjs test/capability-registry.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add mahoraga.manifest.json src/capability-registry.mjs test/github-capability-route.test.mjs
git commit -m "feat(router): register Cloudflare GitHub broker capabilities"
```

---

### Task 5: Dedicated Cloudflare broker Worker and private dispatch boundary

**Files:**
- Create: `deploy/cloudflare-github-capability-broker/worker.mjs`
- Create: `deploy/cloudflare-github-capability-broker/wrangler.toml`
- Create: `test/cloudflare-github-capability-broker.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Worker accepts only `POST /v1/github/capability` and `GET /health`.
- Mutation POST requires bounded HMAC transport headers: `x-mahoraga-dispatch-timestamp`, `x-mahoraga-dispatch-nonce`, `x-mahoraga-dispatch-signature`; signature covers method, path, timestamp, nonce, and SHA-256 of raw body using secret `MAHORAGA_GITHUB_BROKER_DISPATCH_SECRET`.
- Required protected bindings: `MAHORAGA_GITHUB_APP_ID`, `MAHORAGA_GITHUB_APP_PRIVATE_KEY`, `MAHORAGA_GITHUB_INSTALLATION_ID`, `MAHORAGA_GITHUB_BROKER_DISPATCH_SECRET`.
- Policy is loaded from a bounded Worker variable/file payload and validated on every cold-start/version load; invalid policy returns 503 and never mints a token.

- [ ] **Step 1: Write RED Worker tests** by importing the Worker module and injecting env/fetch. Prove wrong method/path, stale timestamp, replayed nonce, bad signature, malformed envelope, or invalid policy cannot reach token minting/GitHub fetch.

- [ ] **Step 2: Add a positive Worker test** that signs one Builder envelope, receives a sanitized receipt, and proves the response does not contain JWT/token/private-key fragments.

- [ ] **Step 3: Run RED**

Run: `node --test --test-isolation=none test/cloudflare-github-capability-broker.test.mjs`
Expected: FAIL because deployment module is missing.

- [ ] **Step 4: Implement the Worker adapter** as a thin wrapper over shared modules. Keep nonce replay state in a Durable Object or bounded persistent store; do not keep replay truth only in isolate memory.

- [ ] **Step 5: Add Wrangler config** with dedicated Worker name `mahoraga-github-capability-broker`, compatibility date matching current Cloudflare baseline, secret declarations only, no secret values, and no reuse of the owner-gateway Worker name.

- [ ] **Step 6: Add package scripts**:

```json
"cloudflare:github-broker:deploy": "npx --yes wrangler@4.132.0 deploy --config deploy/cloudflare-github-capability-broker/wrangler.toml",
"cloudflare:github-broker:deployments": "npx --yes wrangler@4.132.0 deployments list --config deploy/cloudflare-github-capability-broker/wrangler.toml",
"github-broker:canary": "node scripts/github-capability-canary.mjs"
```

- [ ] **Step 7: Run GREEN**

Run: `node --test --test-isolation=none test/cloudflare-github-capability-broker.test.mjs`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add deploy/cloudflare-github-capability-broker package.json test/cloudflare-github-capability-broker.test.mjs
git commit -m "feat(cloudflare): add private GitHub capability broker worker"
```

---

### Task 6: Bounded live canary and deployment runbook

**Files:**
- Create: `scripts/github-capability-canary.mjs`
- Create: `docs/CLOUDFLARE-GITHUB-BROKER.md`
- Create: `test/github-capability-canary.test.mjs`

**Interfaces:**
- Canary command: `node scripts/github-capability-canary.mjs --repo michaeljwilliams0123/mahoraga --base <exact-main-sha>`.
- Default canary creates `automation/cloudflare-broker-canary-<short-id>`, writes only `state/canaries/cloudflare-github-broker/<id>.json`, opens a draft PR, verifies resulting branch/PR metadata, then closes the PR and deletes the branch if cleanup is authorized.
- Canary must not merge by default. A separate `--verify-merge <pr>` mode may test Integrator behavior only on an explicitly designated disposable acceptance PR.

- [ ] **Step 1: Write RED canary tests** for deterministic envelope creation, exact-main binding, allowed canary path, no secret logging, fail-closed dirty/stale base, and explicit cleanup behavior.

- [ ] **Step 2: Implement the canary client** using the broker HTTP endpoint and dispatch HMAC from protected environment variables. Print only receipt IDs, branch/PR identifiers, verification state, and sanitized failure reason.

- [ ] **Step 3: Document GitHub App setup** with repository-only installation and minimum permissions for tranche 1: Contents read/write, Pull requests read/write, Metadata read, Checks read, Actions read. Do not request Administration or Secrets permissions.

- [ ] **Step 4: Document Cloudflare secret setup** and exact deployment order. Secret values must be entered through Wrangler/Cloudflare secret commands or dashboard bindings, never committed or echoed.

- [ ] **Step 5: Add negative live acceptance procedure**: attempt an envelope targeting a forbidden path such as `src/authority-decision.mjs` with `directWrite:true`; expected result is `path-out-of-scope` before any GitHub mutation/token use.

- [ ] **Step 6: Run focused tests**

Run: `node --test --test-isolation=none test/github-capability-canary.test.mjs`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/github-capability-canary.mjs docs/CLOUDFLARE-GITHUB-BROKER.md test/github-capability-canary.test.mjs
git commit -m "test(cloudflare): add GitHub broker live acceptance canary"
```

---

### Task 7: Release baseline, repair coverage, and exact-head verification

**Files:**
- Modify: `src/repair.mjs`
- Modify/generated: `state/release-baseline/**`
- Modify only if required: `scripts/github-audit.mjs`
- Modify: `package.json` verify target only if focused tests are not automatically included by the existing test glob.

**Interfaces:**
- New broker source, deploy config, tests, scripts, and docs must be represented consistently in release-baseline/repair truth according to current repository conventions.
- No `.wrangler/`, secret file, private key, token, canary runtime output, or local Cloudflare cache enters the baseline.

- [ ] **Step 1: Add RED repair/baseline assertions** proving the new security-critical modules are essential and Cloudflare cache/secret material is excluded.

- [ ] **Step 2: Update `src/repair.mjs` essential paths** for the broker core and deployment contract; mirror only files required by current release-baseline policy.

- [ ] **Step 3: Refresh baseline**

Run: `npm run baseline:refresh`
Expected: generated baseline contains byte-identical approved source/config/docs and no runtime secrets/cache.

- [ ] **Step 4: Run focused broker suite**

```bash
node --test --test-isolation=none \
  test/github-capability-policy.test.mjs \
  test/github-capability-envelope.test.mjs \
  test/github-app-auth.test.mjs \
  test/github-capability-broker.test.mjs \
  test/github-capability-route.test.mjs \
  test/cloudflare-github-capability-broker.test.mjs \
  test/github-capability-canary.test.mjs
```

Expected: 0 failures.

- [ ] **Step 5: Run repository verification**

Run: `npm run verify`
Expected: 0 failures; only existing documented platform skips are allowed.

- [ ] **Step 6: Run diff hygiene and secret scan**

```bash
git diff --check
git grep -n -E "BEGIN (RSA |)PRIVATE KEY|gh[pousr]_[A-Za-z0-9_]+|github_pat_" -- . ':!test/fixtures/**'
```

Expected: `git diff --check` clean; secret scan finds no real credential material.

- [ ] **Step 7: Commit verified baseline**

```bash
git add src/repair.mjs state/release-baseline package.json scripts/github-audit.mjs
git commit -m "chore(release): protect GitHub broker baseline"
```

---

### Task 8: Live activation and first real Cloudflare → GitHub round trip

**Files:**
- No source edits unless live evidence exposes a concrete defect; defects get their own RED test before repair.
- Record bounded evidence in the PR description/comment or existing content-minimized acceptance-evidence location; never commit credentials or raw private responses.

**Interfaces:**
- Required live sequence: exact GitHub `main` SHA -> verified Cloudflare broker deployment -> GitHub App installation identity -> Observe read -> Builder branch/write/draft-PR -> replay check -> forbidden direct-write denial -> optional Integrator merge on a disposable verified acceptance PR.

- [ ] **Step 1: Reconcile exact head** between the implementation branch, required CI, and intended deployment artifact. Do not deploy a stale local checkout.

- [ ] **Step 2: Configure Cloudflare protected bindings** for App ID, App private key, installation ID, and broker dispatch secret without printing values.

- [ ] **Step 3: Deploy broker Worker**

Run: `npm run cloudflare:github-broker:deploy`
Expected: deployment succeeds and `npm run cloudflare:github-broker:deployments` identifies the new exact deployment version.

- [ ] **Step 4: Run Observe acceptance** against the private `michaeljwilliams0123/mahoraga` repository and verify only bounded metadata is returned.

- [ ] **Step 5: Run Builder canary** to create the canary branch, bounded canary file, and draft PR; verify GitHub attributes the mutation to the dedicated GitHub App installation identity rather than the human owner.

- [ ] **Step 6: Replay the exact same idempotency key** and verify no second branch/file/PR mutation occurs; receipt must report replay suppression.

- [ ] **Step 7: Run forbidden direct-write canary** and verify `path-out-of-scope`/`policy-denied` occurs before token mint/mutation.

- [ ] **Step 8: If an explicit disposable acceptance PR is available, run Integrator merge** only after required checks are successful and expected head SHA matches. Otherwise record Integrator live merge as pending rather than manufacturing a bypass.

- [ ] **Step 9: Re-run `npm run verify` on the exact source head used for deployment evidence** and record the GitHub/Cloudflare identifiers needed to reconcile the acceptance transaction.

- [ ] **Step 10: Commit only source/test/doc fixes discovered by acceptance**, each with a failing regression test first. Do not commit live secrets, tokens, Cloudflare caches, or raw provider payloads.

---

## Plan Self-Review

- Spec coverage: Tasks 1-8 cover policy profiles, typed envelopes, App credentials, short-lived scoped tokens, repository read/branch/write/PR/merge, authority/routing integration, direct-write denial, replay suppression, receipts, Cloudflare deployment, live private-repo proof, failure classes, and existing protection boundaries.
- Deferred by design: Operator/Maintainer expansion, runtime policy-editing UI, broad positive direct-write support, elevated-session UI, and Queue/Workflow fan-out remain follow-on tranches after the first real vertical is proven.
- Placeholder scan: no TBD/TODO implementation placeholders; every task has concrete interfaces, tests, commands, and expected outcomes.
- Type consistency: all tasks use the same tranche-1 capability names and `github-mutation-receipt-v1`; the broker consumes `github-capability-envelope` carrying canonical `authority-decision-v1` evidence.
