# Local deploy validation (EXPERIMENT ONLY)

Isolated Level 7 cluster stubs under `experiments/level7-inmemory-mesh/charts/mahoraga`.
**Not** a production Mahoraga Helm release. Do not cut over GitHub authority.

## Prerequisites

- Helm 3.x
- Optional: kind or minikube for a smoke install

## Lint and render

```bash
cd experiments/level7-inmemory-mesh
helm lint charts/mahoraga
helm template mahoraga-l7 charts/mahoraga > /tmp/mahoraga-l7-render.yaml
```

Confirm the render includes:

- Forgejo Deployment with HTTP liveness/readiness on port `3000`
- tmpfs `emptyDir` for `/data` (volatile git working state)
- When `backup.enabled` (default): PVC + volumeMount at `backup.mountPath` (default `/data/mahoraga-snapshots`)

Toggle PVC off:

```bash
helm template mahoraga-l7 charts/mahoraga --set backup.enabled=false
```

## Optional kind smoke

```bash
kind create cluster --name mahoraga-l7 || true
helm upgrade --install mahoraga-l7 charts/mahoraga -n mahoraga-l7 --create-namespace
kubectl -n mahoraga-l7 get deploy,svc,pvc
helm uninstall mahoraga-l7 -n mahoraga-l7
```

## Grafana

Dashboard stub: `dashboards/mahoraga-metrics.json`.

Metric names (`mahoraga_active_mesh_connections`, `mahoraga_queue_depth`, `mahoraga_structural_entropy`, `mahoraga_mutations_committed_total`) are **aspirational** until the L7 Mesh runtime emits them. Do not treat empty panels as a cluster failure.

## Guards

- Branch: `experiment/level7-inmemory-mesh` only
- No merge to `main` without Chief of Staff + Michael
- Do not gut production `.mjs` / `cloud-app` / `operator-deck`
