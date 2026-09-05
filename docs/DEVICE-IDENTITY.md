# Runner device-identity contract

Provider-neutral asymmetric identity for a future authenticated Mahoraga
gateway. Devices prove possession of an Ed25519 private key. The repository
never stores a shared secret, private key, access token, prompt, or personal
content.

## Records

- **Identity** — device ID, SPKI public key, created/rotated/revoked timestamps.
- **Challenge** — short-lived nonce bound to `mahoraga-device-challenge`.
- **Task grant** — short-lived token bound to `mahoraga-runner-task`, runner ID,
  allowed task areas, expiry, and a unique replay ID.
- **Revocation** — content-free device revocation receipt.

## Rules

- Algorithm is Ed25519 only. RSA, HMAC, and other keys fail as algorithm confusion.
- Grants cannot widen scope, change runner, change audience, or reuse a replay ID.
- Expired challenges and grants fail closed.
- Rotation requires a signature from the previous key over the next SPKI.
- Revoked devices cannot issue or redeem grants.
- Windows key storage is an abstract unbound adapter. This module does not call
  DPAPI, the certificate store, or any device credential API.

Verification is deterministic contract and adversarial tests only. No public
endpoint is exposed.
