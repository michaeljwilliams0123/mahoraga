"use client";

import { Database, Menu, MonitorUp, Radar, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { MAX_FILE_BYTES, MAX_FILES, MAX_TOTAL_FILE_BYTES } from "@/lib/runtime-config";
import { RuntimeRelay, type RuntimeCapability, type RuntimeMessage, type RuntimeTask } from "@/lib/runtime-relay";
import { speakText, startVoiceDictation, voiceSupport, type VoiceController } from "@/lib/voice-chat";
import { ChatView } from "./workspace/chat-view";
import { CockpitView } from "./cockpit/CockpitView";
import { ConnectionsView } from "./workspace/connections-view";
import { FilesView } from "./workspace/files-view";
import { OperationsView } from "./workspace/operations-view";
import { WorkView } from "./workspace/work-view";
import { WorkspaceShell } from "./workspace/workspace-shell";
import type { BrainState, ChatCreditPolicy, Health, QuickAction, QuickActionId, RelayState, Starter, TaskMode, WorkspaceMessage, WorkspaceView } from "./workspace/workspace-types";

const ACTIVE_TASK_STATES = new Set(["queued", "claimed", "running", "verifying", "waiting", "waiting_for_user"]);
const TERMINAL_TASK_STATES = new Set(["succeeded", "failed", "cancelled", "rejected"]);
const VIEW_HASH: Record<WorkspaceView, string> = { chat: "workspace", work: "work", files: "files", advanced: "advanced" };
const HASH_VIEW = new Map(Object.entries(VIEW_HASH).map(([view, hash]) => [hash, view as WorkspaceView]));

const starters: Starter[] = [
  { icon: Database, title: "Analyze something", prompt: "Help me analyze the current files or context. Start with the most useful next step and keep the result human-readable." },
  { icon: Search, title: "Improve Mahoraga", prompt: "Review the connected repository and current objective, choose the highest-impact verified improvement, implement it through the Mahoraga core, and return concise evidence." },
  { icon: MonitorUp, title: "Work in the browser", prompt: "Use an approved browser capability if the Mahoraga core can route one. Keep me informed in plain language and stop only when an owner decision is genuinely required." },
  { icon: Radar, title: "What is happening", prompt: "Tell me what Mahoraga is working on, what is waiting, and what needs my attention. Hide internal routing unless I ask for details." },
];

const quickActions: QuickAction[] = [
  { id: "upload", label: "Upload", description: "Add files to this work session." },
  { id: "build", label: "Build", description: "Turn the current idea into working output.", requiresCore: true, mode: "act", prompt: "Build the current request through Mahoraga. Use the conversation as context, choose the best available execution lane, make bounded changes, run focused verification, and keep me updated in plain language. If one critical detail is missing, ask only that question before changing anything." },
  { id: "report", label: "Report", description: "Create a polished result from this work.", requiresCore: true, prompt: "Create a polished report from the current conversation and verified evidence. Lead with the answer, keep technical details behind a concise evidence section, and return any available artifact or download reference." },
  { id: "handoff", label: "Handoff", description: "Move the work to the right paired lane.", requiresCore: true, prompt: "Handoff the current objective to the best available paired person or execution lane. Preserve context, do not expose routing mechanics unless I ask, and tell me who has it and what happens next." },
  { id: "create", label: "Create", description: "Start a guided creation session.", requiresCore: true, prompt: "Start a guided creation session using the current context. Choose the appropriate creation capability and ask me only the next decision that materially changes the result." },
  { id: "ship", label: "Ship", description: "Push the approved code update safely.", requiresCore: true, mode: "act", prompt: "Ship the current approved code update through Mahoraga's authoritative repository path. Inspect repository state, create or reuse a bounded feature branch, apply only the approved change, run focused and required verification, open or update the pull request, and merge only when the repository's normal gates are green. Do not use Codex for code review. Treat Vercel as non-blocking. Return the exact branch, pull request, verification state, commit, and merge evidence." },
];

function readableBytes(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

function runtimeErrorMessage(code: string) {
  const messages: Record<string, string> = {
    "zero-credit-provider-unavailable": "No verified zero-credit language provider is connected yet. Mahoraga will not use a paid fallback.",
    "zero-credit-objective-provider-unavailable": "This work is waiting for a verified zero-credit provider. No paid fallback was attempted.",
    "relay-not-paired": "The Mahoraga brain is no longer connected. Connect it again to continue.",
    "relay-disconnected": "The encrypted brain connection closed. No alternate execution brain was used.",
    "relay-request-timeout": "Mahoraga did not answer before the bounded timeout. No paid fallback was attempted.",
    "relay-attachments-local-only": "Files are staged locally until the core artifact bridge accepts them.",
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
  const [taskMode] = useState<TaskMode>("auto");
  const [pairingOffer, setPairingOffer] = useState("");
  const [relayState, setRelayState] = useState<RelayState>("unpaired");
  const [pairedRelay, setPairedRelay] = useState<RuntimeRelay | null>(null);
  const [runtimeCapabilities, setRuntimeCapabilities] = useState<RuntimeCapability[]>([]);
  const [runtimeConversationId, setRuntimeConversationId] = useState<string | null>(null);
  const [runtimeBusy, setRuntimeBusy] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [licensedRetry, setLicensedRetry] = useState<{ text: string; mode: TaskMode } | null>(null);
  const [messages, setMessages] = useState<WorkspaceMessage[]>([]);
  const [activeActionLabel, setActiveActionLabel] = useState<string | null>(null);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const relay = useRef<RuntimeRelay | null>(null);
  const voice = useRef<VoiceController | null>(null);
  const renderedRuntimeMessages = useRef(new Set<string>());
  const activeRuntimeTask = useRef<RuntimeTask | null>(null);
  const runtimePollGeneration = useRef(0);

  const busy = runtimeBusy;
  const coreReady = relayState === "connected" && (pairedRelay?.connected === true || relay.current?.connected === true);
  const totalBytes = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);
  const routableCapabilities = useMemo(() => runtimeCapabilities.filter((item) => item.routable), [runtimeCapabilities]);
  const brainState: BrainState = new Set<RelayState>(["pairing", "resuming"]).has(relayState)
    ? "Connecting"
    : coreReady
      ? runtimeBusy ? "Awake" : licensedRetry || runtimeError ? "Degraded" : "Idle"
      : "Offline";
  const brainLabel = `Mahoraga: ${brainState}`;

  useEffect(() => {
    fetch(process.env.NEXT_PUBLIC_HEALTH_ENDPOINT ?? "/api/health", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("health-failed");
        setHealth((await response.json()) as Health);
      })
      .catch(() => setHealthError(true));
    setVoiceSupported(voiceSupport().dictation);
  }, []);

  useEffect(() => {
    const syncViewFromLocation = () => setView(HASH_VIEW.get(window.location.hash.slice(1)) ?? "chat");
    syncViewFromLocation();
    window.addEventListener("hashchange", syncViewFromLocation);
    return () => window.removeEventListener("hashchange", syncViewFromLocation);
  }, []);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, runtimeBusy]);
  useEffect(() => {
    const transport = new RuntimeRelay();
    let active = true;
    setRelayState("resuming");
    void transport.resume().then(async (resumed) => {
      if (!active) { transport.disconnect(); return; }
      if (!resumed) { setRelayState("unpaired"); return; }
      const capabilities = await transport.capabilities();
      if (!active) { transport.disconnect(); return; }
      relay.current = transport;
      setPairedRelay(transport);
      setRuntimeCapabilities(capabilities);
      setRelayState("connected");
    }).catch(() => {
      transport.disconnect();
      if (active) setRelayState("unpaired");
    });
    return () => {
      active = false;
      voice.current?.stop();
      transport.disconnect();
    };
  }, []);

  function resetConversation() {
    runtimePollGeneration.current += 1;
    voice.current?.stop();
    voice.current = null;
    setVoiceListening(false);
    setMessages([]);
    setRuntimeConversationId(null);
    renderedRuntimeMessages.current.clear();
    activeRuntimeTask.current = null;
    setActiveActionLabel(null);
    setRuntimeError(null);
    setLicensedRetry(null);
    setInput("");
    setFiles([]);
  }

  function appendMessage(role: "assistant" | "user", text: string, id = crypto.randomUUID()) {
    setMessages((current) => [...current, { id, role, text }]);
  }

  function chooseStarter(prompt: string) {
    setInput(prompt);
    navigate("chat");
    composer.current?.focus();
  }

  function navigate(nextView: WorkspaceView) {
    setView(nextView);
    const nextHash = `#${VIEW_HASH[nextView]}`;
    if (window.location.hash !== nextHash) window.location.hash = nextHash;
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
      setRuntimeError("Connect Mahoraga before submitting work.");
      return;
    }
    if (files.length > 0) {
      setRuntimeError("Files are staged locally. The bounded core artifact bridge is not connected yet, so nothing was uploaded or sent.");
      return;
    }
    await submitCore(text);
  }

  async function runQuickAction(actionId: QuickActionId) {
    const action = quickActions.find((item) => item.id === actionId);
    if (!action || busy) return;
    if (actionId === "upload") {
      fileInput.current?.click();
      return;
    }
    if (action.requiresCore && !coreReady) {
      setRuntimeError(`Connect Mahoraga before using ${action.label}.`);
      navigate("chat");
      return;
    }
    setActiveActionLabel(action.label);
    navigate("chat");
    await submitCore(action.prompt ?? action.label, action.mode ?? "auto", action.label);
  }

  function toggleVoice() {
    if (voiceListening) {
      voice.current?.stop();
      voice.current = null;
      setVoiceListening(false);
      return;
    }
    const controller = startVoiceDictation({
      onText: (text) => setInput((current) => `${current}${current.trim() ? " " : ""}${text}`),
      onListeningChange: setVoiceListening,
      onError: (code) => setRuntimeError(runtimeErrorMessage(code)),
    });
    voice.current = controller;
    setVoiceSupported(controller.supported);
    if (!controller.supported) setRuntimeError("Voice dictation is not supported in this browser. Typed chat still works normally.");
  }

  function speakLatest() {
    const latest = [...messages].reverse().find((message) => message.role === "assistant" && message.text.trim());
    if (!latest || !speakText(latest.text)) setRuntimeError("Read-aloud is not available in this browser yet.");
  }

  async function submitCore(text: string, modeOverride: TaskMode = taskMode, actionLabel: string | null = null, creditPolicy: ChatCreditPolicy = "zero-codex") {
    const transport = relay.current;
    if (!transport?.connected || !text) {
      setRelayState("error");
      setRuntimeError("The paired Mahoraga brain is not connected.");
      setActiveActionLabel(null);
      return;
    }
    if (creditPolicy === "zero-codex") setLicensedRetry(null);
    setInput("");
    setRuntimeError(null);
    setRuntimeBusy(true);
    if (actionLabel) setActiveActionLabel(actionLabel);
    if (creditPolicy === "zero-codex") appendMessage("user", text);
    const pollGeneration = ++runtimePollGeneration.current;
    try {
      const result = await transport.chat({
        conversationId: runtimeConversationId,
        content: text,
        mode: modeOverride,
        creditPolicy,
        attachmentIds: [],
        idempotencyKey: `workspace-${crypto.randomUUID()}`,
      });
      if (runtimePollGeneration.current !== pollGeneration) {
        if (result.task) {
          try { await transport.taskAction(result.task.id, result.task.conversationId, "cancel"); }
          catch (caught) { setRuntimeError(runtimeErrorMessage(caught instanceof Error ? caught.message : "runtime-cancel-failed")); }
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
        if (code === "zero-credit-provider-unavailable" && creditPolicy === "zero-codex") {
          setLicensedRetry({ text, mode: modeOverride });
        }
        setRuntimeError(runtimeErrorMessage(code));
        if (!transport.connected) setRelayState("error");
      }
    } finally {
      if (runtimePollGeneration.current === pollGeneration) {
        activeRuntimeTask.current = null;
        setRuntimeBusy(false);
        setActiveActionLabel(null);
      }
    }
  }

  async function retryLicensed() {
    const saved = licensedRetry;
    if (!saved || runtimeBusy) return;
    setLicensedRetry(null);
    await submitCore(saved.text, saved.mode, null, "licensed-approved");
  }
  async function pollRuntime(transport: RuntimeRelay, conversationId: string, expectsWork: boolean, pollGeneration: number) {
    let sawTerminal = false;
    let sawResponse = false;
    for (let attempt = 0; attempt < 160; attempt += 1) {
      if (runtimePollGeneration.current !== pollGeneration) return;
      const [runtimeMessages, tasks] = await Promise.all([transport.messages(conversationId), transport.tasks(conversationId)]);
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
      const content = message.contentReference ? await transport.messageContent(message, conversationId) : message.content ?? "";
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
      await relay.current?.revoke();
      relay.current = null;
      setPairedRelay(null);
      await transport.pair(pairingOffer.trim());
      const capabilities = await transport.capabilities();
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
      try { await relay.current.taskAction(task.id, task.conversationId, "cancel"); }
      catch (caught) { setRuntimeError(runtimeErrorMessage(caught instanceof Error ? caught.message : "runtime-cancel-failed")); }
    }
    activeRuntimeTask.current = null;
    setRuntimeBusy(false);
    setActiveActionLabel(null);
  }

  return (
    <WorkspaceShell view={view} setView={navigate} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} busy={busy} coreReady={coreReady} onNewConversation={resetConversation}>
      {view === "chat" && (
        <ChatView
          messages={messages} runtimeBusy={runtimeBusy} runtimeError={runtimeError} input={input} files={files} totalBytes={totalBytes}
          busy={busy} coreReady={coreReady} taskMode={taskMode} brainLabel={brainLabel} brainState={brainState} licensedRetryAvailable={licensedRetry !== null} health={health} healthError={healthError}
          relayState={relayState} pairingOffer={pairingOffer} routableCapabilities={routableCapabilities} starters={starters} quickActions={quickActions}
          activeActionLabel={activeActionLabel} voiceSupported={voiceSupported} voiceListening={voiceListening} composer={composer} fileInput={fileInput}
          bottom={bottom} setInput={setInput} setPairingOffer={setPairingOffer} setSidebarOpen={setSidebarOpen} chooseStarter={chooseStarter}
          addFiles={addFiles} setFiles={setFiles} submit={submit} runQuickAction={runQuickAction} toggleVoice={toggleVoice} speakLatest={speakLatest}
          stopActiveResponse={stopActiveResponse} pairRuntime={pairRuntime} revokeRuntime={revokeRuntime} retryLicensed={retryLicensed}
        />
      )}

      {view === "work" && <WorkView coreReady={coreReady} relay={pairedRelay} onRequestPairing={() => navigate("chat")} onRunQuickAction={runQuickAction} />}

      {view === "files" && <FilesView files={files} totalBytes={totalBytes} fileInput={fileInput} addFiles={addFiles} setFiles={setFiles} onBackToChat={() => navigate("chat")} />}

      {view === "advanced" && (
        <>
          <header className="topbar advanced-topbar">
            <button className="menu-button" type="button" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><Menu size={19} /></button>
            <div><span className="one-kicker">Advanced</span><strong>Mahoraga internals</strong></div>
            <span className={coreReady ? "brain-status ready" : "brain-status"}>{coreReady ? "Brain connected" : "Unpaired"}</span>
          </header>
          <div className="advanced-stack">
            <ConnectionsView coreReady={coreReady} health={health} runtimeCapabilities={runtimeCapabilities} onRequestPairing={() => navigate("chat")} onDisconnect={revokeRuntime} />
            <OperationsView coreReady={coreReady} relay={pairedRelay} onRequestPairing={() => navigate("chat")} />
            <details className="legacy-detail">
              <summary>Deep control center</summary>
              <CockpitView coreReady={coreReady} health={health} healthError={healthError} runtimeCapabilities={runtimeCapabilities} onRequestPairing={() => navigate("chat")} onOpenOperations={() => navigate("advanced")} onOpenConnections={() => navigate("advanced")} />
            </details>
          </div>
        </>
      )}
    </WorkspaceShell>
  );
}
