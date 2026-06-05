# Multi-Tenant Deployment Guide for OpenWork on Railway

This guide walks you through deploying OpenWork in a multi-tenant architecture using Railway, where each tenant gets their own domain and worker instance.

## Architecture Overview

```
┌─────────────────────────────────┐
│  admin.soapbox.build            │
│  (Orchestrator)                 │
│  - den-web                      │
│  - den-api                      │
│  - Authentication DB            │
└─────────────────────────────────┘
          │
          │ Registers workers & provides auth
          │
  ┌───────┴───────┬────────────┬──────────┐
  │               │            │          │
┌─▼──────────┐ ┌─▼──────────┐ ┌▼─────────┐
│ Tenant 1   │ │ Tenant 2   │ │ Tenant N │
├────────────┤ ├────────────┤ ├──────────┤
│ app.       │ │ customer1. │ │ acme.    │
│ soapbox    │ │ soapbox    │ │ soapbox  │
│ .build     │ │ .build     │ │ .build   │
├────────────┤ ├────────────┤ ├──────────┤
│ Frontend   │ │ Frontend   │ │ Frontend │
│ (Vite app) │ │ (Vite app) │ │ (Vite app)│
├────────────┤ ├────────────┤ ├──────────┤
│ Worker     │ │ Worker     │ │ Worker   │
│ Backend    │ │ Backend    │ │ Backend  │
└────────────┘ └────────────┘ └──────────┘
```

Each tenant has:
- **Frontend**: Standalone Vite app with auth + auto-connect
- **Worker Backend**: OpenWork server instance

## Prerequisites

1. **Railway Account** with CLI installed
   ```bash
   npm install -g @railway/cli
   railway login
   ```

2. **Orchestrator Auth Token**
   - Visit https://admin.soapbox.build
   - Sign in with GitHub
   - Open DevTools → Application → Local Storage
   - Find `openwork.den.authToken`
   - Copy the value

3. **Set environment variable**
   ```bash
   export ORCHESTRATOR_AUTH_TOKEN="your-token-here"
   ```

## Step 1: Create Worker Registration

For each tenant, register a worker with the orchestrator:

```bash
node scripts/create-tenant-worker.mjs <tenant-name>
```

Examples:
```bash
# Main app tenant
node scripts/create-tenant-worker.mjs app

# Customer tenants
node scripts/create-tenant-worker.mjs customer1
node scripts/create-tenant-worker.mjs acme
```

This script will:
- ✅ Register a "local" worker with den-api
- ✅ Generate authentication tokens
- ✅ Save configuration to `tenant-<name>-config.json`
- ✅ Print Railway deployment instructions

**Save the output!** You'll need the Worker ID and tokens for the next steps.

## Step 2: Deploy Worker Backend to Railway

### Option A: Using Railway CLI

```bash
# Create new service
railway link
railway service create worker-<tenant-name>

# Set environment variables (from script output)
railway variables set \
  OPENWORK_TOKEN="<client-token>" \
  OPENWORK_HOST_TOKEN="<host-token>" \
  DEN_WORKER_ID="<worker-id>" \
  DEN_API_URL="https://den-api-production-89bf.up.railway.app"

# Deploy
railway up --service worker-<tenant-name>
```

### Option B: Using Railway Dashboard

1. **Create New Service**
   - Go to your Railway project
   - Click "New Service"
   - Select "Empty Service"
   - Name it `worker-<tenant-name>`

2. **Connect Repository**
   - Connect to `Audette-Analytics/openwork` repo
   - Branch: `main` (or your deployment branch)

3. **Configure Build**
   - Settings → Build → Service Configuration
   - Path: `packaging/docker/railway-worker.json`
   - Or manually set:
     - Builder: `DOCKERFILE`
     - Dockerfile Path: `packaging/docker/Dockerfile`

4. **Set Environment Variables**
   - Go to Variables tab
   - Add the following (from script output):
   ```
   OPENWORK_TOKEN=<client-token>
   OPENWORK_HOST_TOKEN=<host-token>
   DEN_WORKER_ID=<worker-id>
   DEN_API_URL=https://den-api-production-89bf.up.railway.app
   ```

5. **Deploy**
   - Click "Deploy"
   - Wait for build to complete

6. **Add Custom Domain** (Optional but recommended)
   - Settings → Networking → Custom Domain
   - Add: `worker-<tenant-name>.soapbox.build`
   - Or use Railway-provided domain: `<service>.up.railway.app`

## Step 3: Deploy Tenant App to Railway

### Option A: Using Railway CLI

```bash
# Create new service
railway service create app-<tenant-name>

# Set environment variables
railway variables set \
  VITE_DEN_BASE_URL="https://admin.soapbox.build" \
  VITE_DEN_API_BASE_URL="https://den-api-production-89bf.up.railway.app" \
  VITE_DEN_REQUIRE_SIGNIN="true" \
  VITE_PREDEFINED_WORKER_ID="<worker-id>"

# Deploy
railway up --service app-<tenant-name>
```

