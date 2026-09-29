import type { ProjectedInteractionTruth } from "@/lib/interaction-truth";
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
        <TruthCard label="Interaction truth" value="Unobserved" detail="No sanitized Task 6 interaction projection is available; no provider capability or authority is inferred." />
        <TruthCard label="Delivery truth" value="Unobserved" detail="Execution completion and delivery remain separate; absence never triggers replay or re-execution." />
      </>
    );
  }

  if (truth.state === "hold" && !truth.interaction) {
    return (
      <TruthCard label="Interaction truth" value="Held / fail-closed" detail={`${truth.reason} · malformed or authority-bearing runtime evidence is not rendered as healthy.`} tone="warn" />
    );
  }

  const interaction = truth.interaction!;
  const delivery = truth.delivery;
  const direction = interaction.direction === "rtl" ? "rtl" : interaction.direction === "ltr" ? "ltr" : undefined;
  const interactionTone = truth.state === "observed" ? "good" : "warn";
  const deliveryTone = delivery?.status === "delivered" ? "good" : delivery?.status === "hold" ? "warn" : "neutral";

  return (
    <>
      <TruthCard
        label="Interaction truth"
        value={`${interaction.sourceFamily} · ${interaction.channelFamily}`}
        detail={`${interaction.modalities.join(" · ")} · ${interaction.interactionId} · fingerprint ${interaction.interactionFingerprint}`}
        tone={interactionTone}
      />
      <article className={`eclipse-status-card ${interactionTone}`} aria-label="Protocol and presentation truth" dir={direction}>
        <span>Protocol and presentation truth</span>
        <strong>{interaction.protocolFamily}{interaction.protocolVersion ? ` ${interaction.protocolVersion}` : ""}</strong>
        <p>
          {interaction.locale ?? "locale unobserved"} · {interaction.timezone ?? "timezone unobserved"} · {interaction.deviceClass ?? "device unobserved"} · {interaction.networkClass ?? "network unobserved"} · {observedTime(truth)} · presentation only
        </p>
      </article>
      <TruthCard
        label="Delivery truth"
        value={delivery?.status ?? "Not emitted"}
        detail={delivery
          ? `${delivery.outputReferences.length} immutable output reference${delivery.outputReferences.length === 1 ? "" : "s"} · fingerprint ${delivery.deliveryFingerprint} · delivery retry never re-executes`
          : `Execution ${interaction.executionStatus ?? "unobserved"} · delivery remains separately unobserved · no retry authority`}
        tone={deliveryTone}
      />
    </>
  );
}
