import { classifyTaskIntent } from "./task-intent.mjs";
import { planConversationCapabilities } from "./conversation-capability-planner.mjs";

const MODES = new Set(["auto", "ask", "act"]);
const ACTION_WORDS = /\b(?:apply|build|change|create|delete|deploy|execute|fix|implement|install|move|open|publish|repair|restart|run|scan|send|start|stop|update|write)\b/i;
const MUTATION_WORDS = /\b(?:apply|build|change|create|delete|deploy|execute|fix|implement|install|move|publish|repair|restart|send|start|stop|update|write)\b/i;
const READ_ONLY_CAPABILITY = /\.(?:health|inspect|observe|respond|scan|status|validate)$/;
const INFORMATIONAL_QUESTION = /^(?:how (?:do|does|can|should|would)\b|why\b|what\b|when\b|where\b|who\b|which\b|(?:can|could) you (?:explain|tell|describe)\b)/i;

export function classifyChatTurn({ mode = "auto", content = "", attachmentCount = 0, availableCapabilities = [], capabilityRoutes = null, priorTasks = [] } = {}) {
  if (!MODES.has(mode)) throw new TypeError("chat-mode-invalid");
  const text = typeof content === "string" ? content.trim() : "";
  if (!text && attachmentCount === 0) throw new TypeError("chat-content-required");
  const routes = Array.isArray(capabilityRoutes)
    ? capabilityRoutes
    : (Array.isArray(availableCapabilities) ? availableCapabilities : []).map((capability) => ({ capability, enabled: true, routable: true }));
  const available = [...new Set(routes.filter((item) => item?.enabled !== false).map((item) => item?.capability).filter((item) => typeof item === "string"))];
  const ucf = planConversationCapabilities({ content: text, attachmentCount, capabilityRoutes: routes, priorTasks });
  const registered = classifyTaskIntent({ content: text, attachmentCount, availableCapabilities: available });
  if (ucf.execution === "unavailable" && ucf.reasonCode === "recipient-not-authorized") {
    return freeze({ mode: "act", execution: "unavailable", capability: null, intentKind: "recipient-restricted", reasonCode: ucf.reasonCode });
  }
  if (mode === "ask") {
    if (ucf.execution === "task" && ucf.capability && READ_ONLY_CAPABILITY.test(ucf.capability)) {
      return freeze({ mode: "ask", execution: "task", capability: ucf.capability, intentKind: ucf.intentKind, reasonCode: ucf.reasonCode });
    }
    return answerDecision(available, "ask-read-only");
  }
  if (mode === "auto" && INFORMATIONAL_QUESTION.test(text)) {
    if (ucf.execution === "task" && ucf.capability !== "assistant.respond" && READ_ONLY_CAPABILITY.test(ucf.capability)) {
      return freeze({ mode: "act", execution: "task", capability: ucf.capability, intentKind: ucf.intentKind, reasonCode: ucf.reasonCode });
    }
    return answerDecision(available, "general-question");
  }
  const directedCapability = ownerCapabilityDirective(text, available);
  if (directedCapability) return freeze({ mode: "act", execution: "capability", capability: directedCapability, intentKind: "owner-capability", reasonCode: "explicit-capability-request" });
  if (MUTATION_WORDS.test(text)) return freeze({ mode: "act", execution: "objective", capability: null, intentKind: "autonomous-action", reasonCode: "explicit-action-request" });
  if (ucf.execution === "objective") return freeze({ mode: "act", execution: "objective", capability: null, intentKind: ucf.intentKind, reasonCode: ucf.reasonCode });
  if (ucf.execution === "task" && ucf.capability) {
    const answer = ucf.capability === "assistant.respond";
    return freeze({ mode: answer ? "ask" : mode === "auto" ? "act" : mode, execution: "task", capability: ucf.capability, intentKind: ucf.intentKind, reasonCode: ucf.reasonCode });
  }
  if (registered.capability && registered.capability !== "provider.gap") {
    return freeze({ mode: mode === "auto" && registered.intentKind === "attachment" ? "ask" : mode === "auto" ? "act" : mode, execution: "task", capability: registered.capability, intentKind: registered.intentKind, reasonCode: registered.reasonCode });
  }
  const act = mode === "act" || (mode === "auto" && ACTION_WORDS.test(text));
  if (act) return freeze({ mode: "act", execution: "objective", capability: null, intentKind: "autonomous-action", reasonCode: "explicit-action-request" });
  return answerDecision(available, "general-question");
}

export function chatConversationTitle(content) {
  const text = String(content ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "New chat";
  const cleaned = text.replace(/^(?:can you|could you|would you|please|tell me|help me)\s+/i, "");
  return (cleaned || text).replace(/[?.!]+$/, "").slice(0, 72);
}

function ownerCapabilityDirective(text, available) {
  const capabilities = [...new Set(available)]
    .filter((item) => typeof item === "string" && /^[a-z][a-z0-9-]{0,63}(?:\.[a-z][a-z0-9-]{0,63})+$/.test(item))
    .sort((left, right) => right.length - left.length || left.localeCompare(right));
  for (const capability of capabilities) {
    const escaped = capability.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const explicit = new RegExp(`(?:^|\\s)(?:capability\\s*[:=]\\s*|\\/act\\s+|run\\s+|use\\s+|execute\\s+|invoke\\s+|call\\s+)${escaped}(?=\\s|$|[,;:.!?])`, "i");
    if (explicit.test(text)) return capability;
  }
  return null;
}
function freeze(value) { return Object.freeze(value); }
function answerDecision(available, reasonCode) {
  if (!available.includes("assistant.respond")) return freeze({ mode: "ask", execution: "unavailable", capability: null, intentKind: "answer", reasonCode: "answer-provider-unavailable" });
  return freeze({ mode: "ask", execution: "task", capability: "assistant.respond", intentKind: "answer", reasonCode });
}