### Option B: Using Railway Dashboard

1. **Create New Service**
   - Click "New Service"
   - Name it `app-<tenant-name>`

2. **Connect Repository**
   - Same repo: `Audette-Analytics/openwork`
   - Branch: `main`

3. **Configure Build**
   - Settings → Build → Service Configuration
   - Path: `apps/app/railway.json`
   - Or manually:
     - Builder: `DOCKERFILE`
     - Dockerfile Path: `packaging/docker/Dockerfile.app`

4. **Set Environment Variables**
   ```
   VITE_DEN_BASE_URL=https://admin.soapbox.build
   VITE_DEN_API_BASE_URL=https://den-api-production-89bf.up.railway.app
   VITE_DEN_REQUIRE_SIGNIN=true
   VITE_PREDEFINED_WORKER_ID=<worker-id-from-step-1>
   ```

5. **Deploy**
   - Click "Deploy"

6. **Add Custom Domain**
   - Settings → Networking → Custom Domain
   - Add: `<tenant-name>.soapbox.build`

## Step 4: Verify Deployment

### Test Worker Backend

```bash
# Check health endpoint
curl https://worker-<tenant-name>.soapbox.build/health

# Should return: {"status":"ok"}
```

### Test Tenant App

1. Visit `https://<tenant-name>.soapbox.build`
2. You should be redirected to GitHub OAuth sign-in
3. After signing in, you should see "Connecting to your workspace..."
4. Once connected, you should be in the OpenWork interface

### Troubleshooting

**Worker Backend Issues:**
- Check Railway logs for the worker service
- Verify environment variables are set correctly
- Ensure `DEN_WORKER_ID` matches the worker ID from Step 1
- Check that the worker is registered: Visit admin.soapbox.build → Background Agents

**Tenant App Issues:**
- Check that `VITE_PREDEFINED_WORKER_ID` matches exactly
- Verify authentication redirects to admin.soapbox.build
- Check browser console for errors
- Clear browser cache/cookies and try again

**Connection Issues:**
- Verify worker backend is healthy (check `/health`)
- Ensure tokens match between registration and deployment
- Check CORS settings if seeing network errors

## Adding Additional Tenants

For each new tenant, repeat all steps:

```bash
# 1. Register worker
node scripts/create-tenant-worker.mjs customer2

# 2. Deploy worker backend
railway service create worker-customer2
railway variables set ... # (from script output)
railway up

# 3. Deploy tenant app
railway service create app-customer2
railway variables set ... # (from script output)
railway up

# 4. Add custom domains
# - worker-customer2.soapbox.build → worker service
# - customer2.soapbox.build → app service

# 5. Test
curl https://worker-customer2.soapbox.build/health
# Visit https://customer2.soapbox.build
```

## Cost Optimization

Each tenant requires 2 Railway services:
- 1x Frontend (Vite app) - ~$5/month
- 1x Worker backend - ~$10/month
- **Total: ~$15/month per tenant**

To optimize:
- Use Railway's Hobby plan ($5/service)
- Configure auto-sleep for low-traffic tenants
- Share worker backends for similar customers (if appropriate)

## Monitoring

Monitor via Railway dashboard:
- **Metrics**: CPU, memory, network usage per service
- **Logs**: Real-time logs for debugging
- **Health**: Uptime and response times

Key metrics to watch:
- Worker backend uptime (should be 99%+)
- App build success rate
- API response times to orchestrator

## Security Considerations

- ✅ Authentication is centralized (admin.soapbox.build)
- ✅ Each tenant has isolated worker backend
- ✅ Tokens are environment variables (not in code)
- ✅ HTTPS enforced on all domains
- ⚠️ Rotate tokens periodically (delete worker, re-register)

## Backup & Recovery

**Worker Registration:**
- Configuration saved to `tenant-<name>-config.json`
- Commit these files to a private repo for disaster recovery

**Worker Data:**
- Workers are stateless by default
- Persistent data should be in external storage (S3, etc.)
- Railway volumes can be used for persistent `/workspace`

**Recovery Process:**
1. Re-run `create-tenant-worker.mjs` to get new tokens
2. Update Railway environment variables
3. Redeploy services

## Production Checklist

Before going live with a tenant:

- [ ] Worker registered and healthy
- [ ] Frontend deployed and accessible
- [ ] Custom domains configured
- [ ] Authentication flow tested
- [ ] Auto-connect verified
- [ ] Error handling tested
- [ ] Logs reviewed for issues
- [ ] Configuration backed up
- [ ] Monitoring set up
- [ ] Rollback plan documented

## Support

For issues:
1. Check Railway logs first
2. Verify environment variables
3. Test worker `/health` endpoint
4. Review admin.soapbox.build → Background Agents
5. Check browser DevTools console

Common issues documented in `apps/app/MULTI_TENANT_DEPLOYMENT.md`.
