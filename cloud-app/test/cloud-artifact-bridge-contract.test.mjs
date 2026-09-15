import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

const root = new URL("../", import.meta.url);
const read = (file) => readFile(new URL(file, root), "utf8");
const dataModule = (source) => `data:text/javascript,${encodeURIComponent(source)}`;

async function loadArtifactRoute() {
  const source = await read("app/api/runtime/artifacts/route.ts");
  const gateway = `
    export function authorizeOwnerMutation(request) {
      if (request.headers.get("x-test-auth") === "ok") return { ownerId: "owner" };
      const error = new Error("cloud-owner-auth-required"); error.status = 401; throw error;
    }
    export async function coreArtifactRequest(input) {
      globalThis.__artifactCall = { ...input, bytes: input.bytes.byteLength };
      const body = globalThis.__artifactResponse ?? { artifact: { id: "art-abc123" } };
      const status = globalThis.__artifactStatus ?? 201;
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    }
    export function gatewayFailure(error) { return { code: error.message, status: error.status ?? 503 }; }
  `;
  const config = `export const MAX_FILE_BYTES = 4;`;
  const isolated = stripTypeScriptTypes(source
    .replace('"@/lib/cloud-owner-gateway"', JSON.stringify(dataModule(gateway)))
    .replace('"@/lib/runtime-config"', JSON.stringify(dataModule(config))));
  return import(`${dataModule(isolated)}#${Date.now()}-${Math.random()}`);
}

function uploadRequest(bytes, headers = {}) {
  return new Request("https://example.test/api/runtime/artifacts", {
    method: "POST",
    headers: {
      "x-test-auth": "ok",
      "content-type": "text/plain",
      "x-mahoraga-file-name": encodeURIComponent("evidence.txt"),
      "x-mahoraga-file-source": "picker",
      ...headers,
    },
    body: Uint8Array.from(bytes),
  });
}

test("artifact route authenticates and enforces the actual received byte ceiling", async () => {
  const { POST } = await loadArtifactRoute();
  let response = await POST(uploadRequest([1], { "x-test-auth": "no" }));
  assert.equal(response.status, 401);

  response = await POST(uploadRequest([1, 2, 3, 4, 5], { "content-length": "1" }));
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error, "cloud-artifact-too-large");
});
test("artifact route forwards bounded bytes and fails closed on malformed core receipts", async () => {
  const { POST } = await loadArtifactRoute();
  globalThis.__artifactResponse = { artifact: { id: "art-feed1234", name: "private.txt" } };
  globalThis.__artifactStatus = 201;

  let response = await POST(uploadRequest([1, 2, 3, 4]));
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { artifactId: "art-feed1234" });
  assert.deepEqual(globalThis.__artifactCall, {
    name: "evidence.txt",
    mimeType: "text/plain",
    source: "picker",
    bytes: 4,
  });

  globalThis.__artifactResponse = { artifact: { id: "not-an-artifact" } };
  response = await POST(uploadRequest([1]));
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error, "cloud-artifact-receipt-invalid");
  delete globalThis.__artifactResponse;
  delete globalThis.__artifactStatus;
  delete globalThis.__artifactCall;
});

test("server-only artifact forwarding keeps the primary token out of the browser route", async () => {
  const [route, gateway] = await Promise.all([
    read("app/api/runtime/artifacts/route.ts"),
    read("lib/cloud-owner-gateway.ts"),
  ]);
  assert.match(route, /authorizeOwnerMutation\(request\)/);
  assert.match(route, /MAX_FILE_BYTES/);
  assert.match(route, /coreArtifactRequest/);
  assert.doesNotMatch(route, /MAHORAGA_PRIMARY_CODEX_TOKEN/);
  assert.match(gateway, /MAHORAGA_PRIMARY_CODEX_TOKEN/);
  assert.match(gateway, /127\.0\.0\.1:4782\/api\/artifacts/);
  assert.match(gateway, /authorization: `Bearer \$\{token\}`/);
});

test("same-origin runtime uploads files and forwards artifact ids without widening relay authority", async () => {
  const [relay, workspace] = await Promise.all([
    read("lib/runtime-relay.ts"),
    read("components/workspace.tsx"),
  ]);

  assert.match(relay, /async uploadArtifact\(file: File\)/);
  assert.match(relay, /\/api\/runtime\/artifacts/);
  assert.match(relay, /if \(!this\.cloudSession\).*relay-attachments-local-only/s);
  assert.match(relay, /!this\.cloudSession.*Array\.isArray\(input\.attachmentIds\)/s);
  assert.match(workspace, /transport\.uploadArtifact/);
  assert.match(workspace, /\(!text && attachments\.length === 0\)/);
  assert.match(workspace, /attachmentIds/);
  assert.match(workspace, /setFiles\(\[\]\)/);
  assert.doesNotMatch(workspace, /bounded core artifact bridge is not connected yet/);
});
