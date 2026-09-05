import { readFile } from "node:fs/promises";
import path from "node:path";
import { validateTrustEpoch } from "./sovereign-evolution.mjs";

export const INCUMBENT_EPOCH_PATH = "state/incumbent-trust-epoch.json";
export const SOVEREIGN_RECEIPT_DIRECTORY = "coordination/sovereign-receipts";

export function parseIncumbentTrustEpoch(source) {
  const value = typeof source === "string" ? JSON.parse(source) : source;
  return validateTrustEpoch(value);
}

export async function readIncumbentTrustEpochFile(root) {
  if (typeof root !== "string" || root.length === 0) fail("incumbent-epoch-root-invalid");
  const source = await readFile(path.join(root, INCUMBENT_EPOCH_PATH), "utf8");
  return parseIncumbentTrustEpoch(source);
}

export function selectSovereignReceiptPath(changedFiles = []) {
  if (!Array.isArray(changedFiles)) fail("sovereign-receipt-files-invalid");
  const receipts = [...new Set(
    changedFiles
      .map((file) => typeof file === "string" ? file : file?.filename)
      .filter((file) => typeof file === "string"
        && file.startsWith(`${SOVEREIGN_RECEIPT_DIRECTORY}/`)
        && file.endsWith(".json")
        && !file.includes("..")),
  )];
  if (receipts.length === 0) return null;
  if (receipts.length > 1) fail("sovereign-receipt-ambiguous");
  return receipts[0];
}

export function attachIncumbentSovereignEvidence(pullRequest, { trustedEpoch = null, sovereignEvolution = null } = {}) {
  if (!pullRequest || typeof pullRequest !== "object" || Array.isArray(pullRequest)) fail("sovereign-evidence-pull-request-invalid");
  let epoch = null;
  if (trustedEpoch != null) epoch = parseIncumbentTrustEpoch(trustedEpoch);
  return Object.freeze({
    ...pullRequest,
    trustedEpoch: epoch,
    sovereignEvolution: sovereignEvolution ?? null,
  });
}

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}
