"use client";

import type { WorkspaceView } from "./workspace-types";
import { WORKSPACE_NAV_ITEMS } from "./workspace-types";

export function WorkspaceNav({
  view,
  setView,
  onNavigate,
}: {
  view: WorkspaceView;
  setView: (view: WorkspaceView) => void;
  onNavigate?: () => void;
}) {
  return (
    <nav className="side-nav" aria-label="Workspace navigation">
      {WORKSPACE_NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={view === item.id ? "active" : undefined}
          aria-current={view === item.id ? "page" : undefined}
          onClick={() => {
            setView(item.id);
            onNavigate?.();
          }}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
