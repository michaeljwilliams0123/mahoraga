import type { AssistantRespondOutput } from "../contracts/worker-result.ts";

export function normalizeAssistantCompletion(value: unknown): AssistantRespondOutput | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const answer = (value as Record<string, unknown>).answer;
  if (typeof answer !== "string") return null;
  const normalized = answer.trim();
  if (!normalized) return null;
  return Object.freeze({ answer: normalized });
}
