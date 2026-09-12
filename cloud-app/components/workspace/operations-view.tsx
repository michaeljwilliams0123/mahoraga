"use client";

import { CircleAlert, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type {
  RuntimeOperationsActionInput,
  RuntimeOperationsActionResult,
  RuntimeOperationsSnapshot,
} from "@/lib/runtime-relay";
import type { OperationsViewProps } from "./workspace-types";

type PendingConfirmation = {
  action: RuntimeOperationsActionInput;
  token: string;
  receiptId: string;
};

type SnapshotWithLane = RuntimeOperationsSnapshot & {
  interactionReadiness?: {
    ready?: boolean;
    provider?: string;
    canary?: string;
    reason?: string | null;
    evidenceLevel?: string;
  };
};

export function OperationsView({ coreReady, relay, onRequestPairing }: OperationsViewProps) {
  const [snapshot, setSnapshot] = useState<SnapshotWithLane | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!coreReady || !relay?.connected) {
      setSnapshot(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await relay.operationsSnapshot();
      setSnapshot(next as SnapshotWithLane);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "operations-snapshot-failed");
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, [coreReady, relay]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function runAction(input: RuntimeOperationsActionInput) {
    if (!relay?.connected) {
      setError("relay-not-paired");
      return;
    }
    setLoading(true);
    setError(null);
    setLastAction(null);
    try {
      const result: RuntimeOperationsActionResult = await relay.operationsAction(input);
      if (result.confirmationRequired) {
        setPendingConfirmation({
          action: input,
          token: result.confirmationToken ?? "",
          receiptId: result.receiptId,
        });
        setLastAction(`Confirmation required for ${result.actionId}`);
        return;
      }
      setPendingConfirmation(null);
      setLastAction(`${result.actionId} · ${result.receiptId}`);
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "operations-action-failed");
    } finally {
      setLoading(false);
    }
  }

  async function confirmPending() {
    if (!pendingConfirmation) return;
    const token = pendingConfirmation.token;
    if (!token) {
      setError("operations-confirmation-token-missing");
      return;
    }
    await runAction({
      ...pendingConfirmation.action,
      idempotencyKey: `${pendingConfirmation.action.idempotencyKey}-confirm`,
      confirmationToken: token,
    });
  }

  if (!coreReady) {
    return (
      <section className="connection-panel" aria-label="Operations">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Operations</span>
            <h2>Pair runtime to load Operations</h2>
          </div>
          <ShieldCheck size={20} />
        </div>
        <p>Operations reads bounded runtime, repository, worker, task, repair, and verification metadata from the paired Mahoraga core only.</p>
        <div className="pair-row">
          <button type="button" onClick={onRequestPairing}>
            Pair runtime
          </button>
        </div>
      </section>
    );
  }

  const lane = snapshot?.interactionReadiness;

  return (
    <section className="connection-panel" aria-label="Operations">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Core-mediated</span>
          <h2>Operations</h2>
        </div>
        <button type="button" onClick={() => void refresh()} aria-label="Refresh operations snapshot" disabled={loading}>
          {loading ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}
        </button>
      </div>

      {error && (
        <div className="inline-alert" role="alert">
          <CircleAlert size={16} /> {error}
        </div>
      )}
      {lastAction && <p className="muted">Last action: {lastAction}</p>}

      {pendingConfirmation && (
        <div className="pairing-panel" role="dialog" aria-label="Owner confirmation required">
          <div className="pairing-copy">
            <ShieldCheck size={18} />
            <div>
              <strong>Owner confirmation required</strong>
              <p>
                The core requires explicit approval for {pendingConfirmation.action.actionId}. This UI will not self-approve. Receipt{" "}
                {pendingConfirmation.receiptId}.
              </p>
            </div>
          </div>
          <div className="pairing-actions">
            <button type="button" onClick={() => setPendingConfirmation(null)}>
              Dismiss
            </button>
            <button type="button" className="pair-button" onClick={() => void confirmPending()}>
              Confirm as owner
            </button>
          </div>
        </div>
      )}

      {!snapshot && !loading && !error && <p className="muted">No operations snapshot yet.</p>}
      {snapshot && (
        <div className="capability-list" style={{ marginTop: 16 }}>
          <div>
            <strong>Runtime</strong>
            <span>
              {snapshot.runtime.version} · baseline {snapshot.runtime.productionBaseline} · rollback {snapshot.runtime.rollbackTarget}
              {snapshot.runtime.healthy === false ? " · process degraded" : " · process healthy"}
            </span>
          </div>
          <div>
            <strong>Answer lane</strong>
            <span>
              {lane?.ready === true ? "routable" : "not routable"}
              {lane?.provider ? ` · ${lane.provider}` : ""}
              {lane?.canary ? ` · canary ${lane.canary}` : ""}
              {lane?.reason ? ` · ${lane.reason}` : ""}
            </span>
          </div>
          <div>
            <strong>Repository</strong>
            <span>
              {snapshot.repository.branch} · {snapshot.repository.headSha?.slice(0, 12) ?? "unknown"} · {snapshot.repository.cleanState}
            </span>
          </div>
          <div>
            <strong>Exact-head verification</strong>
            <span>
              {snapshot.verification.state} · {snapshot.verification.exactHeadSha?.slice(0, 12) ?? "unavailable"}
            </span>
          </div>
          <div>
            <strong>Workers</strong>
            <span>
              {snapshot.workers.length === 0
                ? "none reported"
                : snapshot.workers.map((worker) => `${worker.id}:${worker.state}`).join(", ")}
            </span>
          </div>
          <div>
            <strong>Tasks</strong>
            <span>
              active {snapshot.tasks.active} · waiting {snapshot.tasks.waiting} · failed {snapshot.tasks.failed}
            </span>
          </div>
          <div>
            <strong>Objectives</strong>
            <span>
              active {snapshot.objectives.active} · waiting {snapshot.objectives.waiting}
            </span>
          </div>
          <div>
            <strong>Repairs</strong>
            <span>
              incidents {snapshot.repairs.activeIncidents} · {snapshot.repairs.lastRepairState}
            </span>
          </div>
          <div>
            <strong>Update</strong>
            <span>
              {snapshot.update.activationState}
              {snapshot.update.candidate ? ` · candidate ${snapshot.update.candidate.id}` : ""} · rollbackReady{" "}
              {snapshot.update.rollbackReady ? "yes" : "no"}
            </span>
          </div>
          <div>
            <strong>Generated</strong>
            <span>{snapshot.generatedAt}</span>
          </div>
        </div>
      )}

      <div className="pairing-actions" style={{ marginTop: 16, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() =>
            void runAction({
              actionId: "runtime.health-check",
              idempotencyKey: `ui-health-${crypto.randomUUID()}`,
            })
          }
          disabled={loading}
        >
          Runtime health-check
        </button>
        <button
          type="button"
          onClick={() =>
            void runAction({
              actionId: "repository.verify",
              idempotencyKey: `ui-verify-${crypto.randomUUID()}`,
            })
          }
          disabled={loading}
        >
          Verify repository
        </button>
        {snapshot && snapshot.repairs.activeIncidents > 0 && (
          <button
            type="button"
            onClick={() =>
              void runAction({
                actionId: "repair.request",
                idempotencyKey: `ui-repair-${crypto.randomUUID()}`,
                incidentId: "active",
              })
            }
            disabled={loading}
          >
            Request repair
          </button>
        )}
      </div>
    </section>
  );
}
