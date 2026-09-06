export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The Vercel workspace is a client of the authoritative Mahoraga core.
 * Conversation execution must enter through the paired encrypted core gateway;
 * this route deliberately exposes no model, search, browser, or provider authority.
 */
export async function POST() {
  return Response.json(
    {
      error: "core-gateway-required",
      message: "Conversation execution is owned by the paired Mahoraga core gateway.",
      retryable: false,
    },
    {
      status: 409,
      headers: { "cache-control": "no-store" },
    },
  );
}
