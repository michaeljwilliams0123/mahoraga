## Scope

- Task or assignment ID:
- Authorized controller: Primary / Secondary / Copilot / Codex cloud
- Intended paths:

## Verification

- [ ] `node src/cli.mjs validate`
- [ ] `node scripts/coordination.mjs validate`
- [ ] `node --test --test-isolation=none`
- [ ] Actual changed paths match the declared scope.
- [ ] GitHub verification is successful, or the exact blocker is documented.

## Public-repository privacy boundary

- [ ] No credentials, tokens, prompts, model responses, browser data, personal
      files, raw plugin responses, or ChatGPT conversation content are included.
- [ ] Coordination records contain only bounded task metadata and repository evidence.
- [ ] This pull request does not change repository visibility.
