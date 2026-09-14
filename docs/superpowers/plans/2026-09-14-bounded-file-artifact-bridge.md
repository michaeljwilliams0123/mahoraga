# Bounded File Artifact Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move cloud-workspace files through the authenticated same-origin owner gateway into Mahoraga's existing encrypted core artifact store, then pass only artifact IDs through chat so workers can inspect the files without exposing server credentials or pretending local-only staging succeeded.

**Architecture:** Reuse the core `POST /api/artifacts` endpoint and `LocalArtifactStore`; do not create a second artifact system. Add a same-origin binary upload route in the cloud app, protect it with the existing owner-session/CSRF/replay envelope, proxy bytes server-to-server with the existing primary token, and return core artifact metadata. The browser uploads files before chat and passes returned `art-*` IDs in `attachmentIds`. Legacy encrypted-relay sessions remain fail-closed for file creation until a separately designed chunked binary protocol exists; the current 65,536-byte encrypted frame is not used for whole-file base64 transport.

**Tech Stack:** Next.js 16, TypeScript 7, React 19, Node.js >=24, node:test, existing cloud owner gateway, existing `LocalArtifactStore` and content vault.

**Spec:** `docs/superpowers/specs/2026-09-14-primary-controller-readiness-design.md`

## Global Constraints

- Unauthorized paid-provider spend is forbidden.
- Destructive data loss requires owner approval.
- Browser code must never receive `MAHORAGA_PRIMARY_CODEX_TOKEN` or another server credential.
- Preserve same-origin, HttpOnly session, CSRF, request nonce, replay protection, file-count limits, and byte limits.
- Cloud UI limits remain `MAX_FILES = 3`, `MAX_FILE_BYTES = 2 * 1024 * 1024`, and `MAX_TOTAL_FILE_BYTES = 4 * 1024 * 1024`.
- Core artifact IDs remain authoritative; chat transports references rather than file bytes.
- Do not base64 whole files into the existing encrypted relay frame.
- Do not automatically delete successfully uploaded artifacts as compensation for a later chat failure; artifact retention/cleanup remains governed separately.

---

### Task 1: Add a server-only binary core request helper

**Files:**
- Modify: `cloud-app/lib/cloud-owner-gateway.ts`
- Create: `cloud-app/test/cloud-artifact-bridge-contract.test.mjs`

**Interfaces:**
- Produces: `coreArtifactRequest({ name, mimeType, bytes }): Promise<Response>`.
- Core target: fixed `http://127.0.0.1:4782/api/artifacts`.

- [ ] **Step 1: Write the failing source-contract test**

Create `cloud-app/test/cloud-artifact-bridge-contract.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const gatewayPath = new URL("../lib/cloud-owner-gateway.ts", import.meta.url);
const routePath = new URL("../app/api/runtime/artifacts/route.ts", import.meta.url);
const relayPath = new URL("../lib/runtime-relay.ts", import.meta.url);
const workspacePath = new URL("../components/workspace.tsx", import.meta.url);

test("artifact bytes cross a server-only authenticated gateway", async () => {
  const gateway = await readFile(gatewayPath, "utf8");
  const route = await readFile(routePath, "utf8").catch(() => "");
  assert.match(gateway, /export async function coreArtifactRequest/);
  assert.match(gateway, /\/api\/artifacts/);
  assert.match(gateway, /authorization: `Bearer \$\{token\}`/);
  assert.match(route, /authorizeOwnerMutation\(request\)/);
  assert.doesNotMatch(route, /NEXT_PUBLIC_.*TOKEN|MAHORAGA_PRIMARY_CODEX_TOKEN/);
});

test("workspace uploads files then forwards artifact ids", async () => {
  const relay = await readFile(relayPath, "utf8");
  const workspace = await readFile(workspacePath, "utf8");
  assert.match(relay, /async uploadArtifact\(/);
  assert.doesNotMatch(relay, /attachmentIds\.length > 0\) throw relayError\("relay-attachments-local-only"\)/);
  assert.match(workspace, /uploadStagedFiles/);
  assert.match(workspace, /attachmentIds/);
  assert.doesNotMatch(workspace, /bounded core artifact bridge is not connected yet/);
});
```

- [ ] **Step 2: Verify the new contract fails**

Run:

```bash
cd cloud-app
node --test test/cloud-artifact-bridge-contract.test.mjs
```

Expected: FAIL because the helper/route/upload flow do not yet exist.

- [ ] **Step 3: Add the binary proxy helper**

