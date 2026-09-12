import {
  ArrowUp,
  Check,
  ChevronDown,
  CircleAlert,
  FileOutput,
  GitPullRequestArrow,
  Hammer,
  Link2,
  LoaderCircle,
  Menu,
  Mic,
  MicOff,
  Paperclip,
  SendToBack,
  Sparkles,
  Square,
  Unplug,
  Upload,
  Volume2,
  WandSparkles,
  X,
} from "lucide-react";
import { MAX_INPUT_TEXT_CHARS } from "@/lib/runtime-config";
import type { ChatViewProps, QuickActionId } from "./workspace-types";

const ACTION_ICONS: Record<QuickActionId, typeof Upload> = {
  upload: Upload,
  build: Hammer,
  report: FileOutput,
  handoff: SendToBack,
  create: WandSparkles,
  ship: GitPullRequestArrow,
};

function readableBytes(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
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
    brainLabel,
    brainState,
    licensedRetryAvailable,
    health,
    healthError,
    relayState,
    pairingOffer,
    starters,
    quickActions,
    activeActionLabel,
    voiceSupported,
    voiceListening,
    composer,
    fileInput,
    bottom,
    setInput,
    setPairingOffer,
    setSidebarOpen,
    chooseStarter,
    addFiles,
    setFiles,
    submit,
    runQuickAction,
    toggleVoice,
    speakLatest,
    stopActiveResponse,
    pairRuntime,
    revokeRuntime,
    retryLicensed,
  } = props;

  return (
    <div className="one-chat-page">
      <header className="topbar one-topbar">
        <button className="menu-button" type="button" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><Menu size={19} /></button>
        <div className={coreReady ? "brain-status ready" : new Set(["pairing", "resuming"]).has(relayState) ? "brain-status pairing" : "brain-status"}>
          <span className="brain-dot" /> {brainLabel}
        </div>
        <div className="topbar-actions">
          <button className={voiceListening ? "icon-button active" : "icon-button"} type="button" onClick={toggleVoice} disabled={!voiceSupported} aria-label={voiceListening ? "Stop voice dictation" : "Start voice chat"} title={voiceSupported ? "Voice chat" : "Voice is not supported in this browser"}>
            {voiceListening ? <MicOff size={17} /> : <Mic size={17} />}
          </button>
          <button className="icon-button" type="button" onClick={speakLatest} aria-label="Read latest Mahoraga response aloud" title="Read aloud"><Volume2 size={17} /></button>
        </div>
      </header>

      <section className="conversation-panel">
        {messages.length === 0 ? (
          <div className="one-hero">
            <div className="aura-mark" aria-hidden="true"><span /><span /><span /><Sparkles size={24} /></div>
            <span className="one-kicker">Mahoraga</span>
            <h1>Say what you want.<br /><em>Mahoraga handles the lanes.</em></h1>
            <p>Talk, build, hand off, create, report, or ship from one conversation. The brain chooses the route and keeps the machinery out of your way.</p>

            <div className="quick-action-grid" aria-label="Quick actions">
              {quickActions.map((action) => {
                const Icon = ACTION_ICONS[action.id];
                return (
                  <button key={action.id} type="button" onClick={() => void runQuickAction(action.id)} disabled={busy || (action.requiresCore === true && !coreReady)}>
                    <span className={`quick-icon quick-${action.id}`}><Icon size={18} /></span>
                    <span><strong>{action.label}</strong><small>{action.description}</small></span>
                  </button>
                );
              })}
            </div>

            <div className="starter-row">
              {starters.map((starter) => {
                const Icon = starter.icon;
                return <button key={starter.title} type="button" onClick={() => chooseStarter(starter.prompt)}><Icon size={15} /> {starter.title}</button>;
              })}
            </div>
          </div>
        ) : (
          <div className="message-list one-message-list">
            {messages.map((message) => (
              <article key={message.id} className={`message-row message-${message.role}`}>
                <div className="message-avatar">{message.role === "assistant" ? <Sparkles size={15} /> : "You"}</div>
                <div className="message-body">
                  <div className="message-author">{message.role === "assistant" ? "Mahoraga" : "You"}</div>
                  <div className="message-text" style={{ whiteSpace: "pre-wrap" }}>{message.text}</div>
                </div>
              </article>
            ))}
          </div>
        )}

        {runtimeBusy && (
          <div className="live-work-card" aria-live="polite">
            <div className="live-work-head"><span className="work-pulse" /><strong>{activeActionLabel ? `${activeActionLabel} in progress` : "Mahoraga is working"}</strong><LoaderCircle className="spin" size={17} /></div>
            <p>The paired brain is choosing the lane, executing the work, and collecting evidence. Open Work or Advanced only if you want more detail.</p>
            <div className="work-flow" aria-hidden="true"><span>Understand</span><i /><span>Route</span><i /><span>Execute</span><i /><span>Verify</span></div>
          </div>
        )}
        <div ref={bottom} />
      </section>

      <section className="composer-shell">
        {runtimeError && (
          <div className="inline-alert" role="alert">
            <CircleAlert size={16} /> <span>{runtimeError}</span>
            {licensedRetryAvailable && <button type="button" onClick={() => void retryLicensed()}>Use licensed brain for this message</button>}
          </div>
        )}

        {!coreReady && relayState !== "resuming" && (
          <div className="connect-card">
            <div><span className="brain-orb"><span /></span><div><strong>Connect the Mahoraga brain</strong><p>The published interface is healthy. Pair an approved cloud or owner runtime when you want it to execute work.</p></div></div>
            <details>
              <summary>Connect securely <ChevronDown size={15} /></summary>
              <div className="connect-controls">
                <input value={pairingOffer} onChange={(event) => setPairingOffer(event.target.value)} placeholder="Paste pairing offer" aria-label="Runtime pairing offer" />
                <button type="button" onClick={() => void pairRuntime()} disabled={!pairingOffer.trim() || new Set(["pairing", "resuming"]).has(relayState)}>{new Set(["pairing", "resuming"]).has(relayState) ? <LoaderCircle className="spin" size={16} /> : <Link2 size={16} />} Connect</button>
              </div>
            </details>
          </div>
        )}

        <div className="composer-card one-composer">
          {files.length > 0 && (
            <div className="file-strip">
              {files.map((file) => (
                <span key={`${file.name}-${file.size}`}><Paperclip size={13} /> {file.name}<small>{readableBytes(file.size)}</small><button type="button" onClick={() => setFiles((current) => current.filter((item) => item !== file))} aria-label={`Remove ${file.name}`}><X size={12} /></button></span>
              ))}
            </div>
          )}
          <textarea
            ref={composer}
            value={input}
            maxLength={MAX_INPUT_TEXT_CHARS}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); }
            }}
            placeholder={voiceListening ? "Listening…" : coreReady ? "Ask Mahoraga anything…" : "Pair an approved runtime to execute work…"}
            aria-label="Message Mahoraga"
          />
          <div className="composer-actions">
            <input ref={fileInput} type="file" multiple hidden onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }} />
            <button className="composer-tool" type="button" onClick={() => void runQuickAction("upload")} aria-label="Upload files" title="Upload"><Paperclip size={18} /></button>
            <button className={voiceListening ? "composer-tool listening" : "composer-tool"} type="button" onClick={toggleVoice} disabled={!voiceSupported} aria-label={voiceListening ? "Stop microphone" : "Voice chat"} title={voiceSupported ? "Voice chat" : "Voice unavailable"}>{voiceListening ? <MicOff size={18} /> : <Mic size={18} />}</button>
            <span className="composer-hint">{files.length > 0 ? `${files.length} staged · ${readableBytes(totalBytes)}` : health?.routing?.automaticPaidFallback === false ? "Brain-routed · no paid fallback" : "Brain-routed"}</span>
            {busy ? (
              <button type="button" className="send-button" onClick={() => void stopActiveResponse()} aria-label="Stop response"><Square size={15} /></button>
            ) : (
              <button type="button" className="send-button" onClick={() => void submit()} disabled={!input.trim() && files.length === 0} aria-label="Send"><ArrowUp size={18} /></button>
            )}
          </div>
        </div>

        <div className="status-line" aria-live="polite">
          {brainState === "Connecting" ? <><LoaderCircle className="spin" size={14} /> Connecting</>
            : brainState === "Offline" ? <><Unplug size={14} /> Offline</>
              : brainState === "Ready" ? <><Check size={14} /> Ready to pair</>
                : <><Check size={14} /> {brainState}</>}
          {voiceListening && <span> · listening</span>}
          {healthError && <span> · workspace health unavailable</span>}
          {coreReady && <button type="button" onClick={() => void revokeRuntime()}>Disconnect</button>}
        </div>
      </section>
    </div>
  );
}
