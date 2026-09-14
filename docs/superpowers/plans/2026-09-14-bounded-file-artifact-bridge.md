# Bounded File Artifact Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move cloud-workspace files through the authenticated same-origin owner gateway into Mahoraga's existing encrypted core artifact store, then pass only artifact IDs through chat so workers can inspect the files without exposing server credentials or pretending local-only staging succeeded.

**Architecture:** Reuse the core `POST /api/artifacts` endpoint and `LocalArtifactStore`; do not create a second artifact system. Add a same-origin binary upload route in the cloud app, protect it with the existing owner-session/CSRF/replay envelope, proxy bytes server-to-server with the existing primary token, and return core artifact metadata. The browser uploads files before chat, passes returned `art-*` IDs in `attachmentIds`, and retains staged files when any upload or chat step fails. Legacy encrypted-relay sessions remain fail-closed for file creation until a separately designed chunked binary protocol exists; the current 65,536-byte encrypted frame is not used for whole-file base64 transport.

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
- Do not delete successfully uploaded artifacts as an automatic compensation step unless reference safety is proven; orphan cleanup is a separate retention concern.

---

### Task 1: Add a server-only binary core request helper

**Files:**
- Modify: `cloud-app/lib/cloud-owner-gateway.ts`
- Test: `cloud-app/test/cloud-artifact-bridge-contract.test.mjs`

**Interfaces:**
- Consumes: `MAHORAGA_PRIMARY_CODEX_TOKEN`, fixed core origin `http://127.0.0.1:4782`, file name, MIME type, byte body.
- Produces: `coreArtifactRequest({ name, mimeType, bytes }): Promise<Response>`.

- [ ] **Step 1: Write the source-contract test before implementation**

Create `cloud-app/test/cloud-artifact-bridge-contract.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const gatewayPath = new URL("../lib/cloud-owner-gateway.ts", import.meta.url);
const routePath = new URL("../app/api/runtime/artifacts/route.ts", import.meta.url);
const relayPath = new URL("../lib/runtime-relay.ts", import.meta.url);
const workspacePath = new URL("../components/workspace.tsx", import.meta.url);

test("cloud artifact bridge keeps the primary token server-side and proxies raw bytes", async () => {
  const gateway = await readFile(gatewayPath, "utf8");
  const route = await readFile(routePath, "utf8").catch(() => "");
  assert.match(gateway, /export async function coreArtifactRequest/);
  assert.match(gateway, /\/api\/artifacts/);
  assert.match(gateway, /authorization: `Bearer \$\{token\}`/);
  assert.match(route, /authorizeOwnerMutation\(request\)/);
  assert.doesNotMatch(route, /NEXT_PUBLIC_.*TOKEN|MAHORAGA_PRIMARY_CODEX_TOKEN/);
});

test("workspace uploads files before chat and forwards artifact ids", async () => {
  const relay = await readFile(relayPath, "utf8");
  const workspace = await readFile(workspacePath, "utf8");
  assert.match(relay, /async uploadArtifact\(/);
  assert.doesNotMatch(relay, /attachmentIds\.length > 0\) throw relayError\("relay-attachments-local-only"\)/);
  assert.match(workspace, /uploadArtifact/);
  assert.match(workspace, /attachmentIds/);
  assert.doesNotMatch(workspace, /bounded core artifact bridge is not connected yet/);
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
cd cloud-app
npm test -- --test-name-pattern="cloud artifact bridge|workspace uploads files"
```

Expected: FAIL because the route and helper do not exist and the workspace still contains the local-only blocker.

- [ ] **Step 3: Add the binary proxy helper**

In `cloud-app/lib/cloud-owner-gateway.ts`, add:

```ts
export async function coreArtifactRequest(input: { name: string; mimeType: string; bytes: ArrayBuffer }) {
  const token = required("MAHORAGA_PRIMARY_CODEX_TOKEN");
  const response = await fetch("http://127.0.0.1:4782/api/artifacts", {
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
  return response;
}
```

Do not export `required()` and do not return the token or request headers to the browser.

- [ ] **Step 4: Run the first source-contract test**

Run:

```bash
cd cloud-app
node --test test/cloud-artifact-bridge-contract.test.mjs
```

