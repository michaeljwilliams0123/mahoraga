# Cloud autonomy operations

## Protected-device rule

The current primary device is immutable from the cloud lane. No extension, Docker service, browser profile, inbound listener, scheduled process, credential, repository checkout, or background agent may be installed or changed on it.

Cloud work occurs in GitHub, GitLab, Vercel, or another explicitly authorized managed provider. Optional local orchestration is confined to the separately approved secondary machine.

## Architecture

| Layer | Preferred interface | Boundary |
|---|---|---|
| Repository work | GitHub pull requests | authoritative main; verified integration only |
| Independent assurance | GitLab merge requests/CI | same-SHA verification; never authoritative for GitHub main |
| Cloud interface | Vercel | static UI first; server functions only after authentication and data-boundary review |
| Browser actions | isolated cloud browser | allowlisted domains/actions; no local Chrome extension |
| Microsoft 365 | Microsoft Graph | tenant-contained content and least-privilege OAuth |
| Workflow orchestration | managed n8n or secondary-host n8n | no public webhook on the protected device |
| Semantic procedures | managed Qdrant or secondary-host Qdrant | no raw chats, prompts, responses, credentials, or enterprise content |
| MCP routing | reviewed gateway image | typed allowlist; no generic filesystem or shell exposure |


## Secondary-host compose profiles

The secondary-host stack now supports baseline orchestration and optional local-AI profiles through `/home/runner/work/mahoraga/mahoraga/deploy/secondary-host/docker-compose.yml` and `/home/runner/work/mahoraga/mahoraga/deploy/secondary-host/.env.example`.

- Baseline secondary host (n8n, Qdrant, MCP gateway): `docker compose --env-file .env up -d`
- Primary-style local AI (CPU): `docker compose --env-file .env --profile primary-cpu up -d`
- Primary-style local AI (NVIDIA GPU): `docker compose --env-file .env --profile primary-gpu-nvidia up -d`
- Primary-style local AI (AMD GPU): `docker compose --env-file .env --profile primary-gpu-amd up -d`

Operational notes:

- Keep binds loopback by default; publish beyond loopback only with explicit review.
- NVIDIA profiles require a host with NVIDIA Container Toolkit/driver runtime configured.
- AMD profiles require `/dev/kfd` and `/dev/dri` device access.
- On Docker Desktop (including Apple Silicon), `host.docker.internal` is used as the default host fallback for external Ollama connectivity.

## Promotion gates

1. Synthetic and adversarial evaluations pass.
2. Repository verification passes on Ubuntu and Windows.
3. Cloud preview is reachable and browser-tested without console or network errors.
4. Authentication, connector scopes, and secret storage are reviewed.
5. High-impact browser actions require attended approval.
6. Rollback is proven before production promotion.
7. Production activation never mutates the protected device from an inbound cloud path.

## Current blockers

- Vercel accepted a preview request but the connected account could not retrieve the deployment or build logs; do not treat that preview as live.
- GitLab CI creates a failed pipeline with zero jobs; do not merge its evaluation MR until runner execution is proven.
- n8n, Qdrant, Microsoft Graph credentials, and an MCP gateway image are not provisioned. Repository declarations must not invent or store them.
