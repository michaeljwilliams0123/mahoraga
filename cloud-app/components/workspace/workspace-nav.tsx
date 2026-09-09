import { FolderOpen, Layers3, MessageCircle, SlidersHorizontal } from "lucide-react";
import type { WorkspaceView } from "./workspace-types";
import { WORKSPACE_NAV_ITEMS } from "./workspace-types";

const ICONS = {
  chat: MessageCircle,
  work: Layers3,
  files: FolderOpen,
  advanced: SlidersHorizontal,
} satisfies Record<WorkspaceView, typeof MessageCircle>;

export function WorkspaceNav({ view, setView, onNavigate }: { view: WorkspaceView; setView: (view: WorkspaceView) => void; onNavigate?: () => void }) {
  return (
    <nav className="side-nav" aria-label="Workspace navigation">
      {WORKSPACE_NAV_ITEMS.map((item) => {
        const Icon = ICONS[item.id];
        return (
          <button
            key={item.id}
            type="button"
            className={view === item.id ? "active" : undefined}
            aria-current={view === item.id ? "page" : undefined}
            onClick={() => { setView(item.id); onNavigate?.(); }}
          >
            <Icon size={17} /> <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
