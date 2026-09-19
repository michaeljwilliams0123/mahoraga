# GitHub Pages Primary UI and API-Origin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make GitHub Pages publish the real Mahoraga workspace instead of a Railway redirect, and introduce one browser-safe `MAHORAGA_API_ORIGIN` abstraction so later control-plane migration does not require another UI rewrite.

**Architecture:** GitHub remains the canonical source/build/release/UI provider. The static Next.js export is built and deployed only by GitHub Actions. Browser code stops assuming server routes are same-origin by routing health, session, login, action, and artifact requests through one validated public API-origin helper; until the always-on gateway tranche lands, the origin may be unset and cloud execution must fail closed while the existing encrypted relay remains available as its separate recovery path. No secret is embedded in the Pages artifact, and Railway remains untouched as a compatibility runtime during this tranche.

**Tech Stack:** GitHub Pages, GitHub Actions, Next.js 16 static export, React 19, TypeScript 7, Node.js 24, Node test runner, existing `RuntimeRelay`, existing Cloudflare relay recovery path.

**Spec:** `docs/superpowers/specs/2026-09-18-github-pages-sovereign-control-plane-design.md` plus approved priority addendum `docs/superpowers/specs/2026-09-18-github-native-cloud-first-priority.md`

## Global Constraints

- Cloud-first: local devices are execution providers, never a prerequisite for the UI or control plane.
- GitHub-native first: use GitHub for UI hosting, source, CI, releases, artifacts, and bounded event-driven work when the responsibility fits GitHub's product model.
- GitHub Pages remains static/browser-only; do not move server secrets or Node runtime routes into the Pages artifact.
- GitHub Actions remains the only UI build/deployment pipeline in this tranche; do not add Vercel, Railway, Cloudflare Pages, or another UI host.
- Browser code knows one public `MAHORAGA_API_ORIGIN`; it must not embed Railway, localhost, or provider-specific API URLs.
- The API origin is public configuration, never a secret.
- An unset/invalid API origin fails closed for cloud runtime calls; it must not silently choose Railway.
- Preserve owner authentication, CSRF, replay protection, signed assertions, and destructive-action/release boundaries.
- Preserve the encrypted relay as a distinct recovery/provider path; do not reinterpret it as the canonical cloud API.
- Railway is not removed in this tranche and remains rollback/compatibility infrastructure only.
- Required repository checks remain mandatory; no bypass of branch protection.

## File Structure

- `scripts/build-pages-static.mjs` — static export preparation only; no canonical-host redirect logic after this tranche.
- `test/pages-static-build.test.mjs` — contract tests proving the Pages artifact is the real workspace and contains no Railway redirect contract.
- `.github/workflows/pages.yml` — GitHub-native static build/deploy; injects only public UI configuration.
- `cloud-app/lib/api-origin.ts` — new single-purpose public-origin parsing and URL construction helper.
- `cloud-app/test/api-origin.test.mjs` — new focused tests for origin validation and endpoint URL construction.
- `cloud-app/lib/runtime-relay.ts` — cloud session/action/artifact requests use the API-origin helper; encrypted relay WebSocket path remains independent.
- `cloud-app/components/workspace.tsx` — health and direct-owner-login requests use the API-origin helper.
- `cloud-app/next.config.ts` — CSP `connect-src` is derived from the configured public API origin at build time while retaining the encrypted relay origin.
- `cloud-app/test/runtime-relay.test.mjs` — focused request-target contract coverage if an existing test file is present; otherwise create it under `cloud-app/test/`.
- `README.md` — canonical entry wording changes from Railway to GitHub Pages while explicitly labeling Railway as migration fallback.
- `operator-deck/src/lib/fleet/versions.ts` — presentation/host labels stop claiming Railway is the production browser host.
- `test/cloud-app.test.mjs` or the existing workspace contract test that owns host-label assertions — update only the assertions affected by the canonical UI change.

## Review Focus

