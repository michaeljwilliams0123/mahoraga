"use client";

import {
  ArrowUp,
  Bot,
  Check,
  CircleAlert,
  Database,
  Link2,
  LoaderCircle,
  Menu,
  MonitorUp,
  Paperclip,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
  Unplug,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { MAX_FILE_BYTES, MAX_FILES, MAX_INPUT_TEXT_CHARS, MAX_TOTAL_FILE_BYTES } from "@/lib/runtime-config";
import { RuntimeRelay, type RuntimeCapability, type RuntimeMessage, type RuntimeTask } from "@/lib/runtime-relay";

type TaskMode = "auto" | "ask" | "act";
type RelayState = "unpaired" | "pairing" | "connected" | "error";
type WorkspaceMessage = { id: string; role: "assistant" | "user"; text: string };
type Health = {
  ok: boolean;
  boundaries?: { executionPlane?: string; relaySeesPlaintext?: boolean };
  routing?: { automaticPaidFallback?: boolean };
};

const ACTIVE_TASK_STATES = new Set(["queued", "claimed", "running", "verifying", "waiting", "waiting_for_user"]);
const TERMINAL_TASK_STATES = new Set(["succeeded", "failed", "cancelled", "rejected"]);

const starters = [
  { icon: Database, title: "Analyze a dataset", prompt: "Analyze the attached dataset. Find material patterns, anomalies, competing explanations, data-quality limitations, and the three most important actions. Quantify every finding you can." },
  { icon: Search, title: "Improve a repository", prompt: "Review the connected repository, identify the highest-impact verified improvement, implement it within the approved scope, run focused checks, and return the evidence." },
  { icon: MonitorUp, title: "Approved browser task", prompt: "Use an approved browser capability if the Mahoraga core can route one. Stop for approval before any external or consequential action: " },
  { icon: Search, title: "Inspect fleet cycle", prompt: "Inspect the current Mahoraga fleet and repository cycle state. Summarize open pull requests, required check failures, candidate/production boundaries, and the next bounded repair action. Do not bypass core authority or paid-fallback policy." },
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
  const [taskMode, setTaskMode] = useState<TaskMode>("auto");
  const [pairingOffer, setPairingOffer] = useState("");
  const [relayState, setRelayState] = useState<RelayState>("unpaired");
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
  const coreReady = relayState === "connected" && relay.current?.connected === true;
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

  return (
    <div className="workspace-shell">
      <aside className={sidebarOpen ? "sidebar sidebar-open" : "sidebar"}>
        <div className="brand-row">
          <div className="brand-mark">M</div>
          <div><strong>Mahoraga</strong><span>Unified workspace</span></div>
          <button className="mobile-close" onClick={() => setSidebarOpen(false)} aria-label="Close navigation"><X size={18} /></button>
        </div>
        <button className="new-chat" onClick={() => { resetConversation(); setSidebarOpen(false); }} disabled={busy}><Plus size={17} /> New conversation</button>
        <nav className="side-nav" aria-label="Workspace navigation">
          <a href="#chat" className="active"><Sparkles size={17} /> Chat</a>
          <a href="#capabilities"><Bot size={17} /> Capabilities</a>
          <a href="#connections"><Link2 size={17} /> Connections</a>
        </nav>
        <div className="sidebar-spacer" />
        <div className="privacy-card"><ShieldCheck size={18} /><div><strong>One core authority</strong><span>The Vercel workspace is an encrypted client. Policy, routing, verification, and execution authority remain with the paired Mahoraga core.</span></div></div>
        <a className="repo-link" href="https://github.com/michaeljwilliams0123/mahoraga/issues/new?template=codex-cloud-task.yml" target="_blank" rel="noreferrer">Repository task <span>↗</span></a>
      </aside>
      {sidebarOpen && <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-label="Close navigation" />}

      <main className="main-panel" id="chat">
        <header className="topbar">
          <button className="menu-button" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><Menu size={19} /></button>
          <div className="route-status">
            <span className={coreReady ? "status-dot status-ready" : "status-dot"} />
            <span>{routeLabel}</span>
          </div>
          <div className="mode-switch" aria-label="Task mode">
            {(["auto", "ask", "act"] as TaskMode[]).map((mode) => (
              <button key={mode} type="button" aria-pressed={taskMode === mode} onClick={() => setTaskMode(mode)}>{mode[0].toUpperCase() + mode.slice(1)}</button>
            ))}
          </div>
        </header>

        <section className="conversation-panel">
          {messages.length === 0 ? (
            <div className="welcome-panel">
              <div className="welcome-mark"><Sparkles size={24} /></div>
              <h1>One Mahoraga. One core.</h1>
              <p>Pair the runtime once. Every conversation then enters the same encrypted Conversation Gateway, policy router, verification path, and receipt graph.</p>
              <div className="starter-grid">
                {starters.map((starter) => {
                  const Icon = starter.icon;
                  return <button key={starter.title} type="button" aria-label={`Start: ${starter.title}`} onClick={() => chooseStarter(starter.prompt)}><Icon size={18} /><strong>{starter.title}</strong></button>;
                })}
              </div>
            </div>
          ) : (
            <div className="message-list">
              {messages.map((message) => (
                <article key={message.id} className={`message-row message-${message.role}`}>
                  <div className="message-avatar">{message.role === "assistant" ? <Sparkles size={16} /> : "You"}</div>
                  <div className="message-body"><div className="message-text" style={{ whiteSpace: "pre-wrap" }}>{message.text}</div></div>
                </article>
              ))}
              {runtimeBusy && <div className="message-row message-assistant"><div className="message-avatar"><Sparkles size={16} /></div><div className="message-body"><LoaderCircle className="spin" size={18} /> Mahoraga is working through the core…</div></div>}
            </div>
          )}
          <div ref={bottom} />
        </section>

        <section className="composer-shell">
          {runtimeError && <div className="inline-alert" role="alert"><CircleAlert size={16} /> {runtimeError}</div>}
          <div className="composer-card">
            {files.length > 0 && <div className="file-strip">{files.map((file) => <span key={`${file.name}-${file.size}`}><Paperclip size={13} /> {file.name}<button type="button" onClick={() => setFiles((current) => current.filter((item) => item !== file))} aria-label={`Remove ${file.name}`}><X size={12} /></button></span>)}</div>}
            <textarea
              ref={composer}
              value={input}
              maxLength={MAX_INPUT_TEXT_CHARS}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void submit();
                }
              }}
              placeholder={coreReady ? "Message Mahoraga…" : "Pair the Mahoraga core to begin…"}
              aria-label="Message Mahoraga"
            />
            <div className="composer-actions">
              <input ref={fileInput} type="file" multiple hidden onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }} />
              <button type="button" onClick={() => fileInput.current?.click()} aria-label="Attach files" title="Attach files"><Paperclip size={18} /></button>
              <span className="composer-hint">{files.length > 0 ? `${files.length} file(s) · ${readableBytes(totalBytes)} · core artifact bridge required` : "Zero-Codex route · no paid fallback"}</span>
              {busy
                ? <button type="button" className="send-button" onClick={() => void stopActiveResponse()} aria-label="Stop response" title="Stop response"><Square size={16} /></button>
                : <button type="button" className="send-button" onClick={() => void submit()} disabled={!input.trim() && files.length === 0} aria-label="Send"><ArrowUp size={18} /></button>}
            </div>
          </div>
          <div className="status-line" aria-live="polite">
            {coreReady ? <><Check size={14} /> Core paired</> : relayState === "pairing" ? <><LoaderCircle className="spin" size={14} /> Pairing…</> : <><Unplug size={14} /> Core not paired</>}
            {healthError && <span> · workspace health unavailable</span>}
            {health?.routing?.automaticPaidFallback === false && <span> · paid fallback disabled</span>}
          </div>
        </section>

        <section className="connection-panel" id="connections">
          <div className="section-heading"><div><span className="eyebrow">Encrypted connection</span><h2>Pair runtime</h2></div><ShieldCheck size={20} /></div>
          <p>The pairing offer establishes an end-to-end encrypted session to the authoritative Mahoraga core. Pairing changes connectivity only; it does not select a different brain.</p>
          {relayState !== "connected" ? (
            <div className="pair-row">
              <input value={pairingOffer} onChange={(event) => setPairingOffer(event.target.value)} placeholder="Paste pairing offer" aria-label="Runtime pairing offer" />
              <button type="button" onClick={() => void pairRuntime()} disabled={!pairingOffer.trim() || relayState === "pairing"}>{relayState === "pairing" ? <LoaderCircle className="spin" size={16} /> : <Link2 size={16} />} Pair runtime</button>
            </div>
          ) : (
            <div className="pair-row"><span><Check size={16} /> Authoritative core connected</span><button type="button" onClick={() => void revokeRuntime()}><Unplug size={16} /> Revoke</button></div>
          )}
        </section>

        <section className="capability-panel" id="capabilities">
          <div className="section-heading"><div><span className="eyebrow">Core-routed</span><h2>Capabilities</h2></div><Bot size={20} /></div>
          <p>Capability readiness is reported by the paired core. The browser does not choose providers or grant execution authority.</p>
          {routableCapabilities.length === 0 ? <p className="muted">Pair the core to read its routable capability index.</p> : <div className="capability-list">{routableCapabilities.map((capability) => <div key={capability.capability}><strong>{capability.capability}</strong><span>routable</span></div>)}</div>}
        </section>
      </main>
    </div>
  );
}