Expected: the helper assertions pass; route/workspace assertions still fail until later tasks.

### Task 2: Add the authenticated same-origin artifact upload route

**Files:**
- Create: `cloud-app/app/api/runtime/artifacts/route.ts`
- Modify: `cloud-app/test/cloud-artifact-bridge-contract.test.mjs`

**Interfaces:**
- Consumes: authenticated owner request, `x-mahoraga-file-name`, `content-type`, raw body.
- Produces: `{ artifact: { id, name, mimeType, sizeBytes, sha256, source, createdAt, storageClass, vaultReference } }` from core, or bounded public error.

- [ ] **Step 1: Extend the failing route contract**

Add to the contract test:

```js
test("artifact route enforces cloud file bounds", async () => {
  const route = await readFile(routePath, "utf8");
  assert.match(route, /MAX_FILE_BYTES/);
  assert.match(route, /content-length/);
  assert.match(route, /file-too-large/);
  assert.match(route, /file-name-required/);
});
```

- [ ] **Step 2: Create the route**

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
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > MAX_FILE_BYTES) return Response.json({ error: "file-too-large" }, { status: 413 });
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

- [ ] **Step 3: Run the cloud contract test and typecheck**

Run:

```bash
cd cloud-app
node --test test/cloud-artifact-bridge-contract.test.mjs
npm run typecheck
```

Expected: route contract passes; typecheck passes.

- [ ] **Step 4: Commit the server bridge boundary**

Run:

```bash
git add cloud-app/lib/cloud-owner-gateway.ts cloud-app/app/api/runtime/artifacts/route.ts cloud-app/test/cloud-artifact-bridge-contract.test.mjs
git commit -m "feat(cloud): bridge owner file uploads to core artifacts"
```

### Task 3: Teach RuntimeRelay to upload artifacts and preserve attachment IDs

**Files:**
- Modify: `cloud-app/lib/runtime-relay.ts`
- Test: `cloud-app/test/cloud-artifact-bridge-contract.test.mjs`

**Interfaces:**
- Produces: `RuntimeArtifact` and `RuntimeRelay.uploadArtifact(file: File): Promise<RuntimeArtifact>`.
- Changes: `RuntimeRelay.chat(input)` forwards supplied `attachmentIds` unchanged instead of forcing `[]`.

- [ ] **Step 1: Add the artifact type**

Add near other runtime types:

```ts
export type RuntimeArtifact = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
};
```

- [ ] **Step 2: Add `uploadArtifact` using the same owner envelope style as `call()`**

Add to `RuntimeRelay`:

```ts
async uploadArtifact(file: File) {
  if (!this.cloudSession) throw relayError("relay-attachments-local-only");
  const response = await fetch("/api/runtime/artifacts", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: {
      "content-type": file.type || "application/octet-stream",
      "content-length": String(file.size),
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

- [ ] **Step 3: Stop discarding valid artifact references**

Replace `chat()` with:

```ts
async chat(input: JsonObject) {
  const attachmentIds = Array.isArray(input.attachmentIds) ? input.attachmentIds : [];
  return this.call<RuntimeChatResult>("chat", { ...input, attachmentIds });
}
```

No file bytes travel through `chat()`.

- [ ] **Step 4: Run cloud tests and typecheck**

Run:

```bash
cd cloud-app
node --test test/cloud-artifact-bridge-contract.test.mjs
npm run typecheck
```

Expected: PASS.

### Task 4: Replace the UI staging dead end with upload-then-chat

**Files:**
- Modify: `cloud-app/components/workspace.tsx`
- Test: `cloud-app/test/cloud-artifact-bridge-contract.test.mjs`

**Interfaces:**
- Consumes: `RuntimeRelay.uploadArtifact(file)`.
- Produces: `submitCore(text, mode, actionLabel, creditPolicy, attachmentIds)` and successful chat with core artifact references.

- [ ] **Step 1: Add an upload helper inside `Workspace`**

Add:

```ts
async function uploadStagedFiles(transport: RuntimeRelay) {
  const artifacts = [];
  for (const file of files) artifacts.push(await transport.uploadArtifact(file));
  return artifacts.map((artifact) => artifact.id);
}
```

Sequential upload is intentional because the UI currently allows at most three files and bounded sequencing simplifies failure evidence.

- [ ] **Step 2: Replace the early local-only return in `submit()`**

Implement:

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
    await submitCore(text || "Inspect the attached file.", taskMode, null, "zero-codex", attachmentIds);
    setFiles([]);
  } catch (caught) {
    setRuntimeError(runtimeErrorMessage(caught instanceof Error ? caught.message : "artifact-upload-failed"));
  }
}
```

