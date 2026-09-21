import { webcrypto } from "node:crypto";
import { performance } from "node:perf_hooks";
import {
  ErrorProfileCode,
  type BrandedASTNode,
  type CanaryProbeReport,
} from "../types/mahoraga.ts";

function isBalanced(source: string, open: string, close: string): boolean {
  let depth = 0;
  for (const character of source) {
    if (character === open) depth += 1;
    if (character === close) {
      depth -= 1;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

function isStructurallyValidCandidate(source: string): boolean {
  const candidate = source.trim();
  if (candidate.length === 0 || candidate.includes("undefined_locus")) return false;
  if (!/\bfunction\b/u.test(candidate)) return false;
  if (!candidate.includes("(") || !candidate.includes(")") || !candidate.includes("{") || !candidate.includes("}")) {
    return false;
  }
  return isBalanced(candidate, "(", ")") && isBalanced(candidate, "{", "}");
}

export class VerificationPipeline {
  public static async evaluatePreRollbackCanary(
    candidateSource: BrandedASTNode,
    maxAllowedCpuDeltaMs: number,
  ): Promise<CanaryProbeReport> {
    if (!Number.isFinite(maxAllowedCpuDeltaMs) || maxAllowedCpuDeltaMs <= 0) {
      throw new Error(`[${ErrorProfileCode.CPU_THROTTLING_LIMIT_EXCEEDED}] Invalid canary CPU threshold.`);
    }

    const profilingStart = performance.now();
    const textBytes = new TextEncoder().encode(candidateSource);
    const signatureBuffer = await webcrypto.subtle.digest("SHA-256", textBytes);
    const computedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const meanExecutionDeltaMs = performance.now() - profilingStart;

    if (meanExecutionDeltaMs > maxAllowedCpuDeltaMs) {
      throw new Error(
        `[${ErrorProfileCode.CPU_THROTTLING_LIMIT_EXCEEDED}] Canary verification overhead breached control threshold.`,
      );
    }

    return {
      isVerifiedStable: isStructurallyValidCandidate(candidateSource),
      computedSignature,
      meanExecutionDeltaMs,
    };
  }
}
