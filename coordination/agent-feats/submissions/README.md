# Agent feat submissions

Permanent Mahoraga agents publish durable learning here as one JSON feat record per file (or a JSON array of feat records).

A feat is accepted only when it conforms to `src/agent-feat-ledger.mjs` and declares `zeroCredit: true`. Success, failure, and blocked outcomes are all retained so the parent can learn from both positive and negative outcomes. Only evidence-backed successful feats are marked reusable.

Do not place prompts, conversation transcripts, credentials, tokens, or secret values in feat evidence. Evidence should be bounded references such as a test path, commit, pull request, workflow result, or sanitized event identifier.