1. **Malformed API origin** — `javascript:`, `http:`, embedded credentials, paths, query strings, or fragments must be rejected and cloud calls must fail closed.
2. **Unset API origin on Pages** — the UI must still render; cloud runtime attach should report unavailable rather than inventing a Railway/default origin.
3. **GitHub project base path** — static assets and navigation must continue working from `/mahoraga/`, not only `/`.
4. **Credential leakage** — the Pages artifact and workflow must not contain owner secrets, session secrets, assertion secrets, Codex tokens, or runtime bearer tokens.
5. **Recovery isolation** — changing the cloud API origin must not alter the encrypted relay WebSocket origin or silently route attachments/actions over recovery transport.

---

### Task 1: Remove the Railway launcher and make the Pages artifact the actual workspace

**Files:**
- Modify: `test/pages-static-build.test.mjs`
- Modify: `scripts/build-pages-static.mjs`

**Interfaces:**
- Consumes: existing `preparePagesStaticWorkspace`, `linkPagesDependencies`, and Next static export output at `cloud-app/out`.
- Produces: `buildPagesStaticExport()` that leaves the generated `out/index.html` intact; no `pagesLauncherHtml` or `DEFAULT_CANONICAL_WORKSPACE_URL` export remains.

- [ ] **Step 1: Replace the launcher contract with a real-workspace contract**

In `test/pages-static-build.test.mjs`, remove `DEFAULT_CANONICAL_WORKSPACE_URL` and `pagesLauncherHtml` from the import and replace the Railway-launcher test with a source-level/static-export contract:

```js
test("Pages publishes the real workspace and has no Railway launcher contract", async () => {
  const builder = await readFile(new URL("../scripts/build-pages-static.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(builder, /pagesLauncherHtml/);
  assert.doesNotMatch(builder, /DEFAULT_CANONICAL_WORKSPACE_URL/);
  assert.doesNotMatch(builder, /mahoraga-runtime-main-production\.up\.railway\.app/);

  const workflow = await readFile(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8");
  assert.doesNotMatch(workflow, /MAHORAGA_CANONICAL_WORKSPACE_URL/);
  assert.match(workflow, /NEXT_PUBLIC_MAHORAGA_API_ORIGIN/);
});
```

Keep the existing tests that exclude server-only route directories from the static staging workspace.

- [ ] **Step 2: Run the focused test and prove RED**

Run:

```bash
node --test test/pages-static-build.test.mjs
```

Expected: FAIL because the builder still exports launcher symbols, writes a redirect `index.html`, and the workflow still contains `MAHORAGA_CANONICAL_WORKSPACE_URL`.

- [ ] **Step 3: Remove redirect generation from the builder**

In `scripts/build-pages-static.mjs`:

- remove `writeFile` from the `node:fs/promises` import;
- delete `DEFAULT_CANONICAL_WORKSPACE_URL`;
- delete `pagesLauncherHtml()`;
- remove the final line that overwrites `cloud-app/out/index.html`;
- leave the copy from staged Next export to `cloud-app/out` intact.

The end of `buildPagesStaticExport()` should be structurally equivalent to:

```js
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(path.join(stagedApp, "out"), output, { recursive: true });
```

- [ ] **Step 4: Run the focused test again**

Run:

```bash
node --test test/pages-static-build.test.mjs
```

Expected: launcher assertions pass; the workflow assertion remains RED until Task 3.

- [ ] **Step 5: Commit the builder/test boundary**

```bash
git add scripts/build-pages-static.mjs test/pages-static-build.test.mjs
git commit -m "feat(pages): publish real Mahoraga workspace"
```

---

### Task 2: Add one validated public API-origin abstraction

**Files:**
- Create: `cloud-app/lib/api-origin.ts`
- Create: `cloud-app/test/api-origin.test.mjs`

**Interfaces:**
- Consumes: `process.env.NEXT_PUBLIC_MAHORAGA_API_ORIGIN` at build time in browser bundles.
- Produces:
  - `mahoragaApiOrigin(): string | null`
  - `mahoragaApiUrl(pathname: string): string`
  - error code `mahoraga-api-origin-unconfigured` when no origin exists
  - error code `mahoraga-api-origin-invalid` for unsafe values

- [ ] **Step 1: Write origin-validation tests**

