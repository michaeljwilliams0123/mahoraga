export type AdaptationTier = "Level4_Innovator" | "Level7_TechnologicalHorizon";

export const ErrorProfileCode = {
  UNRESOLVED_AST_LOCUS: "ERR_MAHORAGA_AST_001",
  COMPILATION_SIGNATURE_MISMATCH: "ERR_MAHORAGA_COMP_002",
  CPU_THROTTLING_LIMIT_EXCEEDED: "ERR_MAHORAGA_CPU_003",
  MICROSOFT_AUTH_GATEWAY_DENIED: "ERR_MAHORAGA_MSFT_004",
  UNIVERSAL_ROUTER_ROUTE_DRIFT: "ERR_MAHORAGA_UCF_005",
} as const;

export type ErrorProfileCode = (typeof ErrorProfileCode)[keyof typeof ErrorProfileCode];

export interface DefendedPhenomenon {
  profileCode: ErrorProfileCode;
  signature: string;
  observedAt: number;
  occurrences: number;
  mitigated: boolean;
}

export type ExecutionEnvironment =
  | { runtime: "CloudflareWorker"; kvBindingName: string }
  | { runtime: "GitHubActionsRunner"; workspaceRoot: string; runId: string }
  | { runtime: "WindowsDesktopNative"; userProfilePath: string };

export interface AuthorityDecisionEnvelope {
  decisionId: string;
  authorizedOwnerId: string;
  isZeroCreditEligible: boolean;
  allocatedComputeTimeMs: number;
  timestamp: number;
}

export interface CognitiveStateSchema {
  tier: AdaptationTier;
  wheelRotations: number;
  activeImmunities: DefendedPhenomenon[];
  lastStableCheckpointHash: string;
}

export type BrandedASTNode = string & { readonly __astBrand: unique symbol };

export interface MutationDirective {
  targetFunctionLocus: string;
  errorContext: DefendedPhenomenon;
  injectedSafetyAssertion: string;
}

export interface CanaryProbeReport {
  isVerifiedStable: boolean;
  computedSignature: string;
  meanExecutionDeltaMs: number;
}
