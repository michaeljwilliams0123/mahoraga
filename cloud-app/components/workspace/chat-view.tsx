"use client";

import {
  ArrowUp,
  Bot,
  Check,
  CircleAlert,
  Link2,
  LoaderCircle,
  Menu,
  Paperclip,
  ShieldCheck,
  Sparkles,
  Square,
  Unplug,
  X,
} from "lucide-react";
import { MAX_INPUT_TEXT_CHARS } from "@/lib/runtime-config";
import type { ChatViewProps, TaskMode } from "./workspace-types";

function readableBytes(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

export function ChatView(props: ChatViewProps) {
  const {
    messages,
    runtimeBusy,
    runtimeError,
    input,
    files,
    totalBytes,
    busy,
    coreReady,
    taskMode,
    routeLabel,
    health,
    healthError,
    relayState,
    pairingOffer,
    routableCapabilities,
    starters,
    composer,
    fileInput,
    bottom,
    setInput,
    setTaskMode,
    setPairingOffer,
    setSidebarOpen,
    chooseStarter,
    addFiles,
    setFiles,
    submit,
    stopActiveResponse,
    pairRuntime,
    revokeRuntime,
  } = props;

  return (
    <>
      <header className="topbar">
        <button className="menu-button" type="button" onClick={() => setSidebarOpen(true)} aria-label="Open navigation">
          <Menu size={19} />
        </button>
        <div className="route-status">
          <span className={coreReady ? "status-dot status-ready" : "status-dot"} />
          <span>{routeLabel}</span>
        </div>
        <div className="mode-switch" aria-label="Task mode">
          {(["auto", "ask", "act"] as TaskMode[]).map((mode) => (
            <button key={mode} type="button" aria-pressed={taskMode === mode} onClick={() => setTaskMode(mode)}>
              {mode[0].toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </header>

      <section className="conversation-panel">
        {messages.length === 0 ? (
          <div className="welcome-panel">
            <div className="welcome-mark">
              <Sparkles size={24} />
            </div>
            <h1>One Mahoraga. One core.</h1>
            <p>
              Pair the runtime once. Every conversation then enters the same encrypted Conversation Gateway, policy router, verification
              path, and receipt graph.
            </p>
            <div className="starter-grid">
              {starters.map((starter) => {
                const Icon = starter.icon;
                return (
                  <button key={starter.title} type="button" aria-label={`Start: ${starter.title}`} onClick={() => chooseStarter(starter.prompt)}>
                    <Icon size={18} />
                    <strong>{starter.title}</strong>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="message-list">
            {messages.map((message) => (
              <article key={message.id} className={`message-row message-${message.role}`}>
                <div className="message-avatar">{message.role === "assistant" ? <Sparkles size={16} /> : "You"}</div>
                <div className="message-body">
                  <div className="message-text" style={{ whiteSpace: "pre-wrap" }}>
                    {message.text}
                  </div>
                </div>
              </article>
            ))}
            {runtimeBusy && (
              <div className="message-row message-assistant">
                <div className="message-avatar">
                  <Sparkles size={16} />
                </div>
                <div className="message-body">
                  <LoaderCircle className="spin" size={18} /> Mahoraga is working through the core…
                </div>
              </div>
            )}
          </div>
        )}
        <div ref={bottom} />
      </section>

      <section className="composer-shell">
        {runtimeError && (
          <div className="inline-alert" role="alert">
            <CircleAlert size={16} /> {runtimeError}
          </div>
        )}
        <div className="composer-card">
          {files.length > 0 && (
            <div className="file-strip">
              {files.map((file) => (
                <span key={`${file.name}-${file.size}`}>
                  <Paperclip size={13} /> {file.name}
                  <button type="button" onClick={() => setFiles((current) => current.filter((item) => item !== file))} aria-label={`Remove ${file.name}`}>
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
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
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              onChange={(event) => {
                addFiles(Array.from(event.target.files ?? []));
                event.currentTarget.value = "";
              }}
            />
            <button type="button" onClick={() => fileInput.current?.click()} aria-label="Attach files" title="Attach files">
              <Paperclip size={18} />
            </button>
            <span className="composer-hint">
              {files.length > 0
                ? `${files.length} file(s) · ${readableBytes(totalBytes)} · core artifact bridge required`
                : "Zero-Codex route · no paid fallback"}
            </span>
            {busy ? (
              <button type="button" className="send-button" onClick={() => void stopActiveResponse()} aria-label="Stop response" title="Stop response">
                <Square size={16} />
              </button>
            ) : (
              <button
                type="button"
                className="send-button"
                onClick={() => void submit()}
                disabled={!input.trim() && files.length === 0}
                aria-label="Send"
              >
                <ArrowUp size={18} />
              </button>
            )}
          </div>
        </div>
        <div className="status-line" aria-live="polite">
          {coreReady ? (
            <>
              <Check size={14} /> Core paired
            </>
          ) : relayState === "pairing" ? (
            <>
              <LoaderCircle className="spin" size={14} /> Pairing…
            </>
          ) : (
            <>
              <Unplug size={14} /> Core not paired
            </>
          )}
          {healthError && <span> · workspace health unavailable</span>}
          {health?.routing?.automaticPaidFallback === false && <span> · paid fallback disabled</span>}
        </div>
      </section>

      <section className="connection-panel" id="connections">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Encrypted connection</span>
            <h2>Pair runtime</h2>
          </div>
          <ShieldCheck size={20} />
        </div>
        <p>
          The pairing offer establishes an end-to-end encrypted session to the authoritative Mahoraga core. Pairing changes connectivity
          only; it does not select a different brain.
        </p>
        {relayState !== "connected" ? (
          <div className="pair-row">
            <input
              value={pairingOffer}
              onChange={(event) => setPairingOffer(event.target.value)}
              placeholder="Paste pairing offer"
              aria-label="Runtime pairing offer"
            />
            <button type="button" onClick={() => void pairRuntime()} disabled={!pairingOffer.trim() || relayState === "pairing"}>
              {relayState === "pairing" ? <LoaderCircle className="spin" size={16} /> : <Link2 size={16} />} Pair runtime
            </button>
          </div>
        ) : (
          <div className="pair-row">
            <span>
              <Check size={16} /> Authoritative core connected
            </span>
            <button type="button" onClick={() => void revokeRuntime()}>
              <Unplug size={16} /> Revoke
            </button>
          </div>
        )}
      </section>

      <section className="capability-panel" id="capabilities">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Core-routed</span>
            <h2>Capabilities</h2>
          </div>
          <Bot size={20} />
        </div>
        <p>Capability readiness is reported by the paired core. The browser does not choose providers or grant execution authority.</p>
        {routableCapabilities.length === 0 ? (
          <p className="muted">Pair the core to read its routable capability index.</p>
        ) : (
          <div className="capability-list">
            {routableCapabilities.map((capability) => (
              <div key={capability.capability}>
                <strong>{capability.capability}</strong>
                <span>routable</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
