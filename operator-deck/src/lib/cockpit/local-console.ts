import type { AdapterResult, LocalConsoleProbe } from "./types";

/**
 * Optional local Ollama console probe — soft-fail zero-credit only.
 * Never invents paid fallback. Does not call network by itself; caller supplies reachability.
 */
export function mapOllamaProbe(input?: {
  reachable?: boolean | null;
  detail?: string | null;
}): AdapterResult<LocalConsoleProbe> {
  if (input?.reachable === true) {
    return {
      ok: true,
      value: {
        provider: "ollama",
        status: "ready",
        creditCost: 0,
        paidFallback: false,
        detail: String(input.detail ?? "ollama-reachable"),
      },
    };
  }
  if (input?.reachable === false) {
    return {
      ok: true,
      value: {
        provider: "ollama",
        status: "soft-fail",
        creditCost: 0,
        paidFallback: false,
        detail: String(input.detail ?? "ollama-unreachable-soft-fail"),
      },
    };
  }
  return {
    ok: true,
    value: {
      provider: "ollama",
      status: "unavailable",
      creditCost: 0,
      paidFallback: false,
      detail: String(input?.detail ?? "ollama-not-configured"),
    },
  };
}
