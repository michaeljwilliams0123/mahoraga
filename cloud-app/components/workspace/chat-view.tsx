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
import { MAX_INPUT_TEXT_CHARS } from "@/lib/runtime-config";
import { canSubmitDeterministicCognitiveChat, cognitiveCycleAvailable, predictiveChatAvailable, projectCapabilityFamilies } from "@/lib/capability-families";
import type { ChatViewProps, QuickActionId } from "./workspace-types";
import "./owner-pin.css";
import { GithubWorkspacePanel } from "./GithubWorkspacePanel";
import { CapabilityReadinessPanel } from "./CapabilityReadinessPanel";
import { CapabilityExplorer } from "./CapabilityExplorer";
import { validatePublicBridgeOrigin } from "@/lib/pages-owner-bridge-client";

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
    relay,
    capabilityObservation,
    onRefreshCapabilities,
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
  const capabilityFamilies = projectCapabilityFamilies(coreReady, capabilityObservation?.phase === "ready" ? runtimeCapabilities : []);
  const executionFamily = capabilityFamilies.find(family => family.id === "execution");
  const inspectOnly = runtimeCapabilities.some(route => route.capability === "cloud.inspect" && route.routable === true && route.enabled !== false)
    && !runtimeCapabilities.some(route => route.routable === true && route.enabled !== false
      && (/\\.(execute|write)$/.test(route.capability) || route.capability === "self.evolve" || route.capability === "image.generate"));
  const canSend = assistantReady || canSubmitDeterministicCognitiveChat(coreReady, runtimeCapabilities, input, files.length);

  useLayoutEffect(() => {
    const element = composer.current;
    if (!element) return;
    element.style.height = "auto";
    const nextHeight = Math.min(element.scrollHeight, 300);
    element.style.height = `${nextHeight}px`;
    element.style.overflowY = element.scrollHeight > 300 ? "auto" : "hidden";
  }, [composer, input]);

  function openCloudSignIn() {
    const origin = validatePublicBridgeOrigin(cloudBridgeOrigin);
    if (!origin) return;
    window.open(origin, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="one-chat-page">
      <header className="topbar one-topbar">
        <button className="menu-button" type="button" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><Menu size={19} /></button>
        <div className="brain-status ready">
          <span className="brain-dot" /> Workspace online
        </div>
        <div className={coreReady ? "brain-status ready" : new Set(["pairing", "resuming"]).has(relayState) ? "brain-status pairing" : "brain-status"}>
          <span className="brain-dot" /> Execution {brainLabel}
        </div>
        <div className="topbar-actions">
          <button className={voiceListening ? "icon-button active" : "icon-button"} type="button" onClick={toggleVoice} disabled={!voiceSupported} aria-label={voiceListening ? "Stop voice dictation" : "Start voice chat"} title={voiceSupported ? "Voice chat" : "Voice is not supported in this browser"}>
            {voiceListening ? <MicOff size={17} /> : <Mic size={17} />}
          </button>
          <button className="icon-button" type="button" onClick={speakLatest} aria-label="Read latest Mahoraga response aloud" title="Read aloud"><Volume2 size={17} /></button>
        </div>
      </header>

      {health?.deployment?.provider === "github-pages" && <GithubWorkspacePanel coreReady={coreReady} relay={relay} publishedCommit={health.deployment.commitSha} />}

      <details className="route-diagnostics">
        <summary>Route details <span>Capabilities, provider evidence and tools</span></summary>
        <CapabilityReadinessPanel connected={coreReady} capabilities={runtimeCapabilities} observation={capabilityObservation} onRefresh={onRefreshCapabilities} onChooseStarter={setInput} />
        <CapabilityExplorer coreReady={coreReady} capabilities={runtimeCapabilities} onChooseStarter={setInput} />
      </details>

      <section className="conversation-panel">
        {messages.length === 0 ? (
          <div className="one-hero">
            <div className="aura-mark" aria-hidden="true"><span /><span /><span /><Sparkles size={24} /></div>
            <span className="one-kicker">Mahoraga</span>
            <h1>One workspace.<br /><em>Every verified route.</em></h1>
            <p>Ask, plan, inspect, or act. Mahoraga shows what its runtime can actually do, without inventing unavailable providers.</p>

            <div className="capability-family-summary" aria-label="Observed capability readiness">
              {capabilityFamilies.map((family) => (
                <div key={family.id} className={`capability-family ${family.state}`}>
                  <strong>{family.label}</strong>
                  <span className="family-state">{family.id === "execution" && family.state === "routable" && inspectOnly ? "Inspect only"
                    : family.state === "routable" ? "Ready" : family.state === "core-only" ? "Approval needed"
                    : family.state === "unobserved" ? "Checking" : family.id === "execution" ? "No worker" : "Unavailable"}</span>
                </div>
              ))}
            </div>
            {coreReady && capabilityObservation?.phase === "ready" && executionFamily?.state === "unavailable" ? (
              <div className="execution-route-notice" role="status" data-testid="execution-provider-gap">
                <div><strong>Action workers not connected</strong>
                  <p>Your brain can answer and plan, but the execution broker has not reported a verified tool worker. Cloud and GitHub actions require separately connected, authenticated providers.</p></div>
                <button type="button" onClick={onRefreshCapabilities}>Recheck routes</button>
              </div>
            ) : inspectOnly && coreReady && capabilityObservation?.phase === "ready" ? (
              <div className="execution-route-notice" role="status" data-testid="execution-inspection-only">
                <div><strong>Read-only inspection available</strong>
                  <p>Cloud inspection is connected. Writing, deploying, browser control and desktop execution still require their own admitted workers.</p></div>
                <button type="button" onClick={onRefreshCapabilities}>Recheck routes</button>
              </div>
            ) : null}
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
            <div><span className="brain-orb"><span /></span><div><strong>Execution connection unavailable</strong><p>{cloudBridgeOrigin ? "Authenticate with the configured Cloudflare connector, then retry execution." : "Connect an execution runtime to chat, run tools, and load live GitHub status."} Relay pairing remains recovery only.</p></div></div>
            <div className="connect-controls">
              {cloudBridgeOrigin && <button type="button" onClick={openCloudSignIn}><Link2 size={16} /> Open Cloudflare sign-in</button>}
              <button type="button" onClick={reconnectRuntime} disabled={busy}>Retry execution connection</button>
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
            <div className="file-strip">
              {files.map((file) => (
                <span key={`${file.name}-${file.size}`}><Paperclip size={13} /> {file.name}<small>{readableBytes(file.size)}</small><button type="button" onClick={() => setFiles((current) => current.filter((item) => item !== file))} aria-label={`Remove ${file.name}`}><X size={12} /></button></span>
              ))}
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
            placeholder={voiceListening ? "Listening…" : assistantReady ? "Ask Mahoraga anything…" : localPredictionReady ? "Use /predict to simulate a numeric scenario…" : coreReady ? "Brain route unavailable — Mahoraga remains fail-closed." : "Connect or restore an execution runtime to execute work…"}
            aria-label="Message Mahoraga"
          />
          <div className="composer-actions">
            <input ref={fileInput} type="file" multiple hidden onChange={(event) => { addFiles(Array.from(event.target.files ?? [])); event.currentTarget.value = ""; }} />
            <button className="composer-tool" type="button" onClick={() => void runQuickAction("upload")} aria-label="Upload files" title="Upload"><Paperclip size={18} /></button>
            <button className={voiceListening ? "composer-tool listening" : "composer-tool"} type="button" onClick={toggleVoice} disabled={!voiceSupported} aria-label={voiceListening ? "Stop microphone" : "Voice chat"} title={voiceSupported ? "Voice chat" : "Voice unavailable"}>{voiceListening ? <MicOff size={18} /> : <Mic size={18} />}</button>
            <span className="composer-hint">{files.length > 0 ? `${files.length} staged · ${readableBytes(totalBytes)}` : health?.routing?.automaticPaidFallback === false ? "Brain-routed · no paid fallback" : "Brain-routed"}</span>
            <span id="composer-character-count" className={input.length >= MAX_INPUT_TEXT_CHARS * 0.9 ? "composer-count near-limit" : "composer-count"} aria-live="polite">{input.length.toLocaleString()} / {MAX_INPUT_TEXT_CHARS.toLocaleString()}</span>
            {busy ? (
              <button type="button" className="send-button" onClick={() => void stopActiveResponse()} aria-label="Stop response"><Square size={15} /></button>
            ) : (
              <button type="button" className="send-button" onClick={() => void submit()} disabled={!canSend || (!input.trim() && files.length === 0)} aria-label="Send"><ArrowUp size={18} /></button>
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