In `cloud-app/lib/cloud-owner-gateway.ts`, add:

```ts
export async function coreArtifactRequest(input: { name: string; mimeType: string; bytes: ArrayBuffer }) {
  const token = required("MAHORAGA_PRIMARY_CODEX_TOKEN");
  return fetch("http://127.0.0.1:4782/api/artifacts", {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": input.mimeType || "application/octet-stream",
      "x-mahoraga-file-name": encodeURIComponent(input.name),
      "x-mahoraga-file-source": "api",
    },
    body: input.bytes,
  });
}
```

Do not export `required()` and do not return the primary token or internal request headers to the browser.

- [ ] **Step 4: Commit the helper with the still-red contract**

Run:

```bash
git add cloud-app/lib/cloud-owner-gateway.ts cloud-app/test/cloud-artifact-bridge-contract.test.mjs
git commit -m "test(cloud): define bounded artifact gateway contract"
```

### Task 2: Add the authenticated same-origin artifact upload route

**Files:**
- Create: `cloud-app/app/api/runtime/artifacts/route.ts`
- Modify: `cloud-app/test/cloud-artifact-bridge-contract.test.mjs`

**Interfaces:**
- Consumes: authenticated owner request, encoded file-name header, MIME type, raw body.
- Produces: the core artifact response or a bounded public error.

- [ ] **Step 1: Add a route-boundary assertion**

Append:

```js
test("artifact route enforces actual byte bounds", async () => {
  const route = await readFile(routePath, "utf8");
  assert.match(route, /MAX_FILE_BYTES/);
  assert.match(route, /arrayBuffer\(\)/);
  assert.match(route, /file-too-large/);
  assert.match(route, /file-name-required/);
});
```

- [ ] **Step 2: Create the route with actual-body validation**

Create `cloud-app/app/api/runtime/artifacts/route.ts`:

```ts
import { authorizeOwnerMutation, coreArtifactRequest, gatewayFailure } from "@/lib/cloud-owner-gateway";
import { MAX_FILE_BYTES } from "@/lib/runtime-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    authorizeOwnerMutation(request);
    const encodedName = request.headers.get("x-mahoraga-file-name") ?? "";
    if (!encodedName) return Response.json({ error: "file-name-required" }, { status: 400 });
    let name: string;
    try { name = decodeURIComponent(encodedName); }
    catch { return Response.json({ error: "file-name-invalid" }, { status: 400 }); }
    if (!name.trim() || name.length > 200) return Response.json({ error: "file-name-invalid" }, { status: 400 });

    const bytes = await request.arrayBuffer();
    if (bytes.byteLength < 1) return Response.json({ error: "file-empty" }, { status: 400 });
    if (bytes.byteLength > MAX_FILE_BYTES) return Response.json({ error: "file-too-large" }, { status: 413 });

    const mimeType = (request.headers.get("content-type") ?? "application/octet-stream").split(";", 1)[0].trim() || "application/octet-stream";
    const result = await coreArtifactRequest({ name, mimeType, bytes });
    const body = await result.json().catch(() => ({ error: "cloud-core-response-invalid" }));
    return Response.json(body, { status: result.status, headers: { "cache-control": "no-store" } });
  } catch (error) {
    const failure = gatewayFailure(error);
    return Response.json({ error: failure.code }, { status: failure.status });
  }
}
```

Do not rely on a browser-supplied `Content-Length` header; the route enforces the actual received byte length.

- [ ] **Step 3: Run contract and typecheck**

Run:

```bash
cd cloud-app
node --test test/cloud-artifact-bridge-contract.test.mjs
npm run typecheck
```

Expected: route assertions pass; workspace-flow assertion remains red until Tasks 3–4.

- [ ] **Step 4: Commit the server boundary**

Run:

```bash
git add cloud-app/app/api/runtime/artifacts/route.ts cloud-app/test/cloud-artifact-bridge-contract.test.mjs
git commit -m "feat(cloud): proxy owner artifact uploads to core"
```

### Task 3: Teach RuntimeRelay to upload artifacts and preserve attachment IDs

**Files:**
- Modify: `cloud-app/lib/runtime-relay.ts`
- Test: `cloud-app/test/cloud-artifact-bridge-contract.test.mjs`

**Interfaces:**
- Produces: `RuntimeArtifact`.
- Produces: `RuntimeRelay.uploadArtifact(file: File): Promise<RuntimeArtifact>`.
- Changes: `RuntimeRelay.chat(input)` forwards supplied `attachmentIds` instead of replacing them with `[]`.

