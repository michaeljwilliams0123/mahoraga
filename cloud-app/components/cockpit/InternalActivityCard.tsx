"use client";
import type { InternalActivity } from '@/lib/internal-activity';

const time = (value: number | null) => value === null ? 'Not observed yet' : new Date(value).toLocaleTimeString();
export function InternalActivityCard({ activity, label, busy, error, onSetEnabled }: {
 activity: InternalActivity | null; label: string; busy: boolean; error: string | null;
 onSetEnabled: (enabled: boolean) => Promise<void>;
}) {
 return <section className="internal-activity-card" aria-label="Background work">
  <header><div><span className="one-kicker">Background work</span><h2>{label}</h2></div>
   <button type="button" className="internal-activity-control" disabled={!activity || busy} onClick={() => { if (activity) void onSetEnabled(!activity.enabled); }}>
    {busy ? 'Confirming…' : activity?.enabled ? 'Pause internal work' : 'Resume internal work'}
   </button></header>
  <p>Scheduled checks continue when this dashboard is closed. Mahoraga assesses recent work and builds candidate plans when observations change.</p>
  <dl><div><dt>Last wake</dt><dd>{time(activity?.lastWakeAt ?? null)}</dd></div>
   <div><dt>Next wake</dt><dd>{activity?.enabled === false ? 'Paused by owner' : time(activity?.nextWakeAt ?? null)}</dd></div>
   <div><dt>Plans built</dt><dd>{activity?.artifactCount ?? 'Unverified'}</dd></div>
   <div><dt>Candidate actions</dt><dd>{activity?.candidateActionCount ?? 'Unverified'}</dd></div></dl>
  {activity?.lastError && <p role="status">Internal assessment is held. Another bounded wake is scheduled.</p>}
  {error && <p role="status">{error}</p>}
  <p className="internal-activity-note">This loop uses deterministic planning. Model execution and code promotion retain their separate verification gates.</p>
 </section>;
}
