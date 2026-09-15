import { authorizeOwnerMutation, coreArtifactRequest, gatewayFailure } from "@/lib/cloud-owner-gateway";
import { MAX_FILE_BYTES } from "@/lib/runtime-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    authorizeOwnerMutation(request);
    const bytes = await readBoundedBytes(request, MAX_FILE_BYTES);
    const name = decodeFileName(request.headers.get("x-mahoraga-file-name"));
    const mimeType = normalizedMime(request.headers.get("content-type"));
    const source = "picker";
    const response = await coreArtifactRequest({ name, mimeType, source, bytes });
    const value = await response.json().catch(() => null);
    if (!response.ok || !validReceipt(value)) throw routeError("cloud-artifact-receipt-invalid", 502);
    return Response.json({ artifactId: value.artifact.id }, {
      status: 201,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const failure = gatewayFailure(error);
    return Response.json({ error: failure.code }, {
      status: failure.status,
      headers: { "cache-control": "no-store" },
    });
  }
}
async function readBoundedBytes(request: Request, maximumBytes: number) {
  if (!request.body) throw routeError("cloud-artifact-empty", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      size += value.byteLength;
      if (size > maximumBytes) throw routeError("cloud-artifact-too-large", 413);
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (size < 1) throw routeError("cloud-artifact-empty", 400);
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
function decodeFileName(value: string | null) {
  if (!value) throw routeError("cloud-artifact-name-required", 400);
  try {
    const decoded = decodeURIComponent(value).trim();
    if (!decoded) throw new Error("empty");
    return decoded;
  } catch {
    throw routeError("cloud-artifact-name-invalid", 400);
  }
}

function normalizedMime(value: string | null) {
  return (value ?? "application/octet-stream").split(";", 1)[0].trim() || "application/octet-stream";
}

function validReceipt(value: unknown): value is { artifact: { id: string } } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const artifact = (value as { artifact?: unknown }).artifact;
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) return false;
  const id = (artifact as { id?: unknown }).id;
  return typeof id === "string" && /^art-[a-f0-9-]+$/.test(id);
}

function routeError(code: string, status: number) {
  return Object.assign(new Error(code), { status });
}
