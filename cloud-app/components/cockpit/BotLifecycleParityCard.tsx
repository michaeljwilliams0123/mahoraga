export function BotLifecycleParityCard() {
  return (
    <article className="eclipse-status-card neutral" data-surface="bot-lifecycle-parity">
      <span>Bot lifecycle parity</span>
      <strong>Observational / fail-closed</strong>
      <p>
        After #966: owner manual lane stays exact-SHA with CREATE_AND_RETIRE_DISPOSABLE_WORKERS. Bot lane is not caller-selectable and is not generic github-actions workflow_dispatch. Authority only from successful canonical Verify Mahoraga workflow_run on protected-main push, derived SHA, lifecycle-scope change, Ubuntu+Windows checks, and a second exact-main recheck. Policy merge is not live mutation. Cleanup stays receipt-bound. No Railway/Vercel route or traffic authority.
      </p>
    </article>
  );
}
