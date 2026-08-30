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
  ChevronDown,
  CircleAlert,
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
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { MessageResponse } from "@/components/ai-elements/message";
import { MAX_FILE_BYTES, MAX_FILES, MAX_TOTAL_FILE_BYTES, MODEL_LABEL } from "@/lib/runtime-config";

type CapabilityName = "chat" | "files" | "datasetAnalysis" | "webResearch" | "browser" | "github" | "gitlab";
type Health = {
  ok: boolean;
  model: { id: string; label: string; reasoning: string };
  capabilities: Record<CapabilityName, boolean>;
  boundaries: { executionPlane: string; localExtensionRequired: boolean; localDeviceMutationAllowed: boolean };
};

const starters = [
  { icon: Database, title: "Analyze a complex dataset", prompt: "Analyze the attached dataset. Find material patterns, anomalies, competing explanations, data-quality limitations, and the three most important actions. Quantify every finding you can." },
  { icon: Search, title: "Research and synthesize", prompt: "Research this question using current sources, reconcile disagreements, and give me a decision-ready conclusion with citations: " },
  { icon: FileText, title: "Review a document", prompt: "Review the attached document as a senior analyst. Surface hidden obligations, contradictions, risks, missing evidence, and practical next steps." },
  { icon: MonitorUp, title: "Run an approved browser task", prompt: "Use the isolated cloud browser, if connected, to complete this bounded task. Stop for approval before any action: " },
];

