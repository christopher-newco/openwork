# Setting Up GitHub Auto-Deploy for OpenWork on Railway

## Current Status
- Repository: christopher-newco/openwork
- Services deployed via `railway up` (manual CLI deploy)
- Need: Auto-deploy when pushing to `main` branch

## Setup Steps

### Option 1: Railway Dashboard (Recommended)

1. **Connect Worker Service to GitHub**:
   - Go to https://railway.app/project/2ebd672b-41b6-428f-8501-acf1157b401e
   - Click `worker-app` service
   - Go to Settings → Source
   - Click "Connect Repo"
   - Select `christopher-newco/openwork`
   - Set branch: `main`
   - Set root directory: `/` (leave empty for repo root)
   - Save

2. **Connect App Service to GitHub**:
   - Click `app-app` service  
   - Same steps as above
   - Branch: `main`

3. **Configure Watch Paths (Optional)**:
   - Worker: Watch `packaging/docker/**` and `Dockerfile`
   - App: Watch `apps/app/**` and `packaging/docker/Dockerfile.app`

### Option 2: Railway CLI

```bash
# This requires GitHub OAuth which the API token doesn't have
# You'll need to do this via the dashboard
```

## After Setup

Once connected, any push to `main` will trigger:
- Build using the Dockerfile (already configured)
- Deploy to the production environment
- Health checks
- Traffic routing to new deployment

## Testing

```bash
# Make a small change and push
echo "# Test deploy" >> README.md
git add README.md
git commit -m "test: trigger auto-deploy"
git push origin main

# Watch logs
railway logs --service dff560db-31c5-406a-bc21-bbefdd8ff238 # worker
railway logs --service d03ad034-a04d-4c69-8835-e45d9d42dd4f # app
```

## Current Manual Deploy Method

```bash
# Worker
cp railway-worker.json railway.json
RAILWAY_TOKEN="3151ea12-9f3f-49b1-a5d6-a6b65e1c0205" railway up --service dff560db-31c5-406a-bc21-bbefdd8ff238 --detach

# App  
cp railway-app.json railway.json
RAILWAY_TOKEN="3151ea12-9f3f-49b1-a5d6-a6b65e1c0205" railway up --service d03ad034-a04d-4c69-8835-e45d9d42dd4f --detach
```
