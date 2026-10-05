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
  UserRound,
  Volume2,
  WandSparkles,
  X,
} from "lucide-react";
import { useLayoutEffect } from "react";
import { Streamdown } from "streamdown";
import { MAX_FILE_BYTES, MAX_FILES, MAX_INPUT_TEXT_CHARS, MAX_TOTAL_FILE_BYTES } from "@/lib/runtime-config";
import { handlingLabel, sessionLane, sessionLaneLabel, stagedHandling } from "@/lib/snippet-handling-truth";
import { canSubmitDeterministicCognitiveChat, cognitiveCycleAvailable, predictiveChatAvailable, projectCapabilityFamilies } from "@/lib/capability-families";
import type { ChatViewProps, QuickActionId } from "./workspace-types";
import "./owner-pin.css";

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
    assistantReady,
    runtimeCapabilities,
    brainLabel,
    brainState,
    licensedRetryAvailable,
    health,
    healthError,
    relayState,
    pairingOffer,
    ownerLoginRequired,
    ownerLoginPin,
    ownerLoginBusy,
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
    setOwnerLoginPin,
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
    onOwnerLogin,
    reconnectRuntime,
    revokeRuntime,
    retryLicensed,
  } = props;

  const pinComplete = /^\d{4}$/.test(ownerLoginPin);
  const cloudBridgeOrigin = process.env.NEXT_PUBLIC_MAHORAGA_BRIDGE_ORIGIN?.trim() ?? "";
  const localPredictionReady = predictiveChatAvailable(coreReady, runtimeCapabilities);
  const cognitiveCycleReady = cognitiveCycleAvailable(coreReady, runtimeCapabilities);
  const canSend = assistantReady || canSubmitDeterministicCognitiveChat(coreReady, runtimeCapabilities, input, files.length);
  const lane = sessionLane({ coreReady, relayState, ownerLoginRequired });

  useLayoutEffect(() => {
    const element = composer.current;
    if (!element) return;
    element.style.height = "auto";
    const nextHeight = Math.min(element.scrollHeight, 300);
    element.style.height = `${nextHeight}px`;
    element.style.overflowY = element.scrollHeight > 300 ? "auto" : "hidden";
  }, [composer, input]);

  function openCloudSignIn() {
    if (!cloudBridgeOrigin) return;
    window.open(cloudBridgeOrigin, "_blank", "noopener,noreferrer");
  }

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

            <div className="capability-family-summary" aria-label="Observed capability readiness">
              {projectCapabilityFamilies(coreReady, runtimeCapabilities).map((family) => (
                <div key={family.id} className={`capability-family ${family.state}`}>
                  <strong>{family.label}</strong>
                  <span>{family.state === "routable" ? "Routable" : family.state === "core-only" ? "Core route · outside zero-credit chat" : family.state === "unobserved" ? "Not observed" : "Unavailable"}{family.id === "agentic" && family.route === "cognitive.cycle" ? " · deliberates, assesses, plans, and decides with no automatic mutation" : family.id === "predictive" ? " · closed-loop calibration is canonical; live learning evidence is receipt-gated" : ""}</span>
                </div>
              ))}
            </div>
            {localPredictionReady ? (
              <button type="button" className="scenario-starter" onClick={() => setInput('/predict {"observedState":{"queueDepth":4},"stateUncertainty":0.2,"action":{"actionId":"add-capacity","effects":{"queueDepth":-2},"uncertainty":0.1}}')}>
                Try a scenario simulation · edit the numbers and effects before sending
              </button>
            ) : null}
            {cognitiveCycleReady ? (
              <button type="button" className="scenario-starter" onClick={() => setInput('/cycle {"members":[{"individualId":"builder","parentAgentId":"mahoraga-core","displayName":"Builder","archetype":"builder-mind","perspective":"implementation","communicationStyle":"evidence-first","traits":{"curiosity":0.7},"epistemicPosture":{"evidenceThreshold":0.8,"uncertaintyTolerance":0.4,"dissentDisposition":"surface-material-dissent"},"perspectiveTags":["engineering"],"privateEpisodicRefs":[]}],"requiredPerspectiveTags":["engineering"],"positions":[{"individualId":"builder","conclusion":"hold","confidence":0.8,"evidenceRefs":["owner:scenario"],"assumptions":[],"unknowns":[],"dissentTags":[]}],"metacognition":{"evidenceCoverage":0.9,"calibratedConfidence":0.8,"knownUnknowns":[],"materialConflictCount":0,"reversible":true},"observedState":{"queueDepth":4},"stateUncertainty":0.2,"proposedAction":{"actionId":"add-capacity","effects":{"queueDepth":-2},"uncertainty":0.1},"plannerSnapshot":{"workers":[],"activeLeases":[],"taskCounts":{},"objectives":[],"repository":{"verified":true},"providers":[]}}')}>
                Run the full cognitive loop · deliberate, assess, plan, predict, and emit a receipt
              </button>
            ) : null}

            <div className="quick-action-grid" aria-label="Quick actions">
              {quickActions.map((action) => {
                const Icon = ACTION_ICONS[action.id];
                return (
                  <button key={action.id} type="button" onClick={() => void runQuickAction(action.id)} disabled={busy || (action.requiresCore === true && !assistantReady)}>
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
                <div className="message-avatar">{message.role === "assistant" ? <Sparkles size={15} /> : <UserRound size={15} />}</div>
                <div className="message-body">
                  <div className="message-author">
                    {message.role === "assistant" ? "Mahoraga" : "You"}
                    {message.role === "assistant" && message.instantLocal ? <span className="instant-local-cue">Instant · local</span> : null}
                  </div>
                  {message.role === "assistant" ? (
                    <Streamdown className="message-text" skipHtml>{message.text}</Streamdown>
                  ) : (
                    <div className="message-text" style={{ whiteSpace: "pre-wrap" }}>{message.text}</div>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        {runtimeBusy && (
          <div className="live-work-card" aria-live="polite">
            <div className="live-work-head"><span className="work-pulse" /><strong>{activeActionLabel ? `${activeActionLabel} in progress` : "Thinking / recovering answer"}</strong><LoaderCircle className="spin" size={17} /></div>
            <p>{activeActionLabel ? "The paired brain is choosing the lane, executing the work, and collecting evidence. Open Work or Advanced only if you want more detail." : "The authenticated brain remains connected while this browser waits for the same durable answer. A delayed reply does not start a fallback or duplicate execution."}</p>
            <div className="work-flow" aria-hidden="true"><span>Understand</span><i /><span>Route</span><i /><span>Execute</span><i /><span>Verify</span></div>
          </div>
        )}
        <div ref={bottom} />
      </section>

      <section className="composer-shell">
        {runtimeError && (
          <div className="inline-alert" role="alert">
            <CircleAlert size={16} /> <span>{runtimeError}</span>
            {licensedRetryAvailable && <button type="button" onClick={() => void retryLicensed()}>Use licensed ChatGPT/Codex for this message</button>}
          </div>
        )}

        {ownerLoginRequired && !coreReady && (
          <div className="connect-card owner-pin-card">
            <div><span className="brain-orb"><span /></span><div><strong>Sign in to Mahoraga</strong><p>Enter your 4-digit owner PIN. Verified server-side and exchanged only for a secure owner session.</p></div></div>
            <div className="connect-controls owner-pin-controls">
              <div className="owner-pin-field">
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  value={ownerLoginPin}
                  onChange={(event) => setOwnerLoginPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && pinComplete && !ownerLoginBusy) {
                      event.preventDefault();
                      void onOwnerLogin();
                    }
                  }}
                  placeholder="••••"
                  aria-label="Owner PIN"
                  aria-describedby="owner-pin-hint"
                  autoComplete="one-time-code"
                  autoFocus
                />
                <div className="owner-pin-slots" aria-hidden="true">
                  {[0, 1, 2, 3].map((index) => (
                    <span key={index} className={ownerLoginPin.length > index ? "filled" : ""} />
                  ))}
                </div>
              </div>
              <button type="button" onClick={() => void onOwnerLogin()} disabled={!pinComplete || ownerLoginBusy}>
                {ownerLoginBusy ? <LoaderCircle className="spin" size={16} /> : <Link2 size={16} />} Sign in
              </button>
            </div>
            <p id="owner-pin-hint" className="owner-pin-hint">{ownerLoginPin.length}/4 digits · lockout after 5 failed attempts</p>
          </div>
        )}

        {!coreReady && relayState !== "resuming" && !ownerLoginRequired && (
          <div className="connect-card">
            <div><span className="brain-orb"><span /></span><div><strong>Cloud connection unavailable</strong><p>Authenticate with Cloudflare first, then retry the cloud connection. Relay pairing is recovery only.</p></div></div>
            <div className="connect-controls">
              <button type="button" onClick={openCloudSignIn} disabled={!cloudBridgeOrigin}><Link2 size={16} /> Open Cloudflare sign-in</button>
              <button type="button" onClick={reconnectRuntime} disabled={busy}>Retry cloud connection</button>
            </div>
            <details>
              <summary>Recovery connection (advanced) <ChevronDown size={15} /></summary>
              <p>Do not enter your owner PIN here. Paste only a generated recovery pairing offer from the Mahoraga runtime.</p>
              <div className="connect-controls">
                <input value={pairingOffer} onChange={(event) => setPairingOffer(event.target.value)} placeholder="Paste pairing offer" aria-label="Runtime pairing offer" />
                <button type="button" onClick={() => void pairRuntime()} disabled={!pairingOffer.trim() || new Set(["pairing", "resuming"]).has(relayState)}>{new Set(["pairing", "resuming"]).has(relayState) ? <LoaderCircle className="spin" size={16} /> : <Link2 size={16} />} Connect recovery relay</button>
              </div>
            </details>
          </div>
        )}

        <div className="composer-card one-composer">
          {files.length > 0 && (
            <div className="file-strip" aria-label="Staged attachment handling">
              {files.map((file) => {
                const kind = stagedHandling(file);
                return (
                  <span key={`${file.name}-${file.size}`} title={handlingLabel(kind)}>
                    <Paperclip size={13} /> {file.name}
                    <small>{readableBytes(file.size)} · {kind === "text-snippet" ? "text snippet" : "excluded from model"}</small>
                    <button type="button" onClick={() => setFiles((current) => current.filter((item) => item !== file))} aria-label={`Remove ${file.name}`}><X size={12} /></button>
                  </span>
                );
              })}
              <small>
                Limits: {MAX_FILES} files, {readableBytes(MAX_FILE_BYTES)} each, {readableBytes(MAX_TOTAL_FILE_BYTES)} total. Staged {files.length} / {readableBytes(totalBytes)}. Oversized files are rejected and not staged. Binary files are not model-readable.
              </small>
            </div>
          )}
          <textarea
            ref={composer}
            value={input}
            rows={1}
            maxLength={MAX_INPUT_TEXT_CHARS}
            aria-describedby="composer-character-count"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(); }
            }}
            placeholder={voiceListening ? "Listening…" : assistantReady ? "Ask Mahoraga anything…" : localPredictionReady ? "Use /predict to simulate a numeric scenario…" : coreReady ? "Brain route unavailable — Mahoraga remains fail-closed." : "Sign in or restore the cloud connection to execute work…"}
            aria-label="Message Mahoraga"
          />
          <div className="composer-actions">
            <input ref={fileInput} type="file" multiple hidden onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }} />
            <button className="composer-tool" type="button" onClick={() => void runQuickAction("upload")} aria-label="Upload files" title="Upload"><Paperclip size={18} /></button>
            <button className={voiceListening ? "composer-tool listening" : "composer-tool"} type="button" onClick={toggleVoice} disabled={!voiceSupported} aria-label={voiceListening ? "Stop microphone" : "Voice chat"} title={voiceSupported ? "Voice chat" : "Voice unavailable"}>{voiceListening ? <MicOff size={18} /> : <Mic size={18} />}</button>
            <span className="composer-hint">{files.length > 0 ? `${files.length} staged · ${readableBytes(totalBytes)} · text snippets only are model-visible` : health?.routing?.automaticPaidFallback === false ? "Brain-routed · no paid fallback" : "Brain-routed"}</span>
            <span id="composer-character-count" className={input.length >= MAX_INPUT_TEXT_CHARS * 0.9 ? "composer-count near-limit" : "composer-count"} aria-live="polite">{input.length.toLocaleString()} / {MAX_INPUT_TEXT_CHARS.toLocaleString()}</span>
            {busy ? (
              <button type="button" className="send-button" onClick={() => void stopActiveResponse()} aria-label="Stop response"><Square size={15} /></button>
            ) : (
              <button type="button" className="send-button" onClick={() => void submit()} disabled={!canSend || (!input.trim() && files.length === 0)} aria-label="Send"><ArrowUp size={18} /></button>
            )}
          </div>
        </div>

        <div className="status-line" aria-live="polite">
          {lane === "connecting" ? <><LoaderCircle className="spin" size={14} /> Connecting</>
            : lane === "unavailable" ? <><Unplug size={14} /> Unavailable</>
              : lane === "access-required" ? <><CircleAlert size={14} /> Access required</>
                : lane === "recovery-available" ? <><Link2 size={14} /> Recovery available</>
                  : <><Check size={14} /> Authenticated</>}
          <span> · {sessionLaneLabel(lane)}</span>
          <span> · brain {brainState}</span>
          {voiceListening && <span> · listening</span>}
          {healthError && <span> · workspace health unavailable</span>}
          {coreReady && <button type="button" onClick={() => void revokeRuntime()}>Disconnect</button>}
        </div>
      </section>
    </div>
  );
}
