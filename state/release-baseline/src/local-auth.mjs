import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { ROOT } from "./config.mjs";

const TOKEN_PATH = path.join(ROOT, "state", "primary-codex.token");

// This token is deliberately local operational state, never a manifest value or database field.
export async function loadPrimaryCodexToken() {
  const supplied = process.env.MAHORAGA_PRIMARY_CODEX_TOKEN?.trim();
  if (supplied) return supplied;
  try {
    const existing = (await readFile(TOKEN_PATH, "utf8")).trim();
    if (existing.length >= 32) return existing;
  } catch {}
  await mkdir(path.dirname(TOKEN_PATH), { recursive: true });
  const generated = randomBytes(32).toString("base64url");
  await writeFile(TOKEN_PATH, `${generated}\n`, { encoding: "utf8", mode: 0o600 });
  return generated;
}

export function bearerMatches(request, token) {
  const value = request.headers.authorization;
  if (typeof value !== "string" || !value.startsWith("Bearer ")) return false;
  const candidate = Buffer.from(value.slice(7));
  const expected = Buffer.from(token);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
