const PUBLIC_API_ORIGIN = process.env.NEXT_PUBLIC_MAHORAGA_API_ORIGIN?.trim() ?? "";

export function mahoragaApiOrigin(value = PUBLIC_API_ORIGIN): string | null {
  if (!value) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("mahoraga-api-origin-invalid");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) throw new Error("mahoraga-api-origin-invalid");
  return parsed.origin;
}

export function mahoragaApiUrl(pathname: string, value = PUBLIC_API_ORIGIN): string {
  if (!pathname.startsWith("/") || pathname.startsWith("//") || pathname.includes("://")) {
    throw new Error("mahoraga-api-path-invalid");
  }
  const origin = mahoragaApiOrigin(value);
  if (!origin) throw new Error("mahoraga-api-origin-unconfigured");
  return new URL(pathname, `${origin}/`).href;
}
