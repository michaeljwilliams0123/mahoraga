import { create } from "zustand";
import { executeDirective } from "./actions";
import type { GithubSnapshot, TaskCell } from "./types";

type FleetState = {
  cells: TaskCell[];
  snapshot: GithubSnapshot | null;
  lastError: string | null;
  lastCommand: string | null;
  busy: boolean;
  paletteOpen: boolean;
  ingest: (cells: TaskCell[], snapshot?: GithubSnapshot) => void;
  setSnapshot: (snapshot: GithubSnapshot) => void;
  setBusy: (busy: boolean) => void;
  setError: (message: string | null) => void;
  clearCells: () => void;
  openPalette: () => void;
  closePalette: () => void;
  runCommand: (command: string) => Promise<void>;
};

export const useFleetStore = create<FleetState>((set, get) => ({
  cells: [],
  snapshot: null,
  lastError: null,
  lastCommand: null,
  busy: false,
  paletteOpen: false,
  ingest: (cells, snapshot) =>
    set((state) => ({
      cells: [...cells, ...state.cells].slice(0, 48),
      snapshot: snapshot ?? state.snapshot,
      lastError: null,
      busy: false,
    })),
  setSnapshot: (snapshot) => set({ snapshot }),
  setBusy: (busy) => set({ busy }),
  setError: (lastError) => set({ lastError, busy: false }),
  clearCells: () => set({ cells: [] }),
  openPalette: () => set({ paletteOpen: true }),
  closePalette: () => set({ paletteOpen: false }),
  runCommand: async (command) => {
    const next = command.trim();
    if (!next || get().busy) return;
    set({ busy: true, lastError: null, lastCommand: next, paletteOpen: false });
    try {
      const result = await executeDirective({ data: { command: next } });
      get().ingest(result.cells, result.snapshot);
    } catch (error) {
      set({
        lastError: error instanceof Error ? error.message : "Directive failed",
        busy: false,
      });
    }
  },
}));
