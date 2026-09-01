export function filesFromClipboard(clipboardData) {
  const files = [];
  const fingerprints = new Set();
  const add = (file) => {
    if (!file) return;
    const fingerprint = [file.name || "clipboard-file", Number(file.size) || 0, file.type || "application/octet-stream"].join(":");
    if (fingerprints.has(fingerprint)) return;
    fingerprints.add(fingerprint);
    files.push(file);
  };
  for (const item of clipboardData?.items ?? []) if (item.kind === "file") add(item.getAsFile());
  for (const file of clipboardData?.files ?? []) add(file);
  return files;
}

export async function discardPendingAttachments(attachments, remove) {
  if (typeof remove !== "function") throw new TypeError("attachment-remover-required");
  const ids = [...new Set((attachments ?? []).map((item) => item?.id).filter(Boolean))];
  let released = 0;
  let failed = 0;
  for (const id of ids) {
    try { await remove(id); released += 1; }
    catch { failed += 1; }
  }
  return { released, failed };
}

export function deriveConversationTitle(content) {
  let title = String(content ?? "").replace(/\s+/g, " ").trim();
  title = title.replace(/^(?:please\s+)?(?:can|could|would)\s+you\s+(?:please\s+)?(?:tell me about|explain|describe)\s+/i, "");
  title = title.replace(/^please\s+/i, "").replace(/[?.!]+$/, "").trim();
  if (/\brepository\b/i.test(title) && /\bproduction state\b/i.test(title)) return "Repository production state";
  title = title.replace(/^why\s+does\s+/i, "Why ").replace(/^why\s+/i, "Why ");
  if (!title) return "New conversation";
  title = title[0].toUpperCase() + title.slice(1);
  return title.length > 72 ? `${title.slice(0, 69).trimEnd()}…` : title;
}

export function renderAssistantMarkdown(value) {
  const lines = String(value ?? "").replace(/\r/g, "").split("\n");
  const blocks = [];
  let list = [];
  let code = [];
  let inCode = false;
  const flushList = () => {
    if (!list.length) return;
    blocks.push(`<ul>${list.map((item) => `<li>${inline(item)}</li>`).join("")}</ul>`);
    list = [];
  };
  const flushCode = () => {
    if (!code.length) return;
    blocks.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
    code = [];
  };
  for (const line of lines) {
    if (/^```/.test(line)) {
      flushList();
      if (inCode) flushCode();
      inCode = !inCode;
      continue;
    }
    if (inCode) { code.push(line); continue; }
    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) { list.push(bullet[1]); continue; }
    flushList();
    const heading = line.match(/^\s*(#{1,3})\s+(.+)$/);
    if (heading) { blocks.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`); continue; }
    if (!line.trim()) continue;
    blocks.push(`<p>${inline(line.trim())}</p>`);
  }
  flushList();
  flushCode();
  return blocks.join("");
}

function inline(value) {
  return escapeHtml(value).replace(/`([^`]+)`/g, "<code>$1</code>");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[character]);
}
