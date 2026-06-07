# Soapbox Customizations

> **⚠️ 2026-06-07 status correction — this branch's code is REDUNDANT. Read this first.**
>
> This `soapbox-template` branch was built on top of **`dev`**. After it was written,
> investigation proved the **live Den API deploys from `main`**, and **`main` already
> implements everything this branch adds**:
> - **Persistent Render disk** (two-phase: create → `POST /v1/disks` 40GB `/workspace`
>   → PATCH command → redeploy), gated by `RENDER_WORKER_DISK_SIZE_GB`.
> - **Worker builds from source** via `packaging/docker/Dockerfile` (Render `env: docker`),
>   not the npm package.
>
> `dev` and `main` have **diverged into two different provisioner architectures**
> (`dev` = Render `runtime: node` + `npm install -g openwork-orchestrator`, no disk;
> `main` = Docker-from-source + disk). The disk/env changes on this branch only port
> `main`'s feature onto `dev` — **do NOT merge this branch into `main`.**
>
> Possibly still useful on `main` (net-new there): the two admin endpoints
> `POST /v1/admin/workers/:id/refresh` and `GET /v1/admin/workers/:id/render-dashboard-url`.
> Everything else here is superseded.

## How the live system actually works (verified against `main` + the running API)

- **Live Den API** = `main`, at `https://api.admin.soapbox.build` (proven by fingerprinting
  `/openapi.json`: 131 routes; admin routes `delete-all-workers`/`fix-soapbox-worker`/
  `grant-self-admin`/`list-orgs`/`overview` exist on `main`, not `dev`).
- **Workers** = Render `web_service`, `env: docker`, built from `packaging/docker/Dockerfile`
  of the fork (`RENDER_WORKER_REPO`/`BRANCH`), with a 40GB persistent disk at `/workspace`.
- **Admin auth** = session-based (better-auth `user` + `AdminAllowlistTable` email check).
  There is **no API-key path** for admin endpoints.

## The real open task: 2 stale workers have no disk

The 2 currently-running Render workers are **stale** — provisioned by older (`dev`-style:
npm/node, `/tmp/workspace`, no disk) code, so their data is still ephemeral. Fixing them
needs **no code change** — just kill + reprovision through `main`'s existing logic:

1. Delete the worker(s): the `/v1/admin/delete-all-workers` endpoint only removes **DB rows**
   — the Render services must ALSO be deleted via the Render API or they keep running/billing.
2. Reprovision via the normal `POST /v1/workers` flow (so the den-db gets the worker record +
   OPENWORK/HOST tokens); `main`'s provisioner then attaches the disk automatically.

**Blocker:** both require an authenticated **admin session** to `api.admin.soapbox.build`,
which is not available headlessly (no creds in the vault). Must be driven from the admin web
app by an allowlisted admin, or via a session token provided to automation.

**Unverified:** `main`'s disk provisioning has never been runtime-confirmed end-to-end
(the live workers predate it). Validate by provisioning one fresh worker and confirming it
boots healthy with `/workspace` mounted — ideally a throwaway before touching real workers.
