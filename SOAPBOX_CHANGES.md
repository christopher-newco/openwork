# Soapbox Customizations

Tracks Soapbox-specific changes on the `soapbox-template` branch of
`christopher-newco/openwork` (fork of `different-ai/openwork`). Reference this
during upstream merges to preserve customizations.

Last updated: 2026-06-07

## ⚠️ Architecture reality (corrects the original design doc)

The "Render Worker Provisioning with Template Fork" design assumed workers are
built **from source** (a multi-stage `packaging/docker/Dockerfile` compiling
`apps/orchestrator`). **That is not how workers are built.** Verified against
the live Render services (2026-06-07):

- Render worker services build with **`buildCommand: npm install -g openwork-orchestrator`**
  (the *published npm package*), `rootDir: ee/apps/den-worker-runtime`, branch `main`.
- Editing `apps/orchestrator/src` or `packaging/docker/Dockerfile` therefore has
  **no effect on workers**. The fork repo only supplies the `den-worker-runtime`
  build scripts; the orchestrator itself comes from npm.

**Open decision — how to ship orchestrator customizations to workers:**
1. **Publish a custom npm package** (e.g. `@christopher-newco/openwork-orchestrator`)
   and point `RENDER_WORKER_OPENWORK_VERSION` / buildCommand at it; or
2. **Change the worker `buildCommand`** to build the orchestrator from the cloned
   fork source instead of `npm install -g`.

Until this is decided, UI/route/middleware customizations (design Phases 2 & 6)
are not buildable in a way that reaches workers. The disk + admin-endpoint work
below does **not** depend on this decision.

## Changes on this branch

### Render provisioner — persistent disk + two-phase deploy
- `ee/apps/den-api/src/workers/provisioner.ts`
  - Workers now get a **persistent Render disk** (default 40GB at `/workspace`)
    so user data survives restarts/refreshes. Previously the worker served from
    ephemeral `/tmp/workspace` — every restart wiped all data.
  - Two-phase deploy: create service → wait live → `POST /v1/disks` → redeploy →
    wait live (Render rejects disk creation before the service exists).
  - Extracted `findRenderServiceForWorker()` (shared by deprovision + admin) and
    added `refreshWorkerOnRender()` + `renderDashboardUrl()`.
  - Opt out with `RENDER_WORKER_DISK_SIZE_GB=0` (falls back to ephemeral).
- `ee/apps/den-api/src/env.ts`
  - New env: `RENDER_WORKER_DISK_SIZE_GB` (default 40), `RENDER_WORKER_DISK_MOUNT_PATH`
    (default `/workspace`).

### Admin worker-management endpoints
- `ee/apps/den-api/src/routes/admin/index.ts`
  - `POST /v1/admin/workers/:id/refresh` — triggers a Render redeploy, preserving
    the disk/env/tokens; sets worker status to `provisioning`.
  - `GET /v1/admin/workers/:id/render-dashboard-url` — returns the Render
    dashboard link for the worker's service.
  - Both gated by `requireAdminMiddleware`; use the existing
    `paramValidator(workerIdParamSchema)` convention.

## Not yet done (need decisions / gated steps)
- Orchestrator customization delivery (see open decision above) → blocks UI
  branding, `/api/soapbox/*` routes, den-token middleware, tenant isolation.
- Admin **UI** controls (provision/refresh/dashboard buttons) in `ee/apps/den-web`.
- Branch strategy: `upstream-dev` mirror + adopting `soapbox-template` as the
  worker build branch (currently workers build from `main`) — a Railway env change.
- Deploy: setting `RENDER_WORKER_DISK_SIZE_GB`/`RENDER_OWNER_ID` in Railway,
  redeploying the Den API, and provisioning/refreshing workers (paid, prod).

## Merge conflict watch list
- `ee/apps/den-api/src/workers/provisioner.ts` (Render flow customizations)
- `ee/apps/den-api/src/env.ts` (added render disk config)
- `ee/apps/den-api/src/routes/admin/index.ts` (added worker admin endpoints)
