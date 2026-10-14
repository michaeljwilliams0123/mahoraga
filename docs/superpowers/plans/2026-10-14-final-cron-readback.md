# Final Cron readback repair plan

**Goal:** Require source-matched live schedules after the acceptance script redeploys the runtime, before publishing acceptance.

**Spec:** Issue #786 and the verified deployment log for run 38617918912.

**Architecture:** Preserve the existing pre-acceptance readback. Add a second exact-main, read-only gate after production acceptance returns; publish the acceptance summary and artifact only after it passes.

**Constraints:** No credentials, schedule mutations, providers, protection rules, Windows activation or account configuration changes. Node 24; existing workflow and existing Cron verifier.

### Task 1: Gate the final deployment

Files: `.github/workflows/cloudflare-execution-runtime.yml`, `test/cloudflare-cron-source-readback.test.mjs`.

- [x] Add regression for post-redeployment gate ordering and real shell failure preventing acceptance summary publication.
- [x] Run the focused test; expect failure because the final gate is absent.
- [x] Add the final exact-head/readback step and move acceptance summary into it.
- [ ] Run focused Cron/production-acceptance tests, baseline verification and full verification.
- [ ] Open bounded PR; require exact-head Ubuntu and Windows Verify before squash integration.
- [ ] Observe merged-SHA Cloudflare final readback and paired cockpit acceptance.

**Review focus:** final drift/API failure must block summary and artifact; no later deployment may follow the final readback; initial readback must remain; temporary secret cleanup must still run on failure; current-main recheck must precede authenticated GET.
