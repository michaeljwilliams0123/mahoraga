import type { ComponentType, Dispatch, ReactNode, RefObject, SetStateAction } from "react";
import type { RuntimeCapability, RuntimeRelay } from "@/lib/runtime-relay";

export type TaskMode = "auto" | "ask" | "act";
export type RelayState = "unpaired" | "resuming" | "pairing" | "connected" | "error";
export type BrainState = "Connecting" | "Ready" | "Idle" | "Awake" | "Degraded" | "Offline";
export type ChatCreditPolicy = "zero-codex" | "licensed-approved";
export type WorkspaceMessage = { id: string; role: "assistant" | "user"; text: string; instantLocal?: boolean };
export type WorkspaceView = "chat" | "work" | "files" | "advanced";
export type QuickActionId = "upload" | "build" | "report" | "handoff" | "create" | "ship";
export type QuickAction = {
  id: QuickActionId;
  label: string;
  description: string;
  prompt?: string;
  mode?: TaskMode;
  requiresCore?: boolean;
};

export type Health = {
  ok: boolean;
  product?: string;
  version?: string;
  build?: { version?: string };
  deployment?: { provider?: string; environment?: string; url?: string | null; commitSha?: string | null; expectedCommitSha?: string | null; gitRef?: string | null; promotion?: string | null };
  runtime?: { databaseTarget?: { basename?: string | null; source?: string }; provenance?: { state?: string; expectedSourceCommit?: string | null; source?: string } };
  capabilities?: { runtimeRelay?: boolean; directConversationExecution?: boolean; directProviderSelection?: boolean };
  boundaries?: { executionPlane?: string; localExtensionRequired?: boolean; localDeviceMutationAllowed?: boolean; relaySeesPlaintext?: boolean };
  routing?: { authority?: string; automaticPaidFallback?: boolean; browserMaySelectProvider?: boolean };
  studio?: { managementPlaneReady?: boolean; delegationRuntimeReady?: boolean };
};

export const WORKSPACE_NAV_ITEMS: ReadonlyArray<{ id: WorkspaceView; label: string }> = Object.freeze([
  { id: "chat", label: "Chat" },
  { id: "work", label: "Work" },
  { id: "files", label: "Files" },
  { id: "advanced", label: "Advanced" },
]);

export type Starter = { icon: ComponentType<{ size?: number }>; title: string; prompt: string };
