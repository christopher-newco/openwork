# Soapbox Openwork Deployment Guide

> **Archived 2026-06-13.** This repo (a fork of [different-ai/openwork](https://github.com/different-ai/openwork)) powered the Soapbox "Den" cloud workspace platform. It has been superseded by a Paperclip-native architecture and is no longer maintained.

## Architecture Overview

### Railway Project: `production`
| Service | URL | Notes |
|---------|-----|-------|
| API (ee/apps/den-api) | api.admin.soapbox.build | Control plane |
| Admin App (ee/apps/den-web) | admin.soapbox.build | Sign-in + workspace handoff |
| Web App (apps/app) | app.soapbox.build | Vite SPA, auto-connects to predefined worker |
| Render.com Proxy | internal | Proxies den-api to Render worker API |
| SoapBox RAG | internal | pgvector semantic search |
| soapbox-memory | internal | Shared memory service |
| inference | internal | LLM inference endpoint |
| Config Storage | internal | Persistent worker config |

### Render Team: Soapbox (tea-d8ief0m7r5hc73cr3j60)
Workers provisioned on-demand: POST /v1/workers {destination:"cloud"}

Each worker: standard plan (2 GB/1 CPU), 40 GB disk at /workspace, Docker image from packaging/docker/Dockerfile on main branch. Entrypoint: openwork-server with OPENWORK_MANAGE_OPENCODE=1.

## Key Environment Variables (Den API)
- DATABASE_URL: Railway Postgres
- DEN_SERVICE_ACCOUNT_TOKEN: Headless admin bearer
- RENDER_API_KEY: rnd_v0... (Render team owner)
- RENDER_WORKER_REPO/BRANCH: christopher-newco/openwork, main
- RENDER_WORKER_PLAN: standard
- RENDER_WORKER_DISK_SIZE_GB: 40
- BETTER_AUTH_SECRET/URL: auth config

## Key Bugs / Gotchas
1. Worker OOM: starter plan (512MB) killed under load; use standard (2GB)
2. Disk attaches in second phase after first deploy goes live (~30s 502 is normal)
3. Render 500 on duplicate service names: provisioner slugs from worker ID tail
4. Worker limit counts ALL rows incl failed: delete stale failed workers first
5. Web App VITE_DEN_API_BASE_URL must point to api.admin.soapbox.build directly (den-web proxy corrupts POST bodies)
6. Worker status is "healthy" not "ready"; isWorkerConnectable() accepts both
7. openwork-orchestrator@0.15.1 freezes at waitForOpencodeHealthy() with opencode 1.15.12; bypassed by running openwork-server directly with OPENWORK_MANAGE_OPENCODE=1
8. DEN_SERVICE_ACCOUNT_TOKEN session expiry hardcoded to 2038-01-01 (MySQL TIMESTAMP limit)

## Admin Routes
POST /v1/workers {destination:"cloud"} - provision worker
POST /v1/workers/:id/tokens - get connection tokens (POST not GET)
DELETE /v1/workers/:id - deprovision
GET /v1/admin/overview, /v1/admin/list-orgs
POST /v1/admin/delete-all-workers (also delete Render services via API)

## Soapbox PRs merged to main
- PR #3: install opencode in Dockerfile
- PR #4-6: service account (foundation, 2038 expiry, stale-session prune)
- PR #8: service account upserts org member row (fixes 409 organization_unavailable)
- PR #9: unique Render service name from worker ID tail (fixes duplicate-name 500)
- PR #10-11: worker port binding (--remote-access flag)
- PR #14+: standalone openwork-server bypassing frozen orchestrator
