# Cloud browser and complex-data evaluation

This evaluation lane adds two synthetic, repository-only contracts without changing the local PC.

## Complex datasets

`node evaluation/complex-dataset-scenarios.mjs` generates and analyzes more than 60,000 synthetic rows across:

- revenue reconciliation with duplicate keys, unmatched records, amount mismatches, and material outliers;
- access certification with terminated enabled users, unapproved privileged access, duplicates, and missing ownership;
- conversion analysis with a mix shift that reverses the aggregate trend even though every segment improves.

Every result must contain quantified findings, an answer-first conclusion, and an explicit caveat. No real user, client, or model data is used or persisted.

## Isolated cloud browser

The supported design is a provider-backed isolated browser, not a Chrome extension and not remote control of the user's installed browser.

Required boundary:

- provider: `openai-computer-use`;
- execution plane: `cloud`;
- explicit data classification; only `synthetic` and `personal` data may use this cloud contract, while `enterprise` and `local-only` fail closed;
- explicit domain allowlist;
- extensions and local-file access disabled;
- page content treated as untrusted;
- human approval for purchases, submissions, deletion, permission changes, and credential entry;
- no inbound tunnel and no local device mutation.

The existing loopback CDP worker remains unchanged. An authenticated provider credential and transient screenshot/action channel are still required before production execution can be enabled.

Run `node --test evaluation/*.test.mjs` to verify both contracts.
