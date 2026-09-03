"use client";

import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  getToolName,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai";
import {
  ArrowUp,
  Bot,
  Check,
  CircleAlert,
  Cpu,
  Database,
  FileText,
  Globe2,
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
import { MessageResponse } from "@/components/ai-elements/message";
import { MAX_FILE_BYTES, MAX_FILES, MAX_INPUT_TEXT_CHARS, MAX_TOTAL_FILE_BYTES, MODEL_LABEL } from "@/lib/runtime-config";
import { RuntimeRelay, type RuntimeCapability, type RuntimeMessage, type RuntimeTask } from "@/lib/runtime-relay";

type CapabilityName = "chat" | "files" | "datasetAnalysis" | "webResearch" | "browser" | "githubTaskBridge" | "runtimeRelay";
type RouteMode = "efficient" | "cloud";
type Health = {
  ok: boolean;
  model: { id: string; label: string; reasoning: string };
  capabilities: Record<CapabilityName, boolean>;
  boundaries: { executionPlane: string; localExtensionRequired: boolean; localDeviceMutationAllowed: boolean; relaySeesPlaintext: boolean };
};

const ACTIVE_TASK_STATES = new Set(["queued", "claimed", "running", "verifying", "waiting", "waiting_for_user"]);
const TERMINAL_TASK_STATES = new Set(["succeeded", "failed", "cancelled", "rejected"]);
const CLOUD_TRANSPORT = new DefaultChatTransport({ api: "/api/chat" });

const starters = [
  { icon: Database, title: "Analyze a dataset", prompt: "Analyze the attached dataset. Find material patterns, anomalies, competing explanations, data-quality limitations, and the three most important actions. Quantify every finding you can." },
  { icon: Search, title: "Improve a repository", prompt: "Review the connected repository, identify the highest-impact verified improvement, implement it within the approved scope, run focused checks, and return the evidence." },
  { icon: MonitorUp, title: "Approved browser task", prompt: "Use the isolated cloud browser, if connected, to complete this bounded task. Stop for approval before any external or consequential action: " },
];

function readableBytes(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

function runtimeErrorMessage(code: string) {
  const messages: Record<string, string> = {
    "zero-credit-provider-unavailable": "No verified zero-credit language provider is connected yet. Deterministic runtime capabilities remain available, or you can deliberately select Cloud Pro.",
    "zero-credit-objective-provider-unavailable": "This change needs a model-backed coding objective. Stage it through the GitHub Primary Codex lane, or select Cloud Pro deliberately; the zero-credit route will not spend credits automatically.",
    "relay-not-paired": "The paired runtime is no longer connected. Pair it again to continue on the zero-credit route.",
    "relay-disconnected": "The encrypted runtime connection closed. This conversation was not sent to Cloud Pro.",
    "relay-request-timeout": "The paired runtime did not answer before the bounded timeout. No paid fallback was attempted.",
  };
  return messages[code] ?? code.replaceAll("-", " ");
}

export function Workspace() {
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [routeMode, setRouteMode] = useState<RouteMode>("efficient");
  const [pairingOffer, setPairingOffer] = useState("");
  const [relayState, setRelayState] = useState<"unpaired" | "pairing" | "connected" | "error">("unpaired");
  const [runtimeCapabilities, setRuntimeCapabilities] = useState<RuntimeCapability[]>([]);
  const [runtimeConversationId, setRuntimeConversationId] = useState<string | null>(null);
  const [conversationRoute, setConversationRoute] = useState<"cloud" | "runtime" | null>(null);
  const [runtimeBusy, setRuntimeBusy] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const relay = useRef<RuntimeRelay | null>(null);
  const renderedRuntimeMessages = useRef(new Set<string>());
  const activeRuntimeTask = useRef<RuntimeTask | null>(null);
  const runtimePollGeneration = useRef(0);
  const { messages, sendMessage, status: cloudStatus, error: cloudError, stop: stopCloud, setMessages, addToolApprovalResponse } = useChat({
    transport: CLOUD_TRANSPORT,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });
  const cloudBusy = cloudStatus === "submitted" || cloudStatus === "streaming";
  const busy = cloudBusy || runtimeBusy;
  const runtimeReady = relayState === "connected" && relay.current?.connected === true;
  const cloudReady = health?.capabilities.chat === true;
  const selectedRoute = conversationRoute ?? (routeMode === "cloud" ? "cloud" : "runtime");
  const routeReady = selectedRoute === "runtime" ? runtimeReady : cloudReady;
  const attachmentsReady = conversationRoute !== "runtime" && routeMode === "cloud" && cloudReady;
  const routeLabel = conversationRoute === "runtime"
    ? "Zero-Codex runtime · conversation"
    : conversationRoute === "cloud"
      ? "Cloud Pro · explicit conversation"
      : routeMode === "cloud"
        ? health?.model.label ?? MODEL_LABEL
        : runtimeReady
          ? "Zero-Codex runtime · no paid fallback"
          : "Pair runtime for zero-credit chat";
  const totalBytes = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);

  useEffect(() => {
    fetch("/api/health", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("health-failed");
        setHealth((await response.json()) as Health);
      })
      .catch(() => setHealthError(true));
  }, []);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, cloudStatus, runtimeBusy]);

  useEffect(() => () => { void relay.current?.revoke(); }, []);

  function resetConversation() {
    runtimePollGeneration.current += 1;
    setMessages([]);
    setRuntimeConversationId(null);
    setConversationRoute(null);
    renderedRuntimeMessages.current.clear();
    activeRuntimeTask.current = null;
    setRuntimeError(null);
    setInput("");
    setFiles([]);
  }

  function appendMessage(role: "assistant" | "user", text: string, id = crypto.randomUUID()) {
    const message: UIMessage = { id, role, parts: [{ type: "text", text }] };
    setMessages((current) => [...current, message]);
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
    if ((!text && files.length === 0) || busy || !routeReady) return;
    const desiredRoute = conversationRoute ?? (routeMode === "cloud" ? "cloud" : "runtime");
    const shouldUseRuntime = desiredRoute === "runtime";
    if (shouldUseRuntime) {
      if (files.length > 0) {
        setRuntimeError("Attachments stay on the cloud analysis route; switch to Cloud Pro explicitly.");
        return;
      }
      await submitRuntime(text);
      return;
    }
    if (!cloudReady) {
      setRuntimeError("No execution route is connected.");
      return;
    }
    const transfer = new DataTransfer();
    files.forEach((file) => transfer.items.add(file));
    setInput("");
    setFiles([]);
    setRuntimeError(null);
    setConversationRoute("cloud");
    await sendMessage({ text, files: transfer.files });
  }

  async function submitRuntime(text: string) {
    const transport = relay.current;
    if (!transport?.connected || !text) {
      setRelayState("error");
      setRuntimeError("The paired runtime is not connected.");
      return;
    }
    setInput("");
    setRuntimeError(null);
    setRuntimeBusy(true);
    setConversationRoute("runtime");
    appendMessage("user", text);
    const pollGeneration = ++runtimePollGeneration.current;
    try {
      const result = await transport.chat({
        conversationId: runtimeConversationId,
        content: text,
        mode: "auto",
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
    appendMessage("assistant", "The paired runtime accepted this work and is continuing it. Its result will remain in the runtime conversation; submit another message after it finishes to refresh the view.");
  }

  async function syncRuntimeMessages(transport: RuntimeRelay, conversationId: string, runtimeMessages: RuntimeMessage[]) {
    const additions: UIMessage[] = [];
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
      additions.push({ id: `runtime-${message.id}`, role: "assistant", parts: [{ type: "text", text: content }] });
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
      setRouteMode("efficient");
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
    setRouteMode("efficient");
    resetConversation();
    await transport?.revoke();
  }

  async function stopActiveResponse() {
    const task = activeRuntimeTask.current;
    if (runtimeBusy) {
      runtimePollGeneration.current += 1;
      if (task && relay.current?.connected) {
        try { await relay.current.taskAction(task.id, task.conversationId, "cancel"); }
        catch (caught) { setRuntimeError(runtimeErrorMessage(caught instanceof Error ? caught.message : "runtime-cancel-failed")); }
      }
      setRuntimeBusy(false);
      return;
    }
    stopCloud();
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
        <div className="privacy-card"><ShieldCheck size={18} /><div><strong>Owner-controlled boundary</strong><span>Cloud work stays cloud-side. A paired runtime is end-to-end encrypted and never grants ambient device control.</span></div></div>
        <a className="repo-link" href="https://github.com/michaeljwilliams0123/mahoraga" target="_blank" rel="noreferrer">GitHub repository <span>↗</span></a>
      </aside>
      {sidebarOpen && <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-label="Close navigation" />}

      <main className="main-panel" id="chat">
        <header className="topbar">
          <button className="menu-button" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
          <label className="route-picker"><Sparkles size={15} /><span className="sr-only">Execution route</span><select value={routeMode} onChange={(event) => { resetConversation(); setRouteMode(event.target.value as RouteMode); }} disabled={busy} aria-label="Execution route"><option value="efficient">Zero-Codex route</option><option value="cloud">Cloud Pro · explicit</option></select></label>
          <div className={routeReady ? "live-state ready" : "live-state"}><span /> {routeReady ? routeLabel : routeMode === "efficient" ? "Pair a zero-credit runtime" : healthError ? "Health unavailable" : "Connect Cloud Pro"}</div>
        </header>

        <section className="conversation" aria-live="polite">
          {messages.length === 0 ? (
            <div className="welcome">
              <div className="welcome-mark"><Sparkles size={26} /></div>
              <h1>What are we working on?</h1>
              <p>One workspace, one conversation surface. Ordinary chat uses the paired zero-Codex route with no paid fallback; Cloud Pro runs only when you select it explicitly.</p>
              <div className="starter-grid">
                {starters.map((starter) => (
                  <button type="button" key={starter.title} aria-label={`Start: ${starter.title}`} onClick={() => chooseStarter(starter.prompt)}>
                    <starter.icon size={18} /><span>{starter.title}</span><small>{starter.prompt.slice(0, 72)}…</small>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="message-list">
              {messages.map((message) => (
                <article key={message.id} className={`message ${message.role}`}>
                  <div className="message-avatar">{message.role === "assistant" ? <Sparkles size={16} /> : "M"}</div>
                  <div className="message-body">
                    <div className="message-author">{message.role === "assistant" ? "Mahoraga" : "You"}</div>
                    {message.parts.map((part, index) => {
                      if (part.type === "text") return <MessageResponse key={index} isAnimating={busy && message === messages.at(-1)}>{part.text}</MessageResponse>;
                      if (part.type === "reasoning") return <details className="reasoning" key={index}><summary>Reasoning summary</summary><MessageResponse>{part.text}</MessageResponse></details>;
                      if (part.type === "file") return <div className="file-part" key={index}><FileText size={16} /><span>{part.filename ?? "Attachment"}</span></div>;
                      if (part.type === "source-url") return <a className="source-part" key={index} href={part.url} target="_blank" rel="noreferrer"><Globe2 size={14} />{part.title ?? new URL(part.url).hostname}</a>;
                      if (isToolUIPart(part)) {
                        const name = getToolName(part).replaceAll("_", " ");
                        return (
                          <div className={`tool-card state-${part.state}`} key={part.toolCallId}>
                            <div className="tool-title">
                              {part.state === "output-available" ? <Check size={15} /> : part.state === "output-error" || part.state === "output-denied" ? <CircleAlert size={15} /> : <LoaderCircle size={15} className="spin" />}
                              <strong>{name}</strong><span>{part.state.replaceAll("-", " ")}</span>
                            </div>
                            {part.state === "approval-requested" && !part.approval.isAutomatic && (
                              <div className="approval-box"><p>{part.approval.requestReason ?? "This cloud browser action requires your approval."}</p><div><button onClick={() => addToolApprovalResponse({ id: part.approval.id, approved: false, reason: "Owner denied the action." })}>Deny</button><button className="approve" onClick={() => addToolApprovalResponse({ id: part.approval.id, approved: true })}>Approve once</button></div></div>
                            )}
                            {part.state === "output-error" && <p className="tool-error">{part.errorText}</p>}
                            {part.state === "output-available" && name === "cloud browser" && <pre>{JSON.stringify(part.output, null, 2)}</pre>}
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                </article>
              ))}
              {(cloudStatus === "submitted" || runtimeBusy) && <div className="thinking-line"><LoaderCircle className="spin" size={17} /> Mahoraga is interpreting the task through {runtimeBusy ? "the paired runtime" : "Cloud Pro"}…</div>}
              {(cloudError || runtimeError) && <div className="error-banner"><CircleAlert size={17} /><span>{runtimeError || cloudError?.message || "The request failed."}</span></div>}
              <div ref={bottom} />
            </div>
          )}
        </section>

        <section className="composer-zone">
          <div className="composer-card">
            {files.length > 0 && <div className="attachment-row">{files.map((file, index) => <div className="attachment-chip" key={`${file.name}-${file.lastModified}`}><FileText size={15} /><span>{file.name}<small>{readableBytes(file.size)}</small></span><button onClick={() => setFiles(files.filter((_, i) => i !== index))} aria-label={`Remove ${file.name}`}><X size={14} /></button></div>)}</div>}
            <textarea ref={composer} id="composer" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); } }} placeholder={!routeReady ? routeMode === "efficient" ? "Pair a runtime to chat without Codex credits" : "Connect Cloud Pro" : `Message Mahoraga · ${routeLabel}`} maxLength={MAX_INPUT_TEXT_CHARS} rows={1} disabled={!routeReady} />
            <div className="composer-actions">
              <input ref={fileInput} type="file" multiple hidden accept=".csv,.tsv,.json,.txt,.md,.pdf,.xlsx,image/*" onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
              <button className="attach" onClick={() => fileInput.current?.click()} disabled={busy || files.length >= MAX_FILES || !attachmentsReady} aria-label="Attach files"><Paperclip size={18} /></button>
              <span className="mode-label"><Sparkles size={14} /> {routeLabel}</span>
              <span className="file-limit">{files.length ? `${files.length}/${MAX_FILES} · ${readableBytes(totalBytes)}` : "Files · data · images"}</span>
              {busy ? <button className="send-button" onClick={() => void stopActiveResponse()} aria-label="Stop response"><Square size={14} fill="currentColor" /></button> : <button className="send-button" onClick={() => void submit()} disabled={(!input.trim() && files.length === 0) || !routeReady} aria-label="Send message"><ArrowUp size={18} /></button>}
            </div>
          </div>
          <p className="composer-footnote">Zero-Codex never falls through to a paid model. Cloud Pro, browser actions, and device-impacting actions stay explicit and approval gated.</p>
        </section>

        <section className="capability-section" id="capabilities">
          <div className="section-heading"><span>Runtime</span><h2>Capabilities you can actually use</h2><p>Each state comes from the deployed backend configuration.</p></div>
          <div className="capability-grid">
            <Capability icon={Sparkles} title="Pro reasoning" ready={health?.capabilities.chat} detail="GPT-5.6 Sol · Pro mode · max effort" />
            <Capability icon={Database} title="File + data analysis" ready={health?.capabilities.datasetAnalysis} detail="CSV, JSON, PDF, documents, and images" />
            <Capability icon={Globe2} title="Grounded web research" ready={health?.capabilities.webResearch} detail="Live search with returned sources" />
            <Capability icon={MonitorUp} title="Isolated browser" ready={health?.capabilities.browser} detail={health?.capabilities.browser ? "Cloud provider · approval gated" : "Needs browser provider secrets"} />
            <Capability icon={Cpu} title="Zero-Codex runtime" ready={runtimeReady} detail={runtimeReady ? `${runtimeCapabilities.filter((item) => item.routable).length} runtime capabilities routable · no paid fallback` : "Encrypted owner pairing · no extension"} />
          </div>
        </section>

        <section className="capability-section connections" id="connections">
          <div className="section-heading"><span>Connections</span><h2>No simulated integrations</h2><p>A connector is only shown as ready when its deployment credential exists.</p></div>
          <div className="connection-list">
            <Connection name="Vercel AI Gateway" ready={health?.capabilities.chat} detail="Model, analysis, and web tools" />
            <Connection name="GitHub task bridge" ready={health?.capabilities.githubTaskBridge} detail="Owner-triggered draft PR · Primary Codex first" href="https://github.com/michaeljwilliams0123/mahoraga/issues/new?template=codex-cloud-task.yml" />
            <Connection name="Cloud browser" ready={health?.capabilities.browser} detail="No local Chrome extension" />
            <Connection name="Mahoraga runtime" ready={runtimeReady} detail={runtimeReady ? "End-to-end encrypted · zero-Codex policy" : "Paste a short-lived offer below"} />
          </div>
          <div className="pairing-panel">
            <div className="pairing-copy"><Cpu size={18} /><div><strong>Pair a zero-Codex runtime</strong><p>Generate a short-lived offer on the cloud or secondary runtime you explicitly want to connect. The relay cannot read task content, and this route rejects paid-model fallback.</p></div></div>
            <textarea value={pairingOffer} onChange={(event) => setPairingOffer(event.target.value)} placeholder="Paste the pairing offer" rows={3} disabled={relayState === "pairing" || runtimeReady} aria-label="Runtime pairing offer" />
            <div className="pairing-actions"><span className={`pairing-state ${runtimeReady ? "ready" : ""}`}>{runtimeReady ? `${runtimeCapabilities.filter((item) => item.routable).length} capabilities ready` : relayState === "pairing" ? "Pairing…" : relayState === "error" ? "Pairing failed" : "Not paired"}</span>{runtimeReady ? <button onClick={() => void revokeRuntime()} disabled={busy}><Unplug size={15} /> Revoke</button> : <button className="pair-button" onClick={() => void pairRuntime()} disabled={!pairingOffer.trim() || relayState === "pairing" || busy}><Link2 size={15} /> Pair runtime</button>}</div>
          </div>
        </section>
      </main>
    </div>
  );
}

function Capability({ icon: Icon, title, ready, detail }: { icon: typeof Sparkles; title: string; ready?: boolean; detail: string }) {
  return <article><div className="capability-icon"><Icon size={19} /></div><div><h3>{title}</h3><p>{detail}</p></div><span className={ready ? "status-badge ready" : "status-badge"}>{ready ? "Ready" : "Setup needed"}</span></article>;
}

function Connection({ name, ready, detail, href }: { name: string; ready?: boolean; detail: string; href?: string }) {
  return <article><span className={ready ? "connection-dot ready" : "connection-dot"} /><div><strong>{name}</strong><small>{detail}</small></div>{href && ready ? <a href={href} target="_blank" rel="noreferrer">Open ↗</a> : <span>{ready ? "Connected" : "Not configured"}</span>}</article>;
}
