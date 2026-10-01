/** Observational cockpit card for merged #946. Not activation. */
export function NativeSmokeCheckpointCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="native-smoke-checkpoint">
      <span>Native foundry smoke</span>
      <strong>Checkpoint mechanics only</strong>
      <p>
        Merged #946 trains a seeded dense bigram softmax baseline (one-token context, nine parameters, seed 42, 80 epochs, lr 0.2). Synthetic smoke loss 1.103735 to 0.003131; separate-content held-out 1.103508 to 0.003145. Promotion stays held: no activation, no production routing, no Windows cutover. Product remains Mahoraga. 7.0.0-alpha.2 is build provenance only. Training text stays outside checkpoints. Not a transformer, not an AGI claim.
      </p>
    </article>
  );
}