Create `cloud-app/test/api-origin.test.mjs` with table-driven coverage. Import the compiled/helper module using the same TypeScript test technique already used by existing `cloud-app/test/*.test.mjs` files; if tests import `.ts` source through the repository's current Node configuration, follow that exact pattern.

Required assertions:

```js
const accepted = [
  ["https://api.example.test", "https://api.example.test"],
  ["https://api.example.test/", "https://api.example.test"],
];

const rejected = [
  "http://api.example.test",
  "javascript:alert(1)",
  "https://user:pass@example.com",
  "https://api.example.test/path",
  "https://api.example.test/?q=1",
  "https://api.example.test/#fragment",
];
```

Also assert:

```js
assert.throws(() => mahoragaApiUrl("api/runtime/session"), /mahoraga-api-path-invalid/);
assert.throws(() => mahoragaApiUrl("https://evil.example/"), /mahoraga-api-path-invalid/);
```

Only absolute pathnames beginning with `/` are valid endpoint inputs.

- [ ] **Step 2: Run the focused test and prove RED**

Run:

```bash
cd cloud-app
node --test test/api-origin.test.mjs
```

Expected: FAIL because `lib/api-origin.ts` does not exist.

- [ ] **Step 3: Implement the helper**

Create `cloud-app/lib/api-origin.ts`:

```ts
const PUBLIC_API_ORIGIN = process.env.NEXT_PUBLIC_MAHORAGA_API_ORIGIN?.trim() ?? "";

export function mahoragaApiOrigin(value = PUBLIC_API_ORIGIN): string | null {
  if (!value) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("mahoraga-api-origin-invalid");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) throw new Error("mahoraga-api-origin-invalid");
  return parsed.origin;
}

export function mahoragaApiUrl(pathname: string, value = PUBLIC_API_ORIGIN): string {
  if (!pathname.startsWith("/") || pathname.startsWith("//") || pathname.includes("://")) {
    throw new Error("mahoraga-api-path-invalid");
  }
  const origin = mahoragaApiOrigin(value);
  if (!origin) throw new Error("mahoraga-api-origin-unconfigured");
  return new URL(pathname, `${origin}/`).href;
}
```

Do not provide a Railway default.

- [ ] **Step 4: Run helper tests**

```bash
cd cloud-app
node --test test/api-origin.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit the helper**

```bash
git add cloud-app/lib/api-origin.ts cloud-app/test/api-origin.test.mjs
git commit -m "feat(ui): add provider-neutral API origin"
```

---

### Task 3: Route cloud browser requests through the API-origin helper

**Files:**
- Modify: `cloud-app/lib/runtime-relay.ts`
- Modify: `cloud-app/components/workspace.tsx`
- Test: `cloud-app/test/runtime-relay.test.mjs` if present; otherwise create `cloud-app/test/api-request-targets.test.mjs`

**Interfaces:**
- Consumes: `mahoragaApiUrl(pathname)` from Task 2.
- Produces: every canonical cloud HTTP request targets the configured API origin; `RELAY_ORIGIN` remains unchanged for encrypted recovery WebSocket transport.

- [ ] **Step 1: Write request-target tests**

Create a focused source/behavior test that requires these mappings:

```text
health   -> /api/health
session  -> /api/runtime/session
login    -> /api/runtime/login
action   -> /api/runtime/action
artifact -> /api/runtime/artifacts
```

The test must also assert that `runtime-relay.ts` still contains:

```text
wss://mahoraga-relay.mahoraga-mjw0123.workers.dev/pair
```

and does **not** derive that WebSocket endpoint from `MAHORAGA_API_ORIGIN`.

If using source-contract assertions, make them narrow:

```js
assert.match(relaySource, /mahoragaApiUrl\("\/api\/runtime\/session"\)/);
assert.match(relaySource, /mahoragaApiUrl\("\/api\/runtime\/action"\)/);
assert.match(relaySource, /mahoragaApiUrl\("\/api\/runtime\/artifacts"\)/);
assert.match(workspaceSource, /mahoragaApiUrl\("\/api\/health"\)/);
assert.match(workspaceSource, /mahoragaApiUrl\("\/api\/runtime\/login"\)/);
```

- [ ] **Step 2: Run the focused test and prove RED**

```bash
cd cloud-app
node --test test/api-request-targets.test.mjs
```

Expected: FAIL because current requests use relative `/api/...` paths.

- [ ] **Step 3: Update `RuntimeRelay` cloud HTTP paths**

Add:

```ts
import { mahoragaApiUrl } from "./api-origin";
```

Change only canonical cloud HTTP fetch targets:

```ts
await fetch(mahoragaApiUrl("/api/runtime/session"), ...)
await fetch(mahoragaApiUrl("/api/runtime/artifacts"), ...)
await fetch(mahoragaApiUrl("/api/runtime/action"), ...)
```

Do not modify `RELAY_ORIGIN`, pairing crypto, relay-session storage, or recovery semantics.

When `mahoragaApiUrl()` throws `mahoraga-api-origin-unconfigured` or `mahoraga-api-origin-invalid`, `attach()` must map it to the existing public `cloud-session-unreachable`/unavailable diagnostic rather than leaking raw configuration text to the UI.

- [ ] **Step 4: Update workspace health and login targets**

Add:

```ts
import { mahoragaApiUrl } from "@/lib/api-origin";
```

Health effect:

```ts
let healthUrl: string;
try {
  healthUrl = mahoragaApiUrl("/api/health");
} catch {
  setHealthError(true);
  setVoiceSupported(voiceSupport().dictation);
  return;
}

