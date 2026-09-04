import type { CellState } from "./types";

export function stateTone(state: CellState): "ok" | "warn" | "danger" | "steel" | "neutral" {
  if (state === "succeeded") return "ok";
  if (state === "denied" || state === "failed") return "danger";
  if (state === "running" || state === "leased") return "warn";
  if (state === "waiting") return "steel";
  return "neutral";
}
