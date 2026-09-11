# Always-on cloud runtime candidate

The canonical deployment and security procedure is mirrored from `docs/CLOUD-ALWAYS-ON-RUNTIME.md`. It packages the existing Node ESM core and TypeScript workspace, keeps the core on loopback, mounts `/var/lib/mahoraga`, disables Fly scale-to-zero, and requires an Access-protected signed owner assertion before issuing the same-origin session. The public session contract reports its revision and fallback compatibility; Windows `3.6.0` is pairing-unsupported and remains separate until exact-head cloud verification is complete.
