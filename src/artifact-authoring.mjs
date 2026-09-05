import path from "node:path";
import { ARTIFACT_MIME_POLICY } from "./artifact-contract.mjs";

const ALLOWED_ENCODINGS = new Set(["utf8", "base64"]);
const TEXT_MIME_TYPES = new Set(["application/json", "text/csv", "text/markdown", "text/plain"]);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

export async function executeArtifactAuthoringCapability(capability, task, dependencies = {}) {
  if (capability !== "artifact.create") fail("unsupported-capability");
  const store = dependencies.store;
  if (!store || typeof store.put !== "function") fail("artifact-store-unavailable");

  const spec = task?.artifact;
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) fail("artifact-authoring-input-invalid");
  const name = String(spec.name ?? "").trim();
  const mimeType = String(spec.mimeType ?? "").trim().toLowerCase();
  const encoding = String(spec.encoding ?? "").trim().toLowerCase();
  const content = spec.content;
  const policy = ARTIFACT_MIME_POLICY[mimeType];
  if (!policy) fail("artifact-authoring-mime-forbidden");

  const extension = path.extname(name).toLowerCase();
  if (!policy.extensions.includes(extension)) fail("artifact-authoring-extension-mismatch");
  if (!ALLOWED_ENCODINGS.has(encoding) || typeof content !== "string") fail("artifact-authoring-encoding-invalid");
  if (!TEXT_MIME_TYPES.has(mimeType) && encoding !== "base64") fail("artifact-authoring-binary-base64-required");

  let bytes;
  if (encoding === "base64") {
    const normalized = content.replace(/\s+/g, "");
    if (!normalized || normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) fail("artifact-authoring-base64-invalid");
    bytes = Buffer.from(normalized, "base64");
    if (bytes.toString("base64") !== normalized) fail("artifact-authoring-base64-invalid");
  } else {
    bytes = Buffer.from(content, "utf8");
  }

  if (!Number.isSafeInteger(bytes.length) || bytes.length < 1 || bytes.length > policy.maxBytes) fail("artifact-authoring-size-invalid");
  const stored = await store.put({ name, mimeType, bytes, source: "api" });
  return {
    verified: true,
    artifactCreated: true,
    summary: `Created artifact ${stored.name}.`,
    artifact: stored,
    authoringReceipt: {
      storage: "existing-local-artifact-store",
      preservationMode: "additive-no-delete-rename",
      contentEchoed: false,
    },
  };
}
