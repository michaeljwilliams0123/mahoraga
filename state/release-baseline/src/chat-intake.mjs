import { classifyTaskIntent } from "./task-intent.mjs";

const MODES = new Set(["auto", "ask", "act"]);
const ACTION_WORDS = /\b(?:apply|build|change|create|delete|deploy|execute|fix|implement|install|move|open|publish|repair|restart|run|scan|send|start|stop|update|write)\b/i;

export function classifyChatTurn({ mode = "auto", content = "", attachmentCount = 0, availableCapabilities = [] } = {}) {
  if (!MODES.has(mode)) throw new TypeError("chat-mode-invalid");
  const text = typeof content === "string" ? content.trim() : "";
  if (!text && attachmentCount === 0) throw new TypeError("chat-content-required");
  const available = Array.isArray(availableCapabilities) ? availableCapabilities : [];
  const registered = classifyTaskIntent({ content: text, attachmentCount, availableCapabilities: available });
  if (registered.capability && registered.capability !== "provider.gap") {
    return freeze({
      mode: mode === "auto" && registered.intentKind === "attachment" ? "ask" : mode === "auto" ? "act" : mode,
      execution: "task",
      capability: registered.capability,
      intentKind: registered.intentKind,
      reasonCode: registered.reasonCode,
    });
  }
  const act = mode === "act" || (mode === "auto" && ACTION_WORDS.test(text));
  if (act) return freeze({ mode: "act", execution: "objective", capability: null, intentKind: "autonomous-action", reasonCode: "explicit-action-request" });
  if (!available.includes("assistant.respond")) return freeze({ mode: "ask", execution: "unavailable", capability: null, intentKind: "answer", reasonCode: "answer-provider-unavailable" });
  return freeze({ mode: "ask", execution: "task", capability: "assistant.respond", intentKind: "answer", reasonCode: "general-question" });
}

export function chatConversationTitle(content) {
  const text = String(content ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "New chat";
  const cleaned = text.replace(/^(?:can you|could you|would you|please|tell me|help me)\s+/i, "");
  return (cleaned || text).replace(/[?.!]+$/, "").slice(0, 72);
}

function freeze(value) { return Object.freeze(value); }