function readableBytes(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

export function Workspace() {
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, status, error, stop, setMessages, addToolApprovalResponse } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });
  const busy = status === "submitted" || status === "streaming";
  const totalBytes = useMemo(() => files.reduce((sum, file) => sum + file.size, 0), [files]);

  useEffect(() => {
    fetch("/api/health", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("health-failed");
        setHealth((await response.json()) as Health);
      })
      .catch(() => setHealthError(true));
  }, []);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, status]);

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
    if ((!text && files.length === 0) || busy || !health?.capabilities.chat) return;
    const transfer = new DataTransfer();
    files.forEach((file) => transfer.items.add(file));
    setInput("");
    setFiles([]);
    await sendMessage({ text, files: transfer.files });
  }

  return (
    <div className="workspace-shell">
      <aside className={sidebarOpen ? "sidebar sidebar-open" : "sidebar"}>
        <div className="brand-row">
          <div className="brand-mark">M</div>
          <div><strong>Mahoraga</strong><span>Cloud workspace</span></div>
          <button className="mobile-close" onClick={() => setSidebarOpen(false)} aria-label="Close navigation"><X size={18} /></button>
        </div>
        <button className="new-chat" onClick={() => { setMessages([]); setInput(""); setSidebarOpen(false); }}><Plus size={17} /> New conversation</button>
        <nav className="side-nav" aria-label="Workspace navigation">
          <a href="#chat" className="active"><Sparkles size={17} /> Chat</a>
          <a href="#capabilities"><Bot size={17} /> Capabilities</a>
          <a href="#connections"><Link2 size={17} /> Connections</a>
        </nav>
        <div className="sidebar-spacer" />
        <div className="privacy-card"><ShieldCheck size={18} /><div><strong>Cloud-only boundary</strong><span>No local extension, browser, file, or device mutation.</span></div></div>
        <a className="repo-link" href="https://github.com/michaeljwilliams0123/mahoraga" target="_blank" rel="noreferrer">GitHub repository <span>↗</span></a>
      </aside>
      {sidebarOpen && <button className="sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-label="Close navigation" />}

      <main className="main-panel" id="chat">
        <header className="topbar">
          <button className="menu-button" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
          <button className="model-pill" type="button" aria-label="Active model"><Sparkles size={15} /> {health?.model.label ?? MODEL_LABEL} <ChevronDown size={14} /></button>
          <div className={health?.ok ? "live-state ready" : "live-state"}><span /> {health?.ok ? "Model connected" : healthError ? "Health unavailable" : "Checking runtime"}</div>
        </header>

        <section className="conversation" aria-live="polite">
          {messages.length === 0 ? (
            <div className="welcome">
              <div className="welcome-mark"><Sparkles size={26} /></div>
              <h1>What are we working on?</h1>
              <p>Reason across files and datasets, research the web, or run an approval-gated cloud browser task.</p>
              <div className="starter-grid">
                {starters.map((starter) => (
                  <button key={starter.title} onClick={() => { setInput(starter.prompt); document.querySelector<HTMLTextAreaElement>("#composer")?.focus(); }}>
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
              {status === "submitted" && <div className="thinking-line"><LoaderCircle className="spin" size={17} /> Mahoraga is interpreting the task…</div>}
              {error && <div className="error-banner"><CircleAlert size={17} /><span>{error.message || "The request failed."}</span></div>}
              <div ref={bottom} />
            </div>
          )}
        </section>

        <section className="composer-zone">
          <div className="composer-card">
            {files.length > 0 && <div className="attachment-row">{files.map((file, index) => <div className="attachment-chip" key={`${file.name}-${file.lastModified}`}><FileText size={15} /><span>{file.name}<small>{readableBytes(file.size)}</small></span><button onClick={() => setFiles(files.filter((_, i) => i !== index))} aria-label={`Remove ${file.name}`}><X size={14} /></button></div>)}</div>}
            <textarea id="composer" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); } }} placeholder={health?.capabilities.chat === false ? "Connect AI Gateway to begin" : "Message Mahoraga"} rows={1} disabled={health?.capabilities.chat === false} />
            <div className="composer-actions">
              <input ref={fileInput} type="file" multiple hidden accept=".csv,.tsv,.json,.txt,.md,.pdf,.xlsx,image/*" onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
              <button className="attach" onClick={() => fileInput.current?.click()} disabled={busy || files.length >= MAX_FILES} aria-label="Attach files"><Paperclip size={18} /></button>
              <span className="mode-label"><Sparkles size={14} /> Pro reasoning</span>
              <span className="file-limit">{files.length ? `${files.length}/${MAX_FILES} · ${readableBytes(totalBytes)}` : "Files · data · images"}</span>
              {busy ? <button className="send-button" onClick={stop} aria-label="Stop response"><Square size={14} fill="currentColor" /></button> : <button className="send-button" onClick={() => void submit()} disabled={(!input.trim() && files.length === 0) || !health?.capabilities.chat} aria-label="Send message"><ArrowUp size={18} /></button>}
            </div>
          </div>
          <p className="composer-footnote">Cloud execution only. Verify important findings. Browser actions pause for explicit approval.</p>
        </section>

        <section className="capability-section" id="capabilities">
          <div className="section-heading"><span>Runtime</span><h2>Capabilities you can actually use</h2><p>Each state comes from the deployed backend configuration.</p></div>
          <div className="capability-grid">
            <Capability icon={Sparkles} title="Pro reasoning" ready={health?.capabilities.chat} detail="GPT-5.6 Sol · Pro mode · max effort" />
            <Capability icon={Database} title="File + data analysis" ready={health?.capabilities.datasetAnalysis} detail="CSV, JSON, PDF, documents, and images" />
            <Capability icon={Globe2} title="Grounded web research" ready={health?.capabilities.webResearch} detail="Live search with returned sources" />
            <Capability icon={MonitorUp} title="Isolated browser" ready={health?.capabilities.browser} detail={health?.capabilities.browser ? "Cloud provider · approval gated" : "Needs browser provider secrets"} />
          </div>
        </section>

        <section className="capability-section connections" id="connections">
          <div className="section-heading"><span>Connections</span><h2>No simulated integrations</h2><p>A connector is only shown as ready when its deployment credential exists.</p></div>
          <div className="connection-list">
            <Connection name="Vercel AI Gateway" ready={health?.capabilities.chat} detail="Model, analysis, and web tools" />
            <Connection name="GitHub" ready={health?.capabilities.github} detail="Private repository operations" />
            <Connection name="GitLab" ready={health?.capabilities.gitlab} detail="Merge request and pipeline operations" />
            <Connection name="Cloud browser" ready={health?.capabilities.browser} detail="No local Chrome extension" />
          </div>
        </section>
      </main>
    </div>
  );
}

function Capability({ icon: Icon, title, ready, detail }: { icon: typeof Sparkles; title: string; ready?: boolean; detail: string }) {
  return <article><div className="capability-icon"><Icon size={19} /></div><div><h3>{title}</h3><p>{detail}</p></div><span className={ready ? "status-badge ready" : "status-badge"}>{ready ? "Ready" : "Setup needed"}</span></article>;
}

function Connection({ name, ready, detail }: { name: string; ready?: boolean; detail: string }) {
  return <article><span className={ready ? "connection-dot ready" : "connection-dot"} /><div><strong>{name}</strong><small>{detail}</small></div><span>{ready ? "Connected" : "Not configured"}</span></article>;
}
