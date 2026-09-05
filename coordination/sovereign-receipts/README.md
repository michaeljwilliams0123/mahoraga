# Sovereign evolution receipts

Protected-root candidates place exactly one schema-valid receipt in this
directory. Autonomous integration reads the incumbent trust epoch from trusted
`main` (`state/incumbent-trust-epoch.json`) and binds this candidate receipt to
the exact head SHA.

A receipt is not authority. Missing live main protection, a missing incumbent
epoch, or any failed proof still fails closed. Do not invent proofs.

Keep receipts content-free: no prompts, chats, credentials, or private files.
