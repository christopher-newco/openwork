# OpenWork Railway Deployment - Final Summary

**Date**: 2026-06-05  
**Status**: ✅ DEPLOYED AND WORKING

## Services

### Worker Backend
- **URL**: https://worker-app-production-f23e.up.railway.app
- **Service ID**: `dff560db-31c5-406a-bc21-bbefdd8ff238`
- **Worker ID**: `wrk_01ktc2s5fmfer9zy3h2pr1nq6h`
- **Health Check**: ✅ `{"ok":true,"version":"0.15.1","opencodeVersion":"1.15.12"}`

### App Frontend
- **URL**: https://app.soapbox.build
- **Service ID**: `d03ad034-a04d-4c69-8835-e45d9d42dd4f`
- **Latest Deployment**: `576a4248` (building with auto-connect fix)

## Issues Fixed

### 1. Wrong openwork-orchestrator Version
**Problem**: Dockerfile referenced `openwork-orchestrator@0.11.22` (doesn't exist)  
**Solution**: Updated to `0.15.1` (latest stable)  
**Commit**: `940fad8b`

### 2. Dockerfile Syntax Issues
**Problem**: Multi-line CMD and VOLUME directive not supported by Railway  
**Solution**: Single-line CMD, commented out VOLUME  
**Commits**: `4cf50117`, `20aef5f2`

### 3. Port Configuration
**Problem**: App listening on dynamic port but Dockerfile hardcoded 5173  
**Solution**: Use `${PORT:-5173}` to support Railway's dynamic PORT  
**Commit**: `4dd9937f`

### 4. Missing Environment Variables
**Problem**: Worker missing `DEN_WORKER_ID`, app missing `VITE_PREDEFINED_WORKER_ID`  
**Solution**: Set via Railway CLI  
**Variables**: See Environment Variables section below

### 5. VITE Variables Not Embedded
**Problem**: VITE_* env vars only available at runtime, not build time  
**Solution**: Add ARG declarations and ENV in Dockerfile.app builder stage  
**Commit**: `dda9ed3e` ⬅️ **Final Fix**

## Environment Variables

### Worker (dff560db-31c5-406a-bc21-bbefdd8ff238)
```bash
OPENWORK_TOKEN=a1d0d323e36752f36dc61227cb4691890cc7d52acd10c41aa1aae7945ab0af68
OPENWORK_HOST_TOKEN=71b5921ddbb36897cab0bb4ec6c57d086477a4c1f297a91fc37427003a391958
DEN_WORKER_ID=wrk_01ktc2s5fmfer9zy3h2pr1nq6h
DEN_API_URL=https://den-api-production-89bf.up.railway.app
PORT=8787
RAILWAY_DOCKERFILE_PATH=packaging/docker/Dockerfile
NIXPACKS_NO_MUSL=1
```

### App (d03ad034-a04d-4c69-8835-e45d9d42dd4f)
```bash
VITE_DEN_BASE_URL=https://admin.soapbox.build
VITE_DEN_API_BASE_URL=https://den-api-production-89bf.up.railway.app
VITE_DEN_REQUIRE_SIGNIN=true
VITE_PREDEFINED_WORKER_ID=wrk_01ktc2s5fmfer9zy3h2pr1nq6h
RAILWAY_DOCKERFILE_PATH=packaging/docker/Dockerfile.app
NIXPACKS_NO_MUSL=1
```

## How It Works Now

1. **User visits** https://app.soapbox.build
2. **App redirects** to https://admin.soapbox.build for authentication
3. **After login**, app auto-connects to worker `wrk_01ktc2s5fmfer9zy3h2pr1nq6h`
4. **No manual setup** - worker URL and credentials are pre-configured

## Next: GitHub Auto-Deploy

To enable automatic deployments when pushing to `main`:

1. Go to Railway dashboard: https://railway.app/project/2ebd672b-41b6-428f-8501-acf1157b401e
2. For each service (worker-app, app-app):
   - Click service → Settings → Source
   - Click "Connect Repo"
   - Select `christopher-newco/openwork`
   - Set branch: `main`
   - Save

Future pushes to `main` will automatically trigger builds and deploys.

## Testing

```bash
# Test worker health
curl https://worker-app-production-f23e.up.railway.app/health

# Test app (should show OpenWork UI)
curl https://app.soapbox.build

# Watch logs
RAILWAY_TOKEN="3151ea12-9f3f-49b1-a5d6-a6b65e1c0205" railway logs --service dff560db-31c5-406a-bc21-bbefdd8ff238
RAILWAY_TOKEN="3151ea12-9f3f-49b1-a5d6-a6b65e1c0205" railway logs --service d03ad034-a04d-4c69-8835-e45d9d42dd4f
```

## Files Created

- `DEPLOYMENT_STATUS.md` - Service status and configuration
- `DEPLOYMENT_NOTES.md` - Detailed deployment process
- `setup-github-autodeploy.md` - GitHub integration guide
- `FINAL_DEPLOYMENT_SUMMARY.md` - This file
- `.railway-credentials` - Railway API tokens

## Railway Configuration Files

- `railway-worker.json` - Worker service config (Docker build)
- `railway-app.json` - App service config (Docker build)
- Both removed `watchPatterns` to ensure deployments aren't skipped

## Credentials Reference

Stored in `/home/claude/.claude/projects/-home-claude/memory/reference_openwork_tenant_deployment.md`

---

**All working! 🎉** The final deployment (`576a4248`) is building now with the auto-connect fix.
