# Cloud browser and complex-data evaluation

This evaluation lane adds two synthetic, repository-only contracts without changing the local PC.

## Complex datasets

`node evaluation/complex-dataset-scenarios.mjs` generates and analyzes more than 60,000 synthetic rows across:

- revenue reconciliation with duplicate keys, unmatched records, amount mismatches, and material outliers;
- access certification with terminated enabled users, unapproved privileged access, duplicates, and missing ownership;
- conversion analysis with a mix shift that reverses the aggregate trend even though every segment improves.

Every result must contain quantified findings, an answer-first conclusion, and an explicit caveat. No real user, client, or model data is used or persisted.

## Isolated cloud browser

The supported design is a provider-backed isolated browser, not a Chrome
extension and not remote control of the user's installed browser. The Vercel
workspace exposes this capability only when the complete bounded HTTPS adapter
configuration is present; a provider name or UI badge alone never marks it
ready.

Required boundary:

- provider contract: `bounded-cloud-browser-adapter`;
- execution plane: `cloud`;
- explicit data classification; only `synthetic` and `personal` data may use this cloud contract, while `enterprise` and `local-only` fail closed;
- explicit domain allowlist;
- extensions and local-file access disabled;
- page content treated as untrusted;
- human approval for purchases, submissions, deletion, permission changes, and credential entry;
- no inbound tunnel and no local device mutation.

The former loopback CDP launcher is retired. The remaining runtime
`browser.status` capability reports this cloud-only boundary and cannot launch,
attach to, or modify a browser on the device. An authenticated cloud provider,
an HTTPS adapter that enforces the same domain/data boundary, and protected
Vercel environment variables are still required before production execution is
reported as configured.

Browserbase is the current recommended managed option because it is available
through the Vercel Marketplace and supports isolated remote browser sessions,
session-level allowed domains, and agent runs. Selection and billing approval
remain an owner decision; the repository does not silently create an account or
enable paid usage.

Run `node --test evaluation/*.test.mjs` to verify both contracts.
