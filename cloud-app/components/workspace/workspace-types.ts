import type { ComponentType, Dispatch, ReactNode, RefObject, SetStateAction } from "react";
import type { RuntimeCapability, RuntimeRelay } from "@/lib/runtime-relay";

export type TaskMode = "auto" | "ask" | "act";
export type RelayState = "unpaired" | "resuming" | "pairing" | "connected" | "error";
export type BrainState = "Connecting" | "Idle" | "Awake" | "Degraded" | "Offline";
export type ChatCreditPolicy = "zero-codex" | "licensed-approved";
export type WorkspaceMessage = { id: string; role: "assistant" | "user"; text: string };
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
  deployment?: { provider?: string; environment?: string; url?: string | null; commitSha?: string | null; gitRef?: string | null };
  capabilities?: { runtimeRelay?: boolean; directConversationExecution?: boolean; directProviderSelection?: boolean };
  boundaries?: { executionPlane?: string; localExtensionRequired?: boolean; localDeviceMutationAllowed?: boolean; relaySeesPlaintext?: boolean };
  routing?: { authority?: string; automaticPaidFallback?: boolean; browserMaySelectProvider?: boolean };
};

export const WORKSPACE_NAV_ITEMS: ReadonlyArray<{ id: WorkspaceView; label: string }> = Object.freeze([
  { id: "chat", label: "Chat" },
  { id: "work", label: "Work" },
  { id: "files", label: "Files" },
  { id: "advanced", label: "Advanced" },
]);

export type Starter = { icon: ComponentType<{ size?: number }>; title: string; prompt: string };

export type ChatViewProps = {
  messages: WorkspaceMessage[];
  runtimeBusy: boolean;
  runtimeError: string | null;
  input: string;
  files: File[];
  totalBytes: number;
  busy: boolean;
  coreReady: boolean;
  taskMode: TaskMode;
  brainLabel: string;
  brainState: BrainState;
  licensedRetryAvailable: boolean;
  health: Health | null;
  healthError: boolean;
  relayState: RelayState;
  pairingOffer: string;
  routableCapabilities: RuntimeCapability[];
  starters: Starter[];
  quickActions: QuickAction[];
  activeActionLabel: string | null;
  voiceSupported: boolean;
  voiceListening: boolean;
  composer: RefObject<HTMLTextAreaElement | null>;
  fileInput: RefObject<HTMLInputElement | null>;
  bottom: RefObject<HTMLDivElement | null>;
  setInput: (value: string) => void;
  setPairingOffer: (value: string) => void;
  setSidebarOpen: (open: boolean) => void;
  chooseStarter: (prompt: string) => void;
  addFiles: (files: File[]) => void;
  setFiles: Dispatch<SetStateAction<File[]>>;
  submit: () => void | Promise<void>;
  runQuickAction: (action: QuickActionId) => void | Promise<void>;
  toggleVoice: () => void;
  speakLatest: () => void;
  stopActiveResponse: () => void | Promise<void>;
  pairRuntime: () => void | Promise<void>;
  revokeRuntime: () => void | Promise<void>;
  retryLicensed: () => void | Promise<void>;
};

export type WorkspaceShellProps = {
  view: WorkspaceView;
  setView: (view: WorkspaceView) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  busy: boolean;
  coreReady: boolean;
  onNewConversation: () => void;
  children: ReactNode;
};

export type OperationsViewProps = { coreReady: boolean; relay: RuntimeRelay | null; onRequestPairing: () => void };
export type CockpitViewProps = { coreReady: boolean; health: Health | null; healthError: boolean; runtimeCapabilities: RuntimeCapability[]; onRequestPairing: () => void; onOpenOperations: () => void; onOpenConnections: () => void };
export type ConnectionsViewProps = { coreReady: boolean; health: Health | null; runtimeCapabilities: RuntimeCapability[]; onRequestPairing: () => void; onDisconnect: () => void | Promise<void> };
export type WorkViewProps = { coreReady: boolean; relay: RuntimeRelay | null; onRequestPairing: () => void; onRunQuickAction: (action: QuickActionId) => void | Promise<void> };
export type FilesViewProps = { files: File[]; totalBytes: number; fileInput: RefObject<HTMLInputElement | null>; addFiles: (files: File[]) => void; setFiles: Dispatch<SetStateAction<File[]>>; onBackToChat: () => void };