- [ ] **Step 1: Add the artifact type**

```ts
export type RuntimeArtifact = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
};
```

- [ ] **Step 2: Add `uploadArtifact` only for same-origin cloud sessions**

```ts
async uploadArtifact(file: File) {
  if (!this.cloudSession) throw relayError("relay-attachments-local-only");
  const response = await fetch("/api/runtime/artifacts", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: {
      "content-type": file.type || "application/octet-stream",
      "x-mahoraga-file-name": encodeURIComponent(file.name),
      "x-mahoraga-csrf": this.cloudSession.csrf,
      "x-mahoraga-request-nonce": crypto.randomUUID(),
      "x-mahoraga-request-timestamp": String(Date.now()),
    },
    body: file,
  });
  const value = await response.json() as { artifact?: RuntimeArtifact; error?: unknown };
  if (!response.ok || !value.artifact?.id) throw relayError(publicCode(value.error ?? "artifact-upload-failed"));
  return value.artifact;
}
```

- [ ] **Step 3: Preserve artifact references in chat**

Replace `chat()` with:

```ts
async chat(input: JsonObject) {
  const attachmentIds = Array.isArray(input.attachmentIds) ? input.attachmentIds : [];
  return this.call<RuntimeChatResult>("chat", { ...input, attachmentIds });
}
```

- [ ] **Step 4: Run the cloud contract and typecheck**

Run:

```bash
cd cloud-app
node --test test/cloud-artifact-bridge-contract.test.mjs
npm run typecheck
```

Expected: relay assertions pass; the workspace integration assertion remains red.

### Task 4: Replace the workspace staging dead end with upload-then-chat

**Files:**
- Modify: `cloud-app/components/workspace.tsx`
- Test: `cloud-app/test/cloud-artifact-bridge-contract.test.mjs`

**Interfaces:**
- Consumes: `RuntimeRelay.uploadArtifact(file)`.
- Produces: `submitCore(..., attachmentIds): Promise<boolean>`.
- Extends licensed retry state to keep already-uploaded artifact IDs when the user explicitly approves licensed retry.

- [ ] **Step 1: Extend licensed retry state**

Change the state type to:

```ts
const [licensedRetry, setLicensedRetry] = useState<{ text: string; mode: TaskMode; attachmentIds: string[] } | null>(null);
```

- [ ] **Step 2: Add an upload helper**

```ts
async function uploadStagedFiles(transport: RuntimeRelay) {
  const artifacts = [];
  for (const file of files) artifacts.push(await transport.uploadArtifact(file));
  return artifacts.map((artifact) => artifact.id);
}
```

Sequential upload is intentional because the UI permits at most three files.

- [ ] **Step 3: Make `submitCore` return success/failure and accept artifact IDs**

Change its signature to:

```ts
async function submitCore(
  text: string,
  modeOverride: TaskMode = taskMode,
  actionLabel: string | null = null,
  creditPolicy: ChatCreditPolicy = "zero-codex",
  attachmentIds: string[] = [],
): Promise<boolean> {
```

Change every early `return;` to `return false;`. In `transport.chat(...)`, replace `attachmentIds: []` with `attachmentIds`. After `pollRuntime(...)` completes normally, `return true;`. In the catch block, when the error is `zero-credit-provider-unavailable`, store `{ text, mode: modeOverride, attachmentIds }`, then return false. The `finally` block remains responsible for clearing busy/action state.

- [ ] **Step 4: Replace `submit()` with upload-then-submit semantics**

```ts
async function submit() {
  const text = input.trim();
  if ((!text && files.length === 0) || busy) return;
  if (!coreReady) {
    setRuntimeError("Connect Mahoraga before submitting work.");
    return;
  }
  const transport = relay.current;
  if (!transport?.connected) {
    setRuntimeError("The paired Mahoraga brain is not connected.");
    return;
  }
  try {
    const attachmentIds = files.length > 0 ? await uploadStagedFiles(transport) : [];
    const accepted = await submitCore(text || "Inspect the attached file.", taskMode, null, "zero-codex", attachmentIds);
    if (accepted) setFiles([]);
  } catch (caught) {
    setRuntimeError(runtimeErrorMessage(caught instanceof Error ? caught.message : "artifact-upload-failed"));
  }
}
```

This keeps browser-staged files visible when upload or chat submission fails.

- [ ] **Step 5: Preserve artifact IDs through explicit licensed retry**

