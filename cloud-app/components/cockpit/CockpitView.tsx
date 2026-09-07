"use client";

import type { CockpitViewProps } from "../workspace/workspace-types";
import { CommandCockpit } from "./CommandCockpit";

export function CockpitView({ coreReady, health, healthError, onRequestPairing, onOpenOperations }: CockpitViewProps) {
  return (
    <section className="connection-panel cockpit-wrap" aria-label="Cockpit">
      <CommandCockpit
        coreReady={coreReady}
        healthJson={health}
        healthError={healthError}
        onRequestPairing={onRequestPairing}
        onOpenOperations={onOpenOperations}
      />
    </section>
  );
}
