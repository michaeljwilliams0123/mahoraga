import { pagesOwnerBridgeFrameHeaders, renderPagesOwnerBridgeFrame } from "@/lib/pages-owner-bridge-frame";
import { validatePagesOrigin } from "@/lib/pages-owner-bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_PAGES_ORIGIN = "https://michaeljwilliams0123.github.io";

export async function GET() {
  try {
    const pagesOrigin = validatePagesOrigin(process.env.MAHORAGA_PAGES_ORIGIN?.trim() || DEFAULT_PAGES_ORIGIN);
    return new Response(renderPagesOwnerBridgeFrame(pagesOrigin), { status: 200, headers: pagesOwnerBridgeFrameHeaders(pagesOrigin) });
  } catch {
    return new Response("bridge unavailable", { status: 503, headers: { "cache-control": "no-store", "content-type": "text/plain; charset=utf-8" } });
  }
}
