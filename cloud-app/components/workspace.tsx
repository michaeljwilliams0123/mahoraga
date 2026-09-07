"use client";

import {
  Database,
  Menu,
  MonitorUp,
  Radar,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { MAX_FILE_BYTES, MAX_FILES, MAX_TOTAL_FILE_BYTES } from "@/lib/runtime-config";
import { RuntimeRelay, type RuntimeCapability, type RuntimeMessage, type RuntimeTask } from "@/lib/runtime-relay";
import { ChatView } from "./workspace/chat-view";
import { OperationsView } from "./workspace/operations-view";
import { WorkspaceShell } from "./workspace/workspace-shell";
import type {
  Health,
  RelayState,
  Starter,
  TaskMode,
  WorkspaceMessage,
  WorkspaceView,
} from "./workspace/workspace-types";

const ACTIVE_TASK_STATES = new Set(["queued", "claimed", "running", "verifying", "waiting", "waiting_for_user"]);
const TERMINAL_TASK_STATES = new Set(["succeeded", "failed", "cancelled", "rejected"]);

const starters: Starter[] = [
  { icon: Database, title: "Analyze a dataset", prompt: "Analyze the attached dataset. Find material patterns, anomalies, competing explanations, data-quality limitations, and the three most important actions. Quantify every finding you can." },
  { icon: Search, title: "Improve a repository", prompt: "Review the connected repository, identify the highest-impact verified improvement, implement it within the approved scope, run focused checks, and return the evidence." },
  { icon: MonitorUp, title: "Approved browser task", prompt: "Use an approved browser capability if the Mahoraga core can route one. Stop for approval before any external or consequential action: " },
  { icon: Radar, title: "Inspect fleet cycle", prompt: "Inspect the current fleet cycle through the paired Mahoraga core. Summarize runtime health, exact-head verification, workers, open tasks, and repair state without leaving the encrypted Operations path." },
];

function readableBytes(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

function runtimeErrorMessage(code: string) {
  const messages: Record<string, string> = {
    "zero-credit-provider-unavailable": "No verified zero-credit language provider is connected yet. Mahoraga will not use a paid fallback.",
    "zero-credit-objective-provider-unavailable": "This objective is waiting for a verified zero-credit provider. No paid fallback was attempted.",
    "relay-not-paired": "The Mahoraga core is no longer paired. Pair it again to continue this conversation.",
    "relay-disconnected": "The encrypted core connection closed. No alternate execution brain was used.",
    "relay-request-timeout": "The Mahoraga core did not answer before the bounded timeout. No paid fallback was attempted.",
    "relay-attachments-local-only": "Attachments require the core artifact bridge and are not sent through the conversation relay.",
  };
  return messages[code] ?? code.replaceAll("-", " ");
}

export function Workspace() {
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [view, setView] = useState<WorkspaceView>("chat");
  const [taskMode, setTaskMode] = useState<TaskMode>("auto");
  const [pairingOffer, setPairingOffer] = useState("");
  const [relayState, setRelayState] = useState<RelayState>("unpaired");
  const [pairedRelay, setPairedRelay] = useState<RuntimeRelay | null>(null);
  const [runtimeCapabilities, setRuntimeCapabilities] = useState<RuntimeCapability[]>([]);
  const [runtimeConversationId, setRuntimeConversationId] = useState<string | null>(null);
  const [runtimeBusy, setRuntimeBusy] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [messages, setMessages] = useState<WorkspaceMessage[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const relay = useRef<RuntimeRelay | null>(null);
  const renderedRuntimeMessages = useRef(new Set<string>());
  const activeRuntimeTask = useRef<RuntimeTask | null>(null);
  const runtimePollGeneration = useRef(0);

  const busy = runtimeBusy;
  const coreReady = relayState === "connected" && (pairedRelay?.connected === true || relay.current?.connected === true);
  const totalBytes = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);
  const routableCapabilities = useMemo(() => runtimeCapabilities.filter((item) => item.routable), [runtimeCapabilities]);
  const routeLabel = coreReady ? "Mahoraga core · encrypted · no paid fallback" : "Pair runtime to connect the Mahoraga core";

  useEffect(() => {
    fetch("/api/health", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("health-failed");
        setHealth((await response.json()) as Health);
      })
      .catch(() => setHealthError(true));
  }, []);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, runtimeBusy]);
  useEffect(() => () => { void relay.current?.revoke(); }, []);

  function resetConversation() {
    runtimePollGeneration.current += 1;
    setMessages([]);
    setRuntimeConversationId(null);
    renderedRuntimeMessages.current.clear();
    activeRuntimeTask.current = null;
    setRuntimeError(null);
    setInput("");
    setFiles([]);
  }

  function appendMessage(role: "assistant" | "user", text: string, id = crypto.randomUUID()) {
    setMessages((current) => [...current, { id, role, text }]);
  }

  function chooseStarter(prompt: string) {
    setInput(prompt);
    setView("chat");
    composer.current?.focus();
  }

  function addFiles(incoming: File[]) {
    const next = [...files, ...incoming].slice(0, MAX_FILES);
    if (next.some((file) => file.size > MAX_FILE_BYTES)) {
      window.alert(`Each file must be ${readableBytes(MAX_FILE_BYTES)} or smaller.`);
      return;
    }
    if (next.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_FILE_BYTES) {
      window.alert(`Attachments must total ${readableBytes(MAX_TOTAL_FILE_BYTES)} or less.`);
      return;
    }
    setFiles(next);
  }

  async function submit() {
    const text = input.trim();
    if ((!text && files.length === 0) || busy) return;
    if (!coreReady) {
      setRuntimeError("Pair the Mahoraga core before submitting work.");
      return;
    }
    if (files.length > 0) {
      setRuntimeError("Attachments require the core artifact bridge. Nothing was uploaded or sent.");
      return;
    }
    await submitCore(text);
  }

  async function submitCore(text: string) {
    const transport = relay.current;
    if (!transport?.connected || !text) {
      setRelayState("error");
      setRuntimeError("The paired Mahoraga core is not connected.");
      return;
    }
    setInput("");
    setRuntimeError(null);
    setRuntimeBusy(true);
    appendMessage("user", text);
    const pollGeneration = ++runtimePollGeneration.current;
    try {
      const result = await transport.chat({
        conversationId: runtimeConversationId,
        content: text,
        mode: taskMode,
        creditPolicy: "zero-codex",
        attachmentIds: [],
        idempotencyKey: `vercel-${crypto.randomUUID()}`,
      });
      if (runtimePollGeneration.current !== pollGeneration) {
        if (result.task) {
          try {
            await transport.taskAction(result.task.id, result.task.conversationId, "cancel");
          } catch (caught) {
            setRuntimeError(runtimeErrorMessage(caught instanceof Error ? caught.message : "runtime-cancel-failed"));
          }
        }
        return;
      }
      const conversationId = result.conversation.id;
      setRuntimeConversationId(conversationId);
      activeRuntimeTask.current = result.task;
      await pollRuntime(transport, conversationId, Boolean(result.task || result.objective), pollGeneration);
    } catch (caught) {
      if (runtimePollGeneration.current === pollGeneration) {
        const code = caught instanceof Error ? caught.message : "runtime-request-failed";
        setRuntimeError(runtimeErrorMessage(code));
        if (!transport.connected) setRelayState("error");
      }
    } finally {
      if (runtimePollGeneration.current === pollGeneration) {
        activeRuntimeTask.current = null;
        setRuntimeBusy(false);
      }
    }
  }

  async function pollRuntime(transport: RuntimeRelay, conversationId: string, expectsWork: boolean, pollGeneration: number) {
    let sawTerminal = false;
    let sawResponse = false;
    for (let attempt = 0; attempt < 160; attempt += 1) {
      if (runtimePollGeneration.current !== pollGeneration) return;
      const [runtimeMessages, tasks] = await Promise.all([
        transport.messages(conversationId),
        transport.tasks(conversationId),
      ]);
      if (await syncRuntimeMessages(transport, conversationId, runtimeMessages)) sawResponse = true;
      activeRuntimeTask.current = tasks.find((task) => ACTIVE_TASK_STATES.has(task.status)) ?? null;
      sawTerminal ||= tasks.some((task) => TERMINAL_TASK_STATES.has(task.status));
      if (!activeRuntimeTask.current && (sawTerminal || (sawResponse && !expectsWork))) return;
      await new Promise((resolve) => setTimeout(resolve, 750));
    }
    appendMessage("assistant", "Mahoraga accepted this work and is still processing it. The result remains bound to this core conversation.");
  }

  async function syncRuntimeMessages(transport: RuntimeRelay, conversationId: string, runtimeMessages: RuntimeMessage[]) {
    const additions: WorkspaceMessage[] = [];
    for (const message of runtimeMessages) {
      if (renderedRuntimeMessages.current.has(message.id) || message.role === "user") {
        renderedRuntimeMessages.current.add(message.id);
        continue;
      }
      const content = message.contentReference
        ? await transport.messageContent(message, conversationId)
        : message.content ?? "";
      if (!content) continue;
      renderedRuntimeMessages.current.add(message.id);
      additions.push({ id: `runtime-${message.id}`, role: "assistant", text: content });
    }
    if (additions.length > 0) setMessages((current) => [...current, ...additions]);
    return additions.length > 0;
  }

  async function pairRuntime() {
    if (!pairingOffer.trim() || relayState === "pairing") return;
    const transport = new RuntimeRelay();
    setRelayState("pairing");
    setRuntimeError(null);
    try {
      await transport.pair(pairingOffer.trim());
      const capabilities = await transport.capabilities();
      await relay.current?.revoke();
      relay.current = transport;
      setPairedRelay(transport);
      setRuntimeCapabilities(capabilities);
      setPairingOffer("");
      setRelayState("connected");
      resetConversation();
    } catch (caught) {
      await transport.revoke();
      setRelayState("error");
      setRuntimeError(runtimeErrorMessage(caught instanceof Error ? caught.message : "relay-pairing-failed"));
    }
  }

  async function revokeRuntime() {
    const transport = relay.current;
    relay.current = null;
    setPairedRelay(null);
    setRelayState("unpaired");
    setRuntimeCapabilities([]);
    resetConversation();
    await transport?.revoke();
  }

  async function stopActiveResponse() {
    const task = activeRuntimeTask.current;
    runtimePollGeneration.current += 1;
    if (task && relay.current?.connected) {
      try {
        await relay.current.taskAction(task.id, task.conversationId, "cancel");
      } catch (caught) {
        setRuntimeError(runtimeErrorMessage(caught instanceof Error ? caught.message : "runtime-cancel-failed"));
      }
    }
    activeRuntimeTask.current = null;
    setRuntimeBusy(false);
  }

  function placeholder(title: string, body: string) {
    return (
      <section className="connection-panel" aria-label={title}>
        <div className="section-heading">
          <div>
            <span className="eyebrow">Workspace</span>
            <h2>{title}</h2>
          </div>
        </div>
        <p>{body}</p>
        <button className="menu-button" type="button" onClick={() => setSidebarOpen(true)} aria-label="Open navigation" style={{ marginTop: 12 }}>
          <Menu size={19} />
        </button>
      </section>
    );
  }

  return (
    <WorkspaceShell
      view={view}
      setView={setView}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
      busy={busy}
      onNewConversation={resetConversation}
    >
      {view === "chat" && (
        <ChatView
          messages={messages}
          runtimeBusy={runtimeBusy}
          runtimeError={runtimeError}
          input={input}
          files={files}
          totalBytes={totalBytes}
          busy={busy}
          coreReady={coreReady}
          taskMode={taskMode}
          routeLabel={routeLabel}
          health={health}
          healthError={healthError}
          relayState={relayState}
          pairingOffer={pairingOffer}
          routableCapabilities={routableCapabilities}
          starters={starters}
          composer={composer}
          fileInput={fileInput}
          bottom={bottom}
          setInput={setInput}
          setTaskMode={setTaskMode}
          setPairingOffer={setPairingOffer}
          setSidebarOpen={setSidebarOpen}
          chooseStarter={chooseStarter}
          addFiles={addFiles}
          setFiles={setFiles}
          submit={submit}
          stopActiveResponse={stopActiveResponse}
          pairRuntime={pairRuntime}
          revokeRuntime={revokeRuntime}
        />
      )}
      {view === "operations" && (
        <>
          <header className="topbar">
            <button className="menu-button" type="button" onClick={() => setSidebarOpen(true)} aria-label="Open navigation">
              <Menu size={19} />
            </button>
            <div className="route-status">
              <span className={coreReady ? "status-dot status-ready" : "status-dot"} />
              <span>{coreReady ? "Operations · paired core" : "Operations · pair runtime"}</span>
            </div>
          </header>
          <OperationsView
            coreReady={coreReady}
            relay={pairedRelay}
            onRequestPairing={() => setView("chat")}
          />
        </>
      )}
      {view === "agents" && placeholder("Agents", "Agent roster and mandates will land in a later track. Navigation stays in-app.")}
      {view === "plugins" && placeholder("Plugins & Connections", "Provider identity and extension lifecycle land in Track B. No browser authority shortcut is used here.")}
      {view === "files" && placeholder("Files & Data", "Artifact and vault browsing remains core-mediated.")}
      {view === "browser" && placeholder("Browser", "Approved browser capability routing remains owned by the paired core.")}
      {view === "automations" && placeholder("Automations", "Automation controls will reuse core task and objective contracts.")}
      {view === "activity" && placeholder("Activity", "Receipt and event activity will project from the paired core.")}
      {view === "settings" && placeholder("Settings", "Workspace settings stay local to this encrypted client surface.")}
    </WorkspaceShell>
  );
}
