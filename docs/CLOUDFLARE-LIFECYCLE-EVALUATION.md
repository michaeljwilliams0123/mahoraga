# Curious lifecycle evaluation

This manual test creates one clone Worker and one reconstruction Worker in a designated Cloudflare test account. It runs deterministic challenges, retires each Worker, and confirms both script names are absent from the Cloudflare inventory. It requires an exact verified commit SHA and a repository-owner workflow dispatch with `CREATE_AND_RETIRE_DISPOSABLE_WORKERS`.

Configure `CLOUDFLARE_API_TOKEN` as a repository secret with scoped Workers Scripts read/write rights on the disposable account. Set `CLOUDFLARE_TEST_ACCOUNT_ID` and `CLOUDFLARE_TEST_SUBDOMAIN` as repository variables. Use a dedicated test account; the controller accepts no caller-selected Worker name or configuration path.

Ordinary verification runs `npm run test:lifecycle`, `npm run typecheck:lifecycle`, and `npm run verify:lifecycle-boundary` without Cloudflare credentials. The live command is `npm run cloudflare:lifecycle:run` with `TARGET_SHA`, the scoped credentials, and `LIFECYCLE_RUN_RECORD` pointing to a protected local runner path. The workflow performs an unconditional `cloudflare:lifecycle:cleanup` for a persisted record. `audit-expired` reports only and never deletes resources.

The final artifact includes exact SHA, run ID, two deployment identities, retirement fingerprints, challenge and investigation fingerprints, comparison and absorption decisions, and inventory absence evidence. The run record stays local. A failed deletion writes an orphan receipt; an operator can run receipt-bound cleanup with the same local record and account credentials. Do not claim completion until inventory confirms absence. Missing credentials block only the explicit live test.

This evaluation uses no external inference, licensed agent, or paid model credits. Railway and Vercel are excluded from implementation and evidence. The Worker has no production service, repository, or model binding. Absorption is run-scoped evaluation state; any production promotion requires a separate verified change.
