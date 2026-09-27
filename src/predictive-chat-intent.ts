export type PredictiveChatInput = {
  observedState: Record<string, number>;
  stateUncertainty: number;
  action: { actionId: string; effects: Record<string, number>; uncertainty: number };
};

/** Explicit numeric scenario input only; the worker validates the world-model contract. */
export function parsePredictiveChatIntent(content: unknown): PredictiveChatInput | null {
  if (typeof content !== "string" || !/^\/predict(?:\s|$)/i.test(content.trim())) return null;
  const text = content.trim();
  if (text.length > 1000) throw new TypeError("predictive-chat-input-invalid");
  let value: unknown;
  try { value = JSON.parse(text.replace(/^\/predict\s*/i, "")); }
  catch { throw new TypeError("predictive-chat-input-invalid"); }
  if (!record(value) || !keys(value, ["observedState", "stateUncertainty", "action"])
    || !record(value.observedState) || !record(value.action)
    || !keys(value.action, ["actionId", "effects", "uncertainty"])
    || !record(value.action.effects)) throw new TypeError("predictive-chat-input-invalid");
  return value as PredictiveChatInput;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, expected: string[]): boolean {
  return Object.keys(value).length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}
