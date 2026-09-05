import path from "node:path";
import { ARTIFACT_MIME_POLICY } from "./artifact-contract.mjs";

const ALLOWED_ENCODINGS = new Set(["utf8", "base64"]);

export async function executeArtifactAuthoringCapability(capability, task, dependencies = {}) {
  if (capability !== "artifact.create") {
    const error = new Error("unsupported-capability");
    error.code = "unsupported-capability";
    throw error;
  }
  const store = dependencies.store;
  if (!store || typeof store.put !== "function") {
    const error = new Error("artifact-store-unavailable");
    error.code = "artifact-store-unavailable";
    throw error;
  }
  const spec = task?.artifact;
  if (!spec || typeof spec !== "object") {
    const error = new Error("artifact-authoring-input-invalid");
    error.code = "artifact-authoring-input-invalid";
    throw error;
  }
  const name = String(spec.name ?? "");
  const mimeType = String(spec.mimeType ?? "");
  const encoding = String(spec.encoding ?? "");
  const content = spec.content;
  const policy = ARTIFACT_MIME_POLICY[mimeType];
  if (!policy) {
    const error = new Error("artifact-authoring-mime-forbidden");
    error.code = "artifact-authoring-mime-forbidden";
    throw error;
  }
  const ext = path.extname(name).toLowerCase();
  if (!policy.extensions.includes(ext)) {
    const error = new Error("artifact-authoring-extension-mismatch");
    error.code = "artifact-authoring-extension-mismatch";
    throw error;
  }
  if (!ALLOWED_ENCODINGS.has(encoding) || typeof content !== "string") {
    const error = new Error("artifact-authoring-encoding-invalid");
    error.code = "artifact-authoring-encoding-invalid";
    throw error;
  }
  const bytes = encoding === "base64" ? Buffer.from(content, "base64") : Buffer.from(content, "utf8");
  if (!Number.isSafeInteger(bytes.length) || bytes.length < 1 || bytes.length > policy.maxBytes) {
    const error = new Error("artifact-authoring-size-invalid");
    error.code = "artifact-authoring-size-invalid";
    throw error;
  }
  const stored = await store.put({
    name,
    mimeType,
    bytes,
    source: "api",
    taskId: task?.id ?? null,
  });
  return {
    verified: true,
    artifactCreated: true,
    summary: `Created artifact ${stored.name}.`,
    artifact: stored,
  };
}
