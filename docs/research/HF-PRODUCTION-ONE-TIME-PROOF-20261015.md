# One-time Hugging Face production discovery — October 15, 2026

Owner-requested production proof: **6:00 PM America/New_York (EDT)**,
which is **2026-10-15T22:00:00Z**. Do not mistake October EDT for EST.

This change uses the already deployed Cloudflare execution-runtime `*/5 * * * *`
Cron. It changes **only** whether a public Hugging Face metadata
observation is due. During the two-hour proof window, a pre-6:00 PM
daily receipt cannot suppress the first post-6:00 PM observation.
Once that post-6:00 PM receipt is persisted, subsequent scheduled
wakes honor the ordinary 24-hour throttle again. Outside that window
the normal logic is unchanged; no permanent extra Cron is configured.

The proof does not activate paid inference, download or install models,
admit new models, change provider routing, dispatch GitHub workflows,
or bypass current owner pause. The Hub request remains bounded to
128 KiB / 5 seconds and failures persist as `metadata-unavailable`.
A fresh source-matching receipt exposed by the authenticated internal
activity view is the acceptance evidence; a successful CI or Cron
registration alone is not proof that the scan ran.

The owner-paired Control Center should show `huggingFaceDiscovery`
with `sourceSha` matching GitHub main, `observedAt` at or after
`2026-10-15T22:00:00Z`, `status` and `candidates`.
A `metadata-unavailable` receipt is a **failed discovery**, not a
success. No credential values belong in the evidence or comments.

This is a one-time date-limited proof by design. No extra paid service,
new scheduler, Cloudflare Access change, or recurring ChatGPT task.
