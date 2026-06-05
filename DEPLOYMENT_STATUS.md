# OpenWork Deployment Status

**Updated**: 2026-06-05

## Services

### Worker (worker-app)
- **Service ID**: `dff560db-31c5-406a-bc21-bbefdd8ff238`
- **URL**: https://worker-app-production-f23e.up.railway.app
- **Latest Deployment**: `b5f02b3d-bef7-44af-bf02-7076b6f1f37e`
- **Status**: Deploying (with DEN_WORKER_ID configured)

### App Frontend (app-app)
- **Service ID**: `d03ad034-a04d-4c69-8835-e45d9d42dd4f`
- **URL**: https://app.soapbox.build
- **Latest Deployment**: `7545c7bb-923d-43a2-a33a-d95eec052074`
- **Status**: Deploying (with VITE_PREDEFINED_WORKER_ID configured)

## Configuration

### Worker Environment Variables
- ✅ `OPENWORK_TOKEN`: Configured
- ✅ `OPENWORK_HOST_TOKEN`: Configured  
- ✅ `DEN_WORKER_ID`: wrk_01ktc2s5fmfer9zy3h2pr1nq6h
- ✅ `DEN_API_URL`: https://den-api-production-89bf.up.railway.app
- ✅ `PORT`: 8787
- ✅ `RAILWAY_DOCKERFILE_PATH`: packaging/docker/Dockerfile

### App Environment Variables
- ✅ `VITE_DEN_BASE_URL`: https://admin.soapbox.build
- ✅ `VITE_DEN_API_BASE_URL`: https://den-api-production-89bf.up.railway.app
- ✅ `VITE_DEN_REQUIRE_SIGNIN`: true
- ✅ `VITE_PREDEFINED_WORKER_ID`: wrk_01ktc2s5fmfer9zy3h2pr1nq6h
- ✅ `RAILWAY_DOCKERFILE_PATH`: packaging/docker/Dockerfile.app

## Recent Changes

1. Fixed `openwork-orchestrator` version (0.11.22 → 0.15.1)
2. Fixed Dockerfile CMD format for Railway compatibility
3. Removed VOLUME directive (not supported by Railway)
4. Fixed PORT configuration in Dockerfile.app
5. Added missing `DEN_WORKER_ID` environment variable
6. Added `VITE_PREDEFINED_WORKER_ID` for auto-connect

## Next Steps

### 1. GitHub Auto-Deploy (Manual Setup Required)
See `setup-github-autodeploy.md` for instructions.

**Quick Setup**:
1. Go to Railway dashboard → worker-app → Settings → Source
2. Connect to `christopher-newco/openwork` repo
3. Set branch: `main`
4. Repeat for app-app service

### 2. Test Deployment
Once deployments complete (in ~2-3 minutes):
```bash
# Test worker
curl https://worker-app-production-f23e.up.railway.app/health

# Test app
curl https://app.soapbox.build
```

### 3. Verify Auto-Connect
- Go to https://app.soapbox.build
- Should redirect to admin.soapbox.build for authentication
- After login, should auto-connect to worker wrk_01ktc2s5fmfer9zy3h2pr1nq6h

## Troubleshooting

### Worker 502 Error
**Cause**: Missing DEN_WORKER_ID  
**Fixed**: Added to environment variables

### App Not Auto-Connecting  
**Cause**: VITE_ variables not embedded at build time  
**Fixed**: Set VITE_PREDEFINED_WORKER_ID and rebuilt

### Deployment Skipped
**Cause**: watchPatterns preventing deploys  
**Fixed**: Removed watchPatterns from railway.json

## Build Logs
- Worker: https://railway.com/project/2ebd672b-41b6-428f-8501-acf1157b401e/service/dff560db-31c5-406a-bc21-bbefdd8ff238?id=b5f02b3d-bef7-44af-bf02-7076b6f1f37e
- App: https://railway.com/project/2ebd672b-41b6-428f-8501-acf1157b401e/service/d03ad034-a04d-4c69-8835-e45d9d42dd4f?id=7545c7bb-923d-43a2-a33a-d95eec052074
