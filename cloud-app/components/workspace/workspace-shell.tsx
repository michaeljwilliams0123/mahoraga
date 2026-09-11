import { BrainCircuit, ExternalLink, Plus, ShieldCheck, X } from "lucide-react";
import { WorkspaceNav } from "./workspace-nav";
import type { WorkspaceShellProps } from "./workspace-types";

export function WorkspaceShell({
  view,
  setView,
  sidebarOpen,
  setSidebarOpen,
  busy,
  coreReady,
  onNewConversation,
  children,
}: WorkspaceShellProps) {
  return (
    <div className="workspace-shell">
      <aside className={sidebarOpen ? "sidebar sidebar-open" : "sidebar"}>
        <div className="brand-row">
          <div className="brand-mark" aria-hidden="true"><BrainCircuit size={18} /></div>
          <div className="brand-copy"><strong>Mahoraga</strong><span>One system</span></div>
          <button className="mobile-close" type="button" onClick={() => setSidebarOpen(false)} aria-label="Close navigation"><X size={18} /></button>
        </div>

        <button
          className="new-chat"
          type="button"
          onClick={() => {
            onNewConversation();
            setView("chat");
            setSidebarOpen(false);
          }}
          disabled={busy}
        >
          <Plus size={17} /> New conversation
        </button>

        <WorkspaceNav view={view} setView={setView} onNavigate={() => setSidebarOpen(false)} />
        <div className="sidebar-spacer" />

        <div className={coreReady ? "brain-card ready" : "brain-card"}>
          <span className="brain-orb"><span /></span>
          <div><strong>{coreReady ? "Brain connected" : "Brain offline"}</strong><span>{coreReady ? "Mahoraga chooses the lane." : "Connect in Chat to execute work."}</span></div>
        </div>

        <div className="privacy-card">
          <ShieldCheck size={16} />
          <span>Execution stays with the paired core. This browser never stores GitHub credentials.</span>
        </div>
        <a className="repo-link" href="https://github.com/michaeljwilliams0123/mahoraga" target="_blank" rel="noreferrer">Open GitHub <ExternalLink size={13} /></a>
      </aside>
      {sidebarOpen && <button className="sidebar-scrim" type="button" onClick={() => setSidebarOpen(false)} aria-label="Close navigation" />}
      <main className="main-panel">{children}</main>
    </div>
  );
}
