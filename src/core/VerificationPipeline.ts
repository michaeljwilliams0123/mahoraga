import { webcrypto } from "node:crypto";
import { performance } from "node:perf_hooks";
import { Script } from "node:vm";
import {
  ErrorProfileCode,
  type BrandedASTNode,
  type CanaryProbeReport,
} from "../types/mahoraga.ts";

function isStructurallyValidCandidate(source: string): boolean {
  const candidate = source.trim();
  if (candidate.length === 0 || candidate.includes("undefined_locus")) return false;
  if (!/\bfunction\b/u.test(candidate)) return false;

  try {
    new Script(candidate, { filename: "mahoraga-canary-candidate.js" });
    return true;
  } catch (error) {
    if (error instanceof SyntaxError) return false;
    throw error;
  }
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
    const isVerifiedStable = isStructurallyValidCandidate(candidateSource);
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
      isVerifiedStable,
      computedSignature,
      meanExecutionDeltaMs,
    };
  }
}
