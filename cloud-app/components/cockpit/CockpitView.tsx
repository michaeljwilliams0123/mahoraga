"use client";

import { useEffect, useState } from "react";
import { Activity, GitBranch, Link2, ShieldCheck } from "lucide-react";
import { projectInteractionReadiness, projectZeroCreditAdmission } from "@/lib/interaction-readiness";
import { projectCognitiveLearningSurface } from "@/lib/cognitive-learning-surface";
import type { CollectiveDissentReceipt } from "@/lib/dissent-receipt";
import type { CockpitViewProps, HardZeroQuotaAction, HardZeroQuotaReceipt, Health, SanitizedAcceptanceReceipt } from "../workspace/workspace-types";
import { DissentReceiptPanel } from "./DissentReceiptPanel";

const CLOUDFLARE_WORKSPACE_CANDIDATE = "https://mahoraga-workspace-candidate.mahoraga-mjw0123.workers.dev";
const EXPECTED_PROVIDER_ID = "cloudflare-workers-ai";
const EXPECTED_MODEL_ID = "@cf/zai-org/glm-4.7-flash";
type ReadinessObservation = { status: string; sha: string | null; durableState: string | null };
const HARD_ZERO_ACTIONS = new Set<HardZeroQuotaAction>([
  "dispatch-hard-zero",
  "quota-hold-until-utc-reset",
  "resume-queued",
  "refuse-paid-route",
]);

function parseReadinessObservation(value: unknown): ReadinessObservation | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.status !== "string") return null;
  return {
    status: candidate.status,
    sha: typeof candidate.sha === "string" ? candidate.sha : null,
    durableState: typeof candidate.durableState === "string" ? candidate.durableState : null,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function firstBoolean(...values: unknown[]): boolean | undefined {
  for (const value of values) {
    if (typeof value === "boolean") return value;
  }
  return undefined;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function parseSanitizedAcceptance(health: Health | null): SanitizedAcceptanceReceipt & { bypassApplied: boolean } {
  const root = asRecord(health);
  const nested = [
    root,
    asRecord(root?.acceptance),
    asRecord(root?.productionAcceptance),
    asRecord(root?.cloudflareAcceptance),
    asRecord(root?.receipt),
    asRecord(root?.runtime),
    asRecord(asRecord(root?.runtime)?.acceptance),
  ].filter((value): value is Record<string, unknown> => value !== null);

  const providerCognitionVerified = firstBoolean(...nested.map((entry) => entry.providerCognitionVerified)) === true;
  const noRailwayFallbackVerified = firstBoolean(...nested.map((entry) => entry.noRailwayFallbackVerified)) === true;
  const trafficAuthorityVerified = firstBoolean(...nested.map((entry) => entry.trafficAuthorityVerified)) === true;
  const bypassApplied = firstBoolean(...nested.map((entry) => entry["x-bypass-applied"])) === true;
  const providerId = firstString(...nested.map((entry) => entry.providerId));
  const modelId = firstString(...nested.map((entry) => entry.modelId));

  return {
    providerCognitionVerified: providerCognitionVerified && !bypassApplied,
    noRailwayFallbackVerified: noRailwayFallbackVerified && !bypassApplied,
    trafficAuthorityVerified,
    providerId,
    modelId,
    "x-bypass-applied": bypassApplied,
    bypassApplied,
  };
}