fetch(healthUrl, { cache: "no-store", credentials: "include" })
```

Owner login:

```ts
const response = await fetch(mahoragaApiUrl("/api/runtime/login"), {
  method: "POST",
  credentials: "include",
  cache: "no-store",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ ownerPin: ownerLoginPin }),
});
```

Do not introduce any token into browser JavaScript.

- [ ] **Step 5: Run request-target and existing cloud-app tests**

```bash
cd cloud-app
node --test test/api-origin.test.mjs test/api-request-targets.test.mjs test/*.test.mjs
```

Expected: PASS. If an existing test intentionally asserts same-origin relative paths, update only that assertion to the new provider-neutral helper contract.

- [ ] **Step 6: Commit browser request routing**

```bash
git add cloud-app/lib/runtime-relay.ts cloud-app/components/workspace.tsx cloud-app/test
git commit -m "refactor(ui): route cloud calls through one API origin"
```

---

### Task 4: Make CSP accept exactly the configured API origin

**Files:**
- Modify: `cloud-app/next.config.ts`
- Create or modify: `cloud-app/test/next-config.test.mjs`

**Interfaces:**
- Consumes: `NEXT_PUBLIC_MAHORAGA_API_ORIGIN` as a public build-time origin.
- Produces: CSP `connect-src` containing `'self'`, the configured HTTPS API origin when valid, the existing encrypted relay HTTPS/WSS origins, and no Railway default.

- [ ] **Step 1: Write the CSP contract test**

The test must prove:

```js
assert.match(source, /NEXT_PUBLIC_MAHORAGA_API_ORIGIN/);
assert.doesNotMatch(source, /mahoraga-runtime-main-production\.up\.railway\.app/);
assert.match(source, /mahoraga-relay\.mahoraga-mjw0123\.workers\.dev/);
```

Also test the pure helper used to construct `connect-src` if the config is refactored to export one.

- [ ] **Step 2: Run and prove RED**

```bash
cd cloud-app
node --test test/next-config.test.mjs
```

Expected: FAIL because `next.config.ts` does not yet add `NEXT_PUBLIC_MAHORAGA_API_ORIGIN`.

- [ ] **Step 3: Build a validated CSP origin list**

At configuration load, parse `NEXT_PUBLIC_MAHORAGA_API_ORIGIN` using the same constraints as Task 2. Do not silently accept HTTP, credentials, path/query/fragment values.

Construct `connect-src` from:

```text
'self'
https://ai-gateway.vercel.sh            # retain only if still required by existing browser code; remove if code search proves unused
https://mahoraga-relay.mahoraga-mjw0123.workers.dev
wss://mahoraga-relay.mahoraga-mjw0123.workers.dev
<configured MAHORAGA API origin, if present>
```

Do not add `*.railway.app` or wildcard `https:`.

- [ ] **Step 4: Run CSP tests and static build**

```bash
cd cloud-app
node --test test/next-config.test.mjs
MAHORAGA_PAGES_EXPORT=1 NEXT_PUBLIC_MAHORAGA_API_ORIGIN=https://api.example.test npm run build
```

Expected: PASS and static export completes.

- [ ] **Step 5: Commit CSP support**

```bash
git add cloud-app/next.config.ts cloud-app/test/next-config.test.mjs
git commit -m "security(ui): bind CSP to configured Mahoraga API"
```

---

### Task 5: Make the GitHub Pages workflow GitHub-native and configuration-only

**Files:**
- Modify: `.github/workflows/pages.yml`
- Modify: `test/pages-static-build.test.mjs`

**Interfaces:**
- Consumes: GitHub repository/environment variable `MAHORAGA_API_ORIGIN` as non-secret public configuration when available.
- Produces: `NEXT_PUBLIC_MAHORAGA_API_ORIGIN` for the static build; no Railway canonical-workspace redirect variable.

- [ ] **Step 1: Tighten workflow assertions**

Add assertions to `test/pages-static-build.test.mjs`:

```js
assert.match(workflow, /NEXT_PUBLIC_MAHORAGA_API_ORIGIN:\s*\$\{\{ vars\.MAHORAGA_API_ORIGIN \}\}/);
assert.doesNotMatch(workflow, /MAHORAGA_CANONICAL_WORKSPACE_URL/);
assert.doesNotMatch(workflow, /mahoraga-runtime-main-production\.up\.railway\.app/);
assert.match(workflow, /actions\/configure-pages/);
assert.match(workflow, /actions\/upload-pages-artifact/);
assert.match(workflow, /actions\/deploy-pages/);
```

- [ ] **Step 2: Run and prove RED**

```bash
node --test test/pages-static-build.test.mjs
```

Expected: FAIL until workflow variables are updated.

- [ ] **Step 3: Update Pages build environment**

In `.github/workflows/pages.yml`, remove:

```yaml
MAHORAGA_CANONICAL_WORKSPACE_URL: https://mahoraga-runtime-main-production.up.railway.app/
NEXT_PUBLIC_HEALTH_ENDPOINT: /mahoraga/api/health
```

Add:

```yaml
NEXT_PUBLIC_MAHORAGA_API_ORIGIN: ${{ vars.MAHORAGA_API_ORIGIN }}
```

Keep:

```yaml
MAHORAGA_PAGES_EXPORT: "1"
MAHORAGA_DEPLOYMENT_PROVIDER: github-pages
MAHORAGA_DEPLOYMENT_ENV: production
MAHORAGA_DEPLOYMENT_URL: https://michaeljwilliams0123.github.io/mahoraga/
MAHORAGA_GIT_COMMIT_SHA: ${{ github.sha }}
MAHORAGA_GIT_COMMIT_REF: main
```

The build must succeed when the repository variable is unset; runtime cloud attach then fails closed in the UI. This lets the Pages UI ship before the gateway tranche without hard-wiring Railway.

- [ ] **Step 4: Run focused tests**

```bash
node --test test/pages-static-build.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit workflow configuration**

```bash
git add .github/workflows/pages.yml test/pages-static-build.test.mjs
git commit -m "ci(pages): make GitHub Pages the canonical UI build"
```

---

### Task 6: Update canonical host labels without erasing the Railway rollback path

**Files:**
- Modify: `README.md`
- Modify: `operator-deck/src/lib/fleet/versions.ts`
- Modify: the existing test(s) that assert `APP_HOST`, `CLOUD_APP_URL`, `WORKSPACE_NOTE`, or README canonical URL copy.

**Interfaces:**
- Consumes: GitHub Pages canonical URL `https://michaeljwilliams0123.github.io/mahoraga/`.
- Produces: browser-host metadata that says GitHub Pages is the UI host and Railway is a migration fallback/runtime compatibility provider, not the canonical workspace URL.

- [ ] **Step 1: Write/modify host-label assertions**

Require:

```text
APP_HOST = "GitHub Pages"
CLOUD_APP_URL = "https://michaeljwilliams0123.github.io/mahoraga/"
```

and README primary link:

```markdown
[Open Mahoraga](https://michaeljwilliams0123.github.io/mahoraga/)
```

Do not require deleting historical migration documentation that accurately references Railway.

- [ ] **Step 2: Run affected tests and prove RED**

Run the smallest test files owning these assertions, then:

```bash
npm test
```

at repository root if that is the established top-level verification command.

- [ ] **Step 3: Update host metadata and README**

`operator-deck/src/lib/fleet/versions.ts` should use language equivalent to:

```ts
export const APP_HOST = "GitHub Pages";
export const CLOUD_APP_URL = "https://michaeljwilliams0123.github.io/mahoraga/";
export const WORKSPACE_NOTE =
  "GitHub Pages is the canonical browser UI. GitHub remains source/build/release authority. The always-on API/control plane is provider-neutral; Railway is migration fallback only until retirement.";
```

If `CLOUD_APP_URL` is consumed as an execution API anywhere rather than display/navigation metadata, stop and split that execution use to `MAHORAGA_API_ORIGIN` instead of repointing it blindly.

- [ ] **Step 4: Run affected tests**

Expected: PASS with no code path treating the Pages URL as an execution endpoint.

- [ ] **Step 5: Commit canonical-host metadata**

```bash
git add README.md operator-deck/src/lib/fleet/versions.ts test cloud-app/test
git commit -m "docs(ui): make GitHub Pages the canonical workspace"
```

---

### Task 7: Prove the static artifact is safe and functional before deployment

**Files:**
- Modify: `test/pages-static-build.test.mjs`
- Modify: `.github/workflows/pages.yml` only if an explicit artifact-inspection step is needed.

**Interfaces:**
- Consumes: `cloud-app/out` generated by the Pages build.
- Produces: deterministic proof that the deployed artifact contains a real workspace entry point, contains `/mahoraga` assets, and contains no known server secret names or Railway redirect.

- [ ] **Step 1: Add a post-build artifact inspection helper/test**

After building, scan text assets under `cloud-app/out` for forbidden strings:

```text
MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET
MAHORAGA_CLOUD_SESSION_SECRET
MAHORAGA_PRIMARY_CODEX_TOKEN
MAHORAGA_CONTENT_VAULT_MASTER_KEY
mahoraga-runtime-main-production.up.railway.app
location.replace("https://mahoraga-runtime
```

Assert `cloud-app/out/index.html` exists and references the static Next asset tree rather than a meta-refresh redirect.

- [ ] **Step 2: Run a real Pages build**

```bash
cd cloud-app
npm ci
MAHORAGA_PAGES_EXPORT=1 \
MAHORAGA_DEPLOYMENT_PROVIDER=github-pages \
MAHORAGA_DEPLOYMENT_ENV=production \
MAHORAGA_DEPLOYMENT_URL=https://michaeljwilliams0123.github.io/mahoraga/ \
MAHORAGA_GIT_COMMIT_REF=main \
NEXT_PUBLIC_MAHORAGA_API_ORIGIN= \
node ../scripts/build-pages-static.mjs
```

Expected: `cloud-app/out/index.html` is the Next-exported workspace and build succeeds with API origin unset.

- [ ] **Step 3: Inspect artifact**

Run the repository's artifact test/helper. Expected: PASS for entry point, assets, forbidden-secret names, and Railway redirect absence.

- [ ] **Step 4: Repeat with a synthetic valid API origin**

```bash
NEXT_PUBLIC_MAHORAGA_API_ORIGIN=https://api.example.test \
MAHORAGA_PAGES_EXPORT=1 \
node ../scripts/build-pages-static.mjs
```

Expected: artifact contains only the public API origin; no secret values/names are introduced.

- [ ] **Step 5: Commit artifact proof**

```bash
git add test/pages-static-build.test.mjs .github/workflows/pages.yml
git commit -m "test(pages): prove safe static workspace artifact"
```

---

### Task 8: Run exact-head verification and open the implementation PR

**Files:**
- No new product files unless verification exposes a defect.

**Interfaces:**
- Consumes: all previous task commits.
- Produces: reviewable implementation branch/PR with deterministic evidence; no Railway shutdown.

- [ ] **Step 1: Run focused Pages and cloud-app suites**

```bash
node --test test/pages-static-build.test.mjs
cd cloud-app
npm run typecheck
node --test test/*.test.mjs
npm run build
```

Expected: PASS.

- [ ] **Step 2: Run repository-required deterministic Verify locally where supported**

Use the exact commands encoded by the repository's required Verify workflows. Do not substitute an easier subset for a required check.

Expected: PASS on the current implementation head.

- [ ] **Step 3: Push the implementation branch and open a PR to `main`**

PR description must state:

- GitHub Pages now publishes the real UI;
- UI hosting no longer depends on Railway;
- API calls are behind `MAHORAGA_API_ORIGIN`;
- no new UI host was introduced;
- Railway remains untouched as compatibility/rollback runtime;
- cloud API can remain unset until the next gateway tranche;
- encrypted relay recovery is unchanged;
- no secrets are present in the Pages artifact.

- [ ] **Step 4: Wait for the repository's required checks**

Do not merge while either required status check is missing or failing. Diagnose failures on the exact PR head.

- [ ] **Step 5: Merge only after required checks are green**

Use the repository's normal merge policy. Do not bypass branch protection.

- [ ] **Step 6: Verify Pages deployment on merged `main`**

Confirm the Pages workflow deploys the exact merged SHA and `https://michaeljwilliams0123.github.io/mahoraga/` renders the real workspace rather than redirecting to Railway.

Expected at this tranche boundary:

```text
GitHub Pages UI: PRIMARY
GitHub Actions UI deploy: PRIMARY
MAHORAGA_API_ORIGIN: provider-neutral and optionally unset
Railway runtime: UNCHANGED / compatibility fallback
Cloudflare encrypted relay: UNCHANGED recovery provider
Railway shutdown: NOT YET AUTHORIZED
```

---

## Tranche Boundary and Next Plan

This plan deliberately stops before moving the always-on session/action/artifact gateway. That is a separate subsystem and receives its own implementation plan after this tranche is reviewed/green.

The next plan must implement:

1. Cloudflare Worker (or another justified always-on cloud service) as the provider-neutral API/control boundary because GitHub Pages cannot run server-side routes and GitHub-hosted Actions jobs are ephemeral/bounded.
2. A secure cross-origin or same-site authentication design that preserves current owner, CSRF, replay, and origin guarantees; do not weaken them merely to accommodate `github.io`.
3. Migration of the loopback `127.0.0.1:4782` dependency behind a network API/capability contract.
4. Externalization of `/var/lib/mahoraga` replay/throttle/control state.
5. Shadow routing and parity proof before Railway is removed.

## Self-Review

### Spec coverage

This tranche covers the parent spec's Phase 1 and Phase 2 preparation: real Pages UI, GitHub-native deployment, one API-origin abstraction, no Railway canonical browser routing, secret isolation, and rollback preservation. It intentionally does not claim completion of gateway extraction, D1/state migration, durable workflows, provider convergence, or Railway retirement; those are independent plans.

### Placeholder scan

No `TBD`, `TODO`, "implement later", generic error-handling instruction, or undefined neighboring interface is used. Each task names the concrete files, tests, expected failure/pass state, implementation shape, and commit boundary.

### Type consistency

The plan defines and consistently uses `mahoragaApiOrigin(): string | null` and `mahoragaApiUrl(pathname: string): string`. Browser callers use only `mahoragaApiUrl`. `NEXT_PUBLIC_MAHORAGA_API_ORIGIN` is the browser build variable; GitHub Actions reads it from non-secret repository/environment variable `MAHORAGA_API_ORIGIN`.

### Review Focus coverage

- malformed API origin: Task 2 tests;
- unset API origin: Tasks 2, 3, 5, 7;
- `/mahoraga` base path/static export: Tasks 1 and 7;
- secret leakage: Task 7 artifact scan;
- encrypted recovery isolation: Task 3 target tests.
