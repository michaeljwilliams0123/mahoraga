"use client";

import { Plus, ShieldCheck, X } from "lucide-react";
import { WorkspaceNav } from "./workspace-nav";
import type { WorkspaceShellProps } from "./workspace-types";

export function WorkspaceShell({
  view,
  setView,
  sidebarOpen,
  setSidebarOpen,
  busy,
  onNewConversation,
  children,
}: WorkspaceShellProps) {
  return (
    <div className="workspace-shell">
      <aside className={sidebarOpen ? "sidebar sidebar-open" : "sidebar"}>
        <div className="brand-row">
          <div className="brand-mark">M</div>
          <div>
            <strong>Mahoraga</strong>
            <span>Unified workspace</span>
          </div>
          <button className="mobile-close" onClick={() => setSidebarOpen(false)} aria-label="Close navigation">
            <X size={18} />
          </button>
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
        <div className="privacy-card">
          <ShieldCheck size={18} />
          <div>
            <strong>One core authority</strong>
            <span>
              The Vercel workspace is an encrypted client. Policy, routing, verification, and execution authority remain with the paired
              Mahoraga core.
            </span>
          </div>
        </div>
        <a
          className="repo-link"
          href="https://github.com/michaeljwilliams0123/mahoraga/issues/new?template=codex-cloud-task.yml"
          target="_blank"
          rel="noreferrer"
        >
          Repository task <span>↗</span>
        </a>
      </aside>
      {sidebarOpen && <button className="sidebar-scrim" type="button" onClick={() => setSidebarOpen(false)} aria-label="Close navigation" />}
      <main className="main-panel">{children}</main>
    </div>
  );
}
