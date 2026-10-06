"use client";
import { CYCLE_STARTER, PREDICTION_STARTER, cognitiveCycleAvailable, predictiveChatAvailable, projectCapabilityFamilies, projectCognitiveAbilities } from '@/lib/capability-families';
import type { RuntimeCapability } from '@/lib/runtime-relay';
import type { CapabilityObservationState } from '@/lib/capability-observer';
export function CapabilityReadinessPanel({ connected, capabilities, observation, onRefresh, onChooseStarter }: {
  connected: boolean; capabilities: RuntimeCapability[]; observation: CapabilityObservationState | null;
  onRefresh: () => void; onChooseStarter: (text: string) => void;
}) {
  const observedCapabilities = observation?.phase === 'ready' ? capabilities : [];
  const families = projectCapabilityFamilies(connected, observedCapabilities).filter(family => family.id !== 'execution');
  const cognitiveAbilities = projectCognitiveAbilities(connected, capabilities, observation?.phase);
  return <section className="github-workspace-panel" aria-label="Runtime capability readiness">
    <div className="github-workspace-heading"><h2>Predict, plan, and generate</h2>
      <button type="button" onClick={onRefresh} disabled={!connected || observation?.phase === 'loading'}>Refresh abilities</button></div>
    <p>{!connected ? 'Connect an execution runtime to check live abilities.' : observation?.phase === 'loading' ? 'Checking current runtime abilities…' : observation?.phase === 'error' ? 'Readiness check failed. Previous availability has been cleared; refresh to retry.' : 'Runtime connected. Each ability has its own readiness; prediction and planning can be available while generation is unavailable.'}</p>
    <div className="github-workspace-grid">{families.map(family => {
      const prompt = family.id === 'predictive' && predictiveChatAvailable(connected, observedCapabilities) ? PREDICTION_STARTER
        : family.id === 'agentic' && cognitiveCycleAvailable(connected, observedCapabilities) ? CYCLE_STARTER
        : family.id === 'generative' && family.state === 'routable' ? 'Create a concise draft from this goal: ' : null;
      return <section key={family.id} aria-label={`${family.label} readiness`}><h3>{family.label}</h3>
        <p>{family.state === 'routable' ? 'Available' : family.state === 'unobserved' ? 'Not connected' : family.state === 'core-only' ? 'Outside zero-credit chat' : 'Unavailable'}</p>
        <p>{family.id === 'predictive' ? 'Simulate a proposed change and inspect uncertainty.' : family.id === 'agentic' ? 'Deliberate, assess, and plan with a cognitive receipt. Execution requires separate authority.' : 'Generate a response through the admitted assistant provider.'}</p>
        {family.reason && connected && <p>Reason: {family.reason}</p>}
        <button type="button" disabled={!prompt || observation?.phase === 'loading'} onClick={() => prompt && onChooseStarter(prompt)}>{family.id === 'predictive' ? 'Draft prediction scenario' : family.id === 'agentic' ? 'Draft planning scenario' : 'Draft a generation request'}</button>
      </section>;
    })}</div>
    <details className="capability-explorer">
      <summary>Cognitive tools and evidence</summary>
      <p>Planning and prediction are usable when their live routes are available. AGI and SGI are not runtime switches or established intelligence levels. A route observation is not an execution receipt or proof of collective superiority.</p>
      <div className="github-workspace-grid">{cognitiveAbilities.map(ability => <section key={ability.capability} aria-label={`${ability.label} capability`}>
        <h3>{ability.label}</h3>
        <p>{ability.state === 'routable' ? 'Route available' : ability.state === 'core-only' ? 'Outside zero-credit chat' : ability.state === 'unobserved' ? 'Not observed' : 'Unavailable'}</p>
        <p>{ability.description}</p>
        {ability.reason && <p>Reason: {ability.reason}</p>}
        <p>Evidence: {ability.evidence}</p>
        {ability.starter && <button type="button" onClick={() => onChooseStarter(ability.starter!)}>Draft {ability.capability === 'cognitive.predict' ? 'prediction' : 'planning'} scenario</button>}
      </section>)}</div>
    </details>
    {observation?.phase === 'ready' && <p className="muted">Checked {observation.observedAt} · updates every 30 seconds and when you return to this tab. Drafts fill the composer for review before sending.</p>}
  </section>;
}