Change `retryLicensed()` to:

```ts
async function retryLicensed() {
  const saved = licensedRetry;
  if (!saved || runtimeBusy) return;
  setLicensedRetry(null);
  const accepted = await submitCore(saved.text, saved.mode, null, "licensed-approved", saved.attachmentIds);
  if (accepted) setFiles([]);
}
```

The existing user action that triggers `retryLicensed()` remains the explicit paid-provider approval boundary; no automatic paid retry is introduced.

- [ ] **Step 6: Add the bounded upload error copy**

Add to `runtimeErrorMessage`:

```ts
"artifact-upload-failed": "Mahoraga could not store the file in the bounded core artifact vault. The file remains staged in this browser and was not submitted with the request.",
```

- [ ] **Step 7: Run the complete cloud app gate**

Run:

```bash
cd cloud-app
npm run verify
```

Expected: typecheck, node tests, and Next build pass.

- [ ] **Step 8: Commit browser integration**

Run:

```bash
git add cloud-app/lib/runtime-relay.ts cloud-app/components/workspace.tsx cloud-app/test/cloud-artifact-bridge-contract.test.mjs
git commit -m "feat(workspace): send files through bounded artifact bridge"
```

### Task 5: Prove core upload-to-chat integrity

**Files:**
- Modify: `test/chat-runtime.test.mjs`
- Inspect: `src/server.mjs`
- Inspect: `src/local-artifact-store.mjs`

**Interfaces:**
- Consumes: existing `POST /api/artifacts`, artifact metadata integrity, `/api/chat` `attachmentIds` resolution.
- Produces: a runtime regression proving the uploaded artifact is resolved by ID before chat execution.

- [ ] **Step 1: Add the upload half of the runtime regression**

Use the existing authenticated runtime fixture in `test/chat-runtime.test.mjs`:

```js
const bytes = Buffer.from("bounded artifact bridge proof", "utf8");
const upload = await fetch(`${base}/api/artifacts`, {
  method: "POST",
  headers: {
    ...authorization,
    "content-type": "text/plain",
    "x-mahoraga-file-name": encodeURIComponent("bridge-proof.txt"),
    "x-mahoraga-file-source": "api",
  },
  body: bytes,
});
assert.equal(upload.status, 201);
const { artifact } = await upload.json();
assert.match(artifact.id, /^art-[a-f0-9-]+$/);
assert.equal(artifact.sizeBytes, bytes.length);
```

- [ ] **Step 2: Submit chat with the returned artifact ID**

Use the same test's existing `/api/chat` authentication and a request body containing:

```js
attachmentIds: [artifact.id]
```

Assert the accepted conversation/task evidence references `artifact.id`; also assert no second artifact ID is synthesized during chat.

- [ ] **Step 3: Run focused core tests**

Run:

```bash
node --test --test-isolation=none test/chat-runtime.test.mjs test/local-artifact-store.test.mjs
```

Expected: PASS.

### Task 6: Verify, deploy, and run live file canaries

**Files:**
- Create after observed proof: `docs/readiness/file-artifact-bridge-evidence.md`

**Interfaces:**
- Consumes: cloud verify, root verify, exact-head CI, canonical Railway.
- Produces: durable file/artifact readiness evidence.

- [ ] **Step 1: Run both verification gates**

Run from repository root:

```bash
npm run verify
npm --prefix cloud-app run verify
```

Expected: both exit 0.

- [ ] **Step 2: Merge exact-head green work and converge canonical production**

Merge through the repository's normal gate only after exact-head Verify is green. Deploy/promote only `mahoraga-runtime-main`; verify its deployed source SHA equals merged `main`.

- [ ] **Step 3: Run a real browser file canary**

Upload a small text file through the cloud workspace and ask Mahoraga to inspect it. Expected: upload returns an `art-*` reference, chat accepts that reference, Mahoraga produces file-derived evidence, and the prior local-staging blocker is absent.

- [ ] **Step 4: Run bounded negative canaries**

Use controlled test inputs for an empty file and a file larger than 2 MiB. Expected: fail before task submission with `file-empty` or `file-too-large`; no false success is displayed.

- [ ] **Step 5: Record observed evidence**

Create `docs/readiness/file-artifact-bridge-evidence.md` containing the observed main SHA, exact CI conclusions, canonical deployment ID/SHA, live artifact ID and SHA-256, positive canary result, negative boundary results, whether any paid invocation occurred, and the final `GREEN` or `AMBER` classification. Never invent a missing value.
