/** Only route bounded, read-only GitHub evidence questions into native inspection.
 * Never mistake source editing, PR writes, or abstract capability questions for an inspection.
 */
export function isReadOnlyRepositoryEvidenceRequest(message) {
  if (typeof message !== "string" || message.length > 8_000) return false;
  const text = message.trim();
  if (text.toLowerCase() === "/repo inspect") return true;
  if (/\b(?:create|merge|push|deploy|modify|edit|delete|write|apply|implement it|implement the change)\b/i.test(text) || /\bcommit\s+(?:changes|code|this|the|a|to)\b/i.test(text)) return false;
  if (!/\b(?:github|repository|repo)\b/i.test(text)) return false;
  if (!/\b(?:inspect(?:ion)?|verified|authoritative|branch|commit|sha|source parity)\b/i.test(text)) return false;
  return /\b(?:summari[sz]e|summary|recap|show|what|which|tell|verify|identify|using|based on)\b/i.test(text);
}

export function parseRepositoryAdminCommand(message) {
  if (typeof message !== "string" || message.length > 8_000) fail();
  const text = message.trim();
  if (text === "/repo admin status" || /^(?:please\s+)?(?:run|execute|check|show|get)\s+\/repo\s+admin\s+status\b/i.test(text)) {
    return Object.freeze({ action: "status", proposal: null });
  }
  const match = /^\/repo (pr (create|merge|checks|diagnose)|workflow (dispatch))\s+([\s\S]+)$/.exec(text);
  if (!match) fail();
  let proposal;
  try { proposal = JSON.parse(match[4]); } catch { fail(); }
  if (!proposal || typeof proposal !== "object" || Array.isArray(proposal)) fail();
  return Object.freeze({ action: match[2] ?? match[3], proposal });
}

export function isRepositoryAdminRequest(message) {
  if (typeof message !== "string" || message.length > 8_000) return false;
  const text = message.trim();
  return /^\/repo\s+(?:admin|pr|workflow)\b/i.test(text)
    || /^(?:please\s+)?(?:run|execute|check|show|get)\s+\/repo\s+admin\s+status\b/i.test(text);
}

function fail() {
  const error = new TypeError("repository-admin-command-invalid");
  error.code = "repository-admin-command-invalid";
  throw error;
}
