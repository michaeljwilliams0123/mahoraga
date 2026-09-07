import type { AdapterResult, ObservationalHealthCard } from "./types";

/** Map cloud-app GET /api/health JSON into a bounded observational card. No fake rollback. */

export type HealthRouteJson = {
  ok?: boolean;
  product?: string;
  boundaries?: {
    executionPlane?: string;
    relaySeesPlaintext?: boolean;
  };
  routing?: {
    authority?: string;
    automaticPaidFallback?: boolean;
    browserMaySelectProvider?: boolean;
  };
};

export function mapHealthRoute(json: unknown): AdapterResult<ObservationalHealthCard> {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return { ok: false, reason: "adapter-input-invalid", detail: "health-json-invalid" };
  }
  const body = json as HealthRouteJson;
  return {
    ok: true,
    value: {
      ok: body.ok === true,
      product: String(body.product ?? "Mahoraga"),
      executionPlane: String(body.boundaries?.executionPlane ?? "unknown"),
      authority: String(body.routing?.authority ?? "unknown"),
      automaticPaidFallback: body.routing?.automaticPaidFallback === true,
      browserMaySelectProvider: body.routing?.browserMaySelectProvider === true,
      relaySeesPlaintext: body.boundaries?.relaySeesPlaintext === true,
    },
  };
}
