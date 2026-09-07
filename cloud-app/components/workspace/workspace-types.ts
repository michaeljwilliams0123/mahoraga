import type { ComponentType, Dispatch, ReactNode, RefObject, SetStateAction } from "react";
import type { RuntimeCapability, RuntimeRelay } from "@/lib/runtime-relay";

export type TaskMode = "auto" | "ask" | "act";
export type RelayState = "unpaired" | "pairing" | "connected" | "error";
export type WorkspaceMessage = { id: string; role: "assistant" | "user"; text: string };
export type Health = {
  ok: boolean;
  product?: string;
  version?: string;
  deployment?: {
    environment?: string;
    url?: string | null;
    commitSha?: string | null;
    gitRef?: string | null;
  };
  capabilities?: {
    runtimeRelay?: boolean;
    directConversationExecution?: boolean;
    directProviderSelection?: boolean;
  };
  boundaries?: {
    executionPlane?: string;
    localExtensionRequired?: boolean;
    localDeviceMutationAllowed?: boolean;
    relaySeesPlaintext?: boolean;
  };
  routing?: {
    authority?: string;
    automaticPaidFallback?: boolean;
    browserMaySelectProvider?: boolean;
  };
};

export type WorkspaceView = "chat" | "cockpit" | "operations" | "connections";

export const WORKSPACE_NAV_ITEMS: ReadonlyArray<{ id: WorkspaceView; label: string }> = Object.freeze([
  { id: "chat", label: "Chat" },
  { id: "cockpit", label: "Control Center" },
  { id: "operations", label: "Operations" },
  { id: "connections", label: "Connections" },
]);

export type Starter = {
  icon: ComponentType<{ size?: number }>;
  title: string;
  prompt: string;
};

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
  routeLabel: string;
  health: Health | null;
  healthError: boolean;
  relayState: RelayState;
  pairingOffer: string;
  routableCapabilities: RuntimeCapability[];
  starters: Starter[];
  composer: RefObject<HTMLTextAreaElement | null>;
  fileInput: RefObject<HTMLInputElement | null>;
  bottom: RefObject<HTMLDivElement | null>;
  setInput: (value: string) => void;
  setTaskMode: (mode: TaskMode) => void;
  setPairingOffer: (value: string) => void;
  setSidebarOpen: (open: boolean) => void;
  chooseStarter: (prompt: string) => void;
  addFiles: (files: File[]) => void;
  setFiles: Dispatch<SetStateAction<File[]>>;
  submit: () => void | Promise<void>;
  stopActiveResponse: () => void | Promise<void>;
  pairRuntime: () => void | Promise<void>;
  revokeRuntime: () => void | Promise<void>;
};

export type WorkspaceShellProps = {
  view: WorkspaceView;
  setView: (view: WorkspaceView) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  busy: boolean;
  onNewConversation: () => void;
  children: ReactNode;
};

export type OperationsViewProps = {
  coreReady: boolean;
  relay: RuntimeRelay | null;
  onRequestPairing: () => void;
};

export type CockpitViewProps = {
  coreReady: boolean;
  health: Health | null;
  healthError: boolean;
  runtimeCapabilities: RuntimeCapability[];
  onRequestPairing: () => void;
  onOpenOperations: () => void;
  onOpenConnections: () => void;
};

export type ConnectionsViewProps = {
  coreReady: boolean;
  health: Health | null;
  runtimeCapabilities: RuntimeCapability[];
  onRequestPairing: () => void;
  onDisconnect: () => void | Promise<void>;
};
