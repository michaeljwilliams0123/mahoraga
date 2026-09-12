import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const GUIDANCE = Object.freeze({
  "general-mahoraga": "Mahoraga bounded guidance: decompose owner objectives, delegate specialist work only to registered connected agents, require explicit receipts, and fail closed when authority or evidence is missing.",
  "enterprise-core": "Mahoraga bounded guidance: use only registered enterprise tools and skills, prefer evidence-backed Microsoft 365 actions, and return sanitized receipts for every external side effect.",
  "tenant-health-reader": "Mahoraga bounded guidance: remain read-only, report tenant health from verified provider evidence, and escalate mutation requests to an authorized execution agent instead of acting directly.",
});

export async function applyCopilotStudioWorkspaceMutation({ alias, workspacePath, surfaces, reasonCodes }) {
  if (!Object.hasOwn(GUIDANCE, alias)) throw safeError("studio-workspace-agent-invalid");
  if (!Array.isArray(surfaces) || surfaces.length !== 1 || surfaces[0] !== "instructions") throw safeError("studio-workspace-surface-unsupported");
  if (!Array.isArray(reasonCodes) || reasonCodes.length < 1) throw safeError("studio-workspace-request-invalid");
  const file = path.join(workspacePath, "agent.mcs.yaml");
  const source = await readFile(file, "utf8").catch(() => { throw safeError("studio-workspace-agent-file-missing"); });
  const next = appendInstruction(source, GUIDANCE[alias]);
  if (next !== source) await writeFile(file, next, "utf8");
  return Object.freeze({ verified: true, changedFiles: Object.freeze(["agent.mcs.yaml"]) });
}

export async function validateCopilotStudioWorkspace({ workspacePath, surfaces }) {
  if (!Array.isArray(surfaces) || surfaces.length !== 1 || surfaces[0] !== "instructions") return Object.freeze({ verified: false });
  const file = path.join(workspacePath, "agent.mcs.yaml");
  const source = await readFile(file, "utf8").catch(() => "");
  const verified = /^\s*kind:\s*GptComponentMetadata\s*$/m.test(source)
    && /^\s*instructions:\s*\|[-+]?\s*$/m.test(source)
    && !/\b(?:TODO|TBD|_REPLACE)\b/.test(source);
  return Object.freeze({ verified });
}

function appendInstruction(source, guidance) {
  if (source.includes(guidance)) return source;
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((line) => /^\s*instructions:\s*\|[-+]?\s*$/.test(line));
  if (start < 0) throw safeError("studio-workspace-instructions-unsupported");
  const keyIndent = lines[start].match(/^\s*/)[0].length;
  let bodyIndent = null;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    const indent = line.match(/^\s*/)[0].length;
    if (indent <= keyIndent) { end = index; break; }
    bodyIndent ??= indent;
  }
  bodyIndent ??= keyIndent + 2;
  lines.splice(end, 0, `${" ".repeat(bodyIndent)}${guidance}`);
  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

function safeError(code) { return Object.assign(new Error(code), { code }); }
