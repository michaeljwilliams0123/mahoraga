# Optional Codespaces development environment

The repository includes an optional GitHub Codespaces configuration for attended development and verification. It is not a Mahoraga runtime, production host, inference provider, deployment lane, or source of operational authority.

Opening the repository in a Codespace provides Node.js 24 and installs the locked root dependencies with `npm ci`. It exposes no port by default and starts no Mahoraga service. Run focused tests, `npm run typecheck`, or `npm run verify:fast` explicitly when needed.

Codespaces compute and storage are metered by GitHub even when an account has included monthly usage. Owners must inspect current GitHub billing and quota before creating or running a Codespace. This configuration does not claim unlimited or permanently free capacity and does not start, stop, or delete Codespaces automatically.

The container receives no repository-defined production credentials. Do not add Cloudflare, Access, provider, GitLab, Railway, deployment, or owner secrets to this file. GitHub authentication supplied by Codespaces remains subject to repository permissions and does not grant direct-main, self-patching, or production-deployment authority.

Production remains governed by exact-current-`main` verification and the GitHub-controlled Cloudflare deployment-and-acceptance workflow. GitLab remains read-only, and Railway remains non-routing.
