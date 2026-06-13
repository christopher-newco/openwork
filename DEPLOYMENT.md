# Soapbox Openwork Deployment Guide

> **Archived 2026-06-13.** This repo (a fork of [different-ai/openwork](https://github.com/different-ai/openwork)) powered the Soapbox "Den" cloud workspace platform. It has been superseded by a Paperclip-native architecture and is no longer maintained.

---

## Architecture Overview

```
Browser → admin.soapbox.build (Den Web / den-web)
                ↓
       api.admin.soapbox.build (Den API / den-api)
                ↓
       app.soapbox.build (Web App / @openwork/app)
                ↓
       Render.com (openwork-server workers, 40 GB /workspace disk, standard 2 GB plan)
```

### Railway Project: `production`
| Service | URL | Notes |
|---------|-----|-------|
| API (`ee/apps/den-api`) | `api.admin.soapbox.build` | Control plane; MySQL via Railway Postgres |
| Admin App (`ee/apps/den-web`) | `admin.soapbox.build` | Sign-in + workspace handoff |
| Web App (`apps/app`) | `app.soapbox.build` | Vite SPA; auto-connects to predefined cloud worker |
| Render.com Proxy | internal | Proxies den-api → Render worker API |
| SoapBox RAG | internal | pgvector semantic search for workspace context |
| soapbox-memory | internal | Shared memory service |
| inference | internal | LLM inference endpoint |
| Config Storage | internal | Persistent config for workers |

### Render Team: `Soapbox` (`tea-d8ief0m7r5hc73cr3j60`)
Workers are provisioned on-demand by the Den API via `POST /v1/workers {destination:"cloud"}`.

Each worker:
- **Plan:** `standard` (2 GB RAM / 1 CPU, ~$25/mo) — `starter` (512 MB) OOM-kills under real opencode use
- **Disk:** 40 GB at `/workspace` (`RENDER_WORKER_DISK_SIZE_GB=40`)
- **Image:** built from `packaging/docker/Dockerfile` on `christopher-newco/openwork@main`
- **Entrypoint:** `openwork-server --host 0.0.0.0 --port $OPENWORK_PORT --workspace /workspace --token $OPENWORK_TOKEN --host-token $OPENWORK_HOST_TOKEN` with `OPENWORK_MANAGE_OPENCODE=1`
- **opencode version:** v1.15.12 (resolved from `apps/orchestrator/src/constants.json`; installed by Dockerfile)

---

## Key Environment Variables

### Den API (Railway)
| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | MySQL connection string (Railway Postgres service) |
| `DEN_SERVICE_ACCOUNT_TOKEN` | Headless admin bearer; seeds `den-service-account@soapbox.build` on startup |
| `RENDER_API_KEY` | Render API key (`rnd_v0…`) — owns Render team `tea-d8ief0m7r5hc73cr3j60` |
| `RENDER_WORKER_REPO` | GitHub repo for worker Docker builds (`christopher-newco/openwork`) |
| `RENDER_WORKER_BRANCH` | Branch to build from (`main`) |
| `RENDER_WORKER_PLAN` | Render service plan (`standard`) |
| `RENDER_WORKER_DISK_SIZE_GB` | Persistent disk size (`40`) |
| `BETTER_AUTH_SECRET` | Auth secret for better-auth sessions |
| `BETTER_AUTH_URL` | `https://api.admin.soapbox.build` |

### Web App (Railway)
| Variable | Description |
|----------|-------------|
| `VITE_DEN_API_BASE_URL` | `https://api.admin.soapbox.build` (direct — do NOT use admin.soapbox.build proxy) |
| `VITE_PREDEFINED_WORKER_ID` | Worker ID to auto-connect on launch |

---

## Provisioning a Worker (headless)

```bash
# Use the Den service account token
TOKEN="<DEN_SERVICE_ACCOUNT_TOKEN>"
API="https://api.admin.soapbox.build"

# Provision
curl -X POST "$API/v1/workers" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"destination":"cloud"}'

# Check status
curl "$API/v1/workers/<worker-id>" \
  -H "Authorization: Bearer $TOKEN"

# Get connection tokens (POST not GET)
curl -X POST "$API/v1/workers/<worker-id>/tokens" \
  -H "Authorization: Bearer $TOKEN"

# Delete a worker (cascades to Render service)
curl -X DELETE "$API/v1/workers/<worker-id>" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Key Bugs Fixed / Gotchas

1. **Worker OOM:** `starter` plan (512 MB) is killed under real opencode load → use `standard` (2 GB).
2. **Disk attach timing:** The provisioner attaches the 40 GB disk in a second phase after the first deploy goes live. A brief 502 ~30 s after provisioning is normal.
3. **Service name collision:** Provisioner slugs from worker ID tail (not prefix) to avoid Render 500 on duplicate names.
4. **Worker limit counts failed rows:** `countOrganizationWorkers` has no status filter; a `failed` worker still blocks provisioning. Delete stale failed workers to free the slot.
5. **Web App → direct Den API:** Set `VITE_DEN_API_BASE_URL` to `api.admin.soapbox.build` directly, not `admin.soapbox.build`. The den-web proxy corrupts POST bodies.
6. **Auto-connect status vocab:** Worker health status is `"healthy"` (not `"ready"`). The app's `isWorkerConnectable()` accepts both.
7. **Orchestrator freeze (upstream bug):** `openwork-orchestrator@0.15.1` hangs at `waitForOpencodeHealthy()` with opencode 1.15.12. Bypassed by running `openwork-server` directly with `OPENWORK_MANAGE_OPENCODE=1` instead of `openwork serve`.
8. **Service account 2038 expiry:** MySQL `TIMESTAMP` maxes at 2038-01-19; `DEN_SERVICE_ACCOUNT_TOKEN` session expiry is hardcoded to 2038-01-01. Migrate to `DATETIME` before then.

---

## Admin Routes (require `Authorization: Bearer <service-account-token>`)

- `GET /v1/admin/overview` — cluster stats
- `GET /v1/admin/list-orgs` — all orgs + worker counts
- `POST /v1/admin/delete-all-workers` — purges den-db rows (also delete Render services manually)
- `POST /v1/admin/fix-soapbox-worker` — re-provisions the Soapbox org worker

---

## Soapbox-specific Branches / PRs (all merged to `main`)

| PR | Description |
|----|-------------|
| #3 | `fix/worker-opencode-install` — install opencode in Dockerfile |
| #4–6 | Service account foundation, 2038 expiry fix, stale-session prune |
| #8 | Service account upserts org `member` row (fixes `409 organization_unavailable`) |
| #9 | Unique Render service name from worker ID tail (fixes duplicate-name 500) |
| #10–11 | Worker run-command / port binding fixes (`--remote-access` flag) |
| #14+ | Standalone `openwork-server` entrypoint bypassing frozen orchestrator |
