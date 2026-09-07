import { previewCreditFreeHeartbeat } from "../fleet/heartbeat";
import { versionReceipt } from "../fleet/versions";
import { HARD_DENIES } from "./denies";
import type { AdapterResult, AutomationIntent, AutomationPlan, OwnerSessionState } from "./types";

const RELAY_CONFIRM = new Set(["task.cancel", "task.retry", "repair.request"]);

/**
 * Map UI intents → existing fleet/zero-credit/relay Operations contracts.
 * Fail closed without owner session for mutating relay actions.
 * Never returns tokens. Never grants browser GitHub write authority.
 */
export function planAutomation(
  intent: AutomationIntent,
  session: OwnerSessionState = "unknown",
): AdapterResult<AutomationPlan> {
  if (intent.kind === "browser-github-write") {
    return {
      ok: false,
      reason: "browser-fleet-authority-denied",
      detail: HARD_DENIES.browserFleetAuthority,
    };
  }

  if (intent.kind === "starter") {
    const command = String(intent.command ?? "").trim();
    if (!command) return { ok: false, reason: "adapter-input-invalid", detail: "starter-command-required" };
    return { ok: true, value: { surface: "starter", command } };
  }

  if (intent.kind === "version-ledger") {
    return { ok: true, value: { surface: "version-ledger", receipt: versionReceipt() } };
  }

  if (intent.kind === "credit-free-preview") {
    const preview = previewCreditFreeHeartbeat({
      healthOk: intent.healthOk,
      healthStatus: intent.healthStatus,
      planeOk: intent.planeOk,
      planeReason: intent.planeReason,
      inspectOnly: true,
    });
    return {
      ok: true,
      value: {
        surface: "credit-free",
        nextAction: preview.nextAction,
        executable: preview.executable,
      },
    };
  }

  if (intent.kind === "relay-operations") {
    if (session !== "present") {
      return {
        ok: false,
        reason: "owner-session-required",
        detail: "relay-operations-require-owner-session",
      };
    }
    const actionId = intent.actionId;
    const idempotencyKey = String(intent.idempotencyKey ?? "").trim();
    if (!idempotencyKey) {
      return { ok: false, reason: "adapter-input-invalid", detail: "idempotency-key-required" };
    }
    return {
      ok: true,
      value: {
        surface: "relay-operations",
        actionId,
        idempotencyKey,
        taskId: intent.taskId,
        incidentId: intent.incidentId,
        requiresOwnerConfirmation: RELAY_CONFIRM.has(actionId),
      },
    };
  }

  return { ok: false, reason: "adapter-input-invalid", detail: "unknown-intent" };
}
