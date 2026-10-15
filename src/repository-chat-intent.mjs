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
