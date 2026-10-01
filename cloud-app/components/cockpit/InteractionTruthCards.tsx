import type { ProjectedInteractionTruth } from "@/lib/interaction-truth";
import { FIRST_RELEASE_RUNTIME_TRANSPORTS, receiptLineageLabel } from "@/lib/interaction-truth";
import { formatPresentationValue } from "@/lib/presentation-format";

function TruthCard({ label, value, detail, tone = "neutral" }: {
  label: string;
  value: string;
  detail: string;
  tone?: "good" | "warn" | "neutral";
}) {
  return (
    <article className={`eclipse-status-card ${tone}`} aria-label={label}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function observedTime(truth: ProjectedInteractionTruth) {
  const interaction = truth.interaction;
  if (!interaction?.observedAt) return "time unobserved";
  try {
    return formatPresentationValue(new Date(interaction.observedAt), {
      locale: interaction.locale,
      timezone: interaction.timezone,
      direction: interaction.direction,
      unitSystem: interaction.unitSystem,
      currency: interaction.currency,
    });
  } catch {
    return "time invalid";
  }
}

export function InteractionTruthCards({ truth }: { truth: ProjectedInteractionTruth }) {
  if (truth.state === "absent") {
    return (
      <>
        <TruthCard label="Interaction truth" value="Unobserved" detail="No sanitized Task 6 interaction projection is available; no provider capability or authority is inferred. Read-only persisted interaction-truth is not a live broker or provider call." />
        <TruthCard label="Delivery truth" value="Unobserved" detail="Execution completion and delivery remain separate; absence never triggers replay or re-execution." />
        <TruthCard label="Receipt lineage" value="Unobserved" detail="interaction → negotiation → execution-chain → delivery fingerprints unobserved · 409 HOLD is a block, not broker/provider fallback · first-release runtime transports: native, http-json · MCP/SSE are not routable." />
        <TruthCard label="Universal Reach #911" value="Unobserved lineage" detail="Synthetic chain pins remain observational: one correlation/task/chain · bounded handoffs · exactly-once provider execution across reconnect · immutable output references · hard-zero routing · contained authority · not traffic authority." />
      </>
    );
  }

  if (truth.state === "hold" && !truth.interaction) {
    return (
      <TruthCard label="Interaction truth" value="409 HOLD" detail={`${truth.reason} · held or invalid negotiation is a block, not broker/provider fallback · malformed, endpoint, header, credential, or authority-bearing runtime evidence is not rendered as healthy.`} tone="warn" />
    );
  }

  const interaction = truth.interaction!;
  const delivery = truth.delivery;
  const direction = interaction.direction === "rtl" ? "rtl" : interaction.direction === "ltr" ? "ltr" : undefined;
  const interactionTone = truth.state === "observed" ? "good" : "warn";
  const deliveryTone = delivery?.status === "delivered" ? "good" : delivery?.status === "hold" ? "warn" : "neutral";
  const firstRelease = FIRST_RELEASE_RUNTIME_TRANSPORTS.includes(interaction.protocolFamily as "native" | "http-json");
  const negotiationValue = truth.state === "hold" ? "409 HOLD" : interaction.negotiationFingerprint ?? "Unobserved";
  const executionPersisted = interaction.executionStatus === "completed" && delivery && delivery.status !== "delivered";

  return (
    <>
      <TruthCard
        label="Interaction truth"
        value={`${interaction.sourceFamily} · ${interaction.channelFamily}`}
        detail={`${interaction.modalities.join(" · ")} · ${interaction.interactionId} · fingerprint ${interaction.interactionFingerprint} · read-only persisted interaction-truth · not a live broker or provider call`}
        tone={interactionTone}
      />
      <article className={`eclipse-status-card ${interactionTone}`} aria-label="Protocol and presentation truth" dir={direction}>
        <span>Protocol and presentation truth</span>
        <strong>{interaction.protocolFamily}{interaction.protocolVersion ? ` ${interaction.protocolVersion}` : ""}</strong>
        <p>
          {interaction.locale ?? "locale unobserved"} · {interaction.timezone ?? "timezone unobserved"} · {interaction.deviceClass ?? "device unobserved"} · {interaction.networkClass ?? "network unobserved"} · {observedTime(truth)} · presentation only · {firstRelease ? "first-release runtime transport" : "not a first-release routable transport"} · MCP/SSE are not routable
        </p>
      </article>
      <TruthCard
        label="Negotiation truth"
        value={negotiationValue}
        detail={truth.state === "hold"
          ? `${truth.reason} · held or invalid negotiation is 409 HOLD, not broker/provider fallback`
          : `negotiation fingerprint ${interaction.negotiationFingerprint ?? "unobserved"} · observational only · no provider fallback`}
        tone={truth.state === "hold" ? "warn" : "neutral"}
      />
      <TruthCard
        label="Receipt lineage"
        value={delivery?.chainId || delivery?.taskId || interaction.interactionId}
        detail={receiptLineageLabel(truth)}
        tone={interactionTone}
      />
      <TruthCard
        label="Delivery truth"
        value={delivery?.status ?? "Not emitted"}
        detail={delivery
          ? `${delivery.outputReferences.length} immutable output reference${delivery.outputReferences.length === 1 ? "" : "s"} · fingerprint ${delivery.deliveryFingerprint} · delivery retry never re-executes${executionPersisted ? " · execution completion persisted while delivery is queued or interrupted" : ""}`
          : `Execution ${interaction.executionStatus ?? "unobserved"} · delivery remains separately unobserved · execution completion can persist when delivery is queued or interrupted · no retry authority`}
        tone={deliveryTone}
      />
      <TruthCard
        label="Universal Reach #911"
        value={delivery?.chainId || delivery?.taskId || interaction.interactionId}
        detail={`${delivery?.taskId ?? "task unobserved"} · ${delivery?.chainId ?? "chain unobserved"} · bounded handoffs · exactly-once provider execution across reconnect · hard-zero routing · contained authority · #911 not traffic authority · execution readiness, cognition readiness, and traffic authority remain separate claims`}
        tone={interactionTone}
      />
    </>
  );
}