- [ ] **Step 3: Extend `submitCore` with artifact IDs**

Change the signature to:

```ts
async function submitCore(
  text: string,
  modeOverride: TaskMode = taskMode,
  actionLabel: string | null = null,
  creditPolicy: ChatCreditPolicy = "zero-codex",
  attachmentIds: string[] = [],
) {
```

Then include `attachmentIds` in the existing `transport.chat(...)` payload. Do not serialize `File` objects into chat.

- [ ] **Step 4: Add a public error message for upload failure**

In `runtimeErrorMessage`, add:

```ts
"artifact-upload-failed": "Mahoraga could not store the file in the bounded core artifact vault. The file remains staged in this browser and was not submitted with the request.",
```

- [ ] **Step 5: Run the cloud app gate**

Run:

```bash
cd cloud-app
npm run verify
```

Expected: typecheck, cloud tests, and Next build all pass.

- [ ] **Step 6: Commit the browser integration**

Run:

```bash
git add cloud-app/lib/runtime-relay.ts cloud-app/components/workspace.tsx cloud-app/test/cloud-artifact-bridge-contract.test.mjs
git commit -m "feat(workspace): send files through bounded artifact bridge"
```

### Task 5: Prove core upload-to-chat attachment integrity

**Files:**
- Test: `test/chat-runtime.test.mjs`
- Inspect: `src/server.mjs`
- Inspect: `src/local-artifact-store.mjs`

**Interfaces:**
- Consumes: existing `POST /api/artifacts`, artifact metadata integrity, `/api/chat` `attachmentIds` resolution.
- Produces: regression proving a stored artifact is the same metadata object attached to the chat/task path.

- [ ] **Step 1: Add a runtime integration test**

Use the existing runtime fixture in `test/chat-runtime.test.mjs` to:

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

Then submit chat with `attachmentIds: [artifact.id]` and assert the accepted conversation/task evidence references the same artifact ID. Use the fixture's existing authenticated chat helper rather than inventing a second authentication path.

- [ ] **Step 2: Run the focused integration tests**

Run:

```bash
node --test --test-isolation=none test/chat-runtime.test.mjs test/local-artifact-store.test.mjs
```

Expected: PASS.

### Task 6: Full verification and live file canary

**Files:**
- Create after observed proof: `docs/readiness/file-artifact-bridge-evidence.md`

**Interfaces:**
- Consumes: cloud verify, root verify, exact-head CI, canonical Railway.
- Produces: durable evidence for file/artifact readiness.

- [ ] **Step 1: Run both verification gates**

Run:

```bash
npm run verify
cd cloud-app && npm run verify
```

Expected: both exit 0.

- [ ] **Step 2: Merge only exact-head green work and deploy canonical production**

Confirm GitHub required verification is green for the exact head, merge through the normal gate, and converge only `mahoraga-runtime-main` to merged `main`.

- [ ] **Step 3: Run a real browser file canary**

Upload a small text file through the cloud workspace and ask Mahoraga to inspect it.

Expected: upload returns an `art-*` reference; the request is accepted with that attachment; Mahoraga produces a verified file-derived result; the prior “staged locally” blocker is absent.

- [ ] **Step 4: Run bounded negative canaries**

Try one empty file and one file larger than 2 MiB through controlled test inputs.

Expected: fail before task submission with `file-empty` or `file-too-large`; no false success is shown.

- [ ] **Step 5: Write observed evidence**

Record the actual Git SHA, CI runs, canonical Railway deployment ID, uploaded artifact ID, SHA-256, positive canary status, negative canary status, and final `GREEN` or `AMBER` result in `docs/readiness/file-artifact-bridge-evidence.md`.
