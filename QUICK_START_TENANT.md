# Quick Start: Deploy Your First Tenant

This guide will get `app.soapbox.build` up and running in under 10 minutes.

## Prerequisites

✅ Railway account with CLI installed  
✅ Access to admin.soapbox.build  
✅ OpenWork repo cloned locally

## Step 1: Get Your Auth Token (2 minutes)

1. Visit https://admin.soapbox.build
2. Sign in with GitHub
3. Open browser DevTools (F12 or Cmd+Option+I)
4. Go to: Application → Local Storage → `https://admin.soapbox.build`
5. Find `openwork.den.authToken`
6. Copy the value

Set it as an environment variable:
```bash
export ORCHESTRATOR_AUTH_TOKEN="paste-token-here"
```

## Step 2: Register Worker (1 minute)

```bash
node scripts/create-tenant-worker.mjs app
```

**Save the output!** You'll see:
- Worker ID
- Host Token
- Client Token
- Railway deployment commands

The script also saves everything to `tenant-app-config.json` for safekeeping.

## Step 3: Deploy Worker Backend (3 minutes)

Using Railway CLI (or use the dashboard - see full guide):

```bash
# Navigate to Railway project
railway link

# Create worker service
railway service create worker-app

# Set environment variables (copy from Step 2 output)
railway variables set \
  OPENWORK_TOKEN="<client-token>" \
  OPENWORK_HOST_TOKEN="<host-token>" \
  DEN_WORKER_ID="<worker-id>" \
  DEN_API_URL="https://den-api-production-89bf.up.railway.app"

# Deploy
railway up
```

**Verify it works:**
```bash
# Get the Railway URL from dashboard
curl https://<your-worker-service>.up.railway.app/health

# Should return: {"status":"ok"}
```

## Step 4: Deploy Tenant App (3 minutes)

```bash
# Create app service
railway service create app-app

# Set environment variables (use Worker ID from Step 2)
railway variables set \
  VITE_DEN_BASE_URL="https://admin.soapbox.build" \
  VITE_DEN_API_BASE_URL="https://den-api-production-89bf.up.railway.app" \
  VITE_DEN_REQUIRE_SIGNIN="true" \
  VITE_PREDEFINED_WORKER_ID="<worker-id>"

# Deploy
railway up
```

## Step 5: Add Custom Domains (1 minute)

In Railway dashboard:

1. **Worker service:**
   - Settings → Networking → Custom Domain
   - Add: `worker-app.soapbox.build`

2. **App service:**
   - Settings → Networking → Custom Domain
   - Add: `app.soapbox.build`

Railway will provide DNS instructions - update your DNS provider.

## Step 6: Test! (1 minute)

1. Visit https://app.soapbox.build
2. Click "Sign in with GitHub"
3. You should see "Connecting to your workspace..."
4. You're now in your OpenWork tenant! 🎉

## Troubleshooting

**"Worker not found" error:**
- Check `VITE_PREDEFINED_WORKER_ID` matches the Worker ID from Step 2
- Verify the worker shows up at admin.soapbox.build → Background Agents

**Authentication loop:**
- Clear browser cookies and localStorage
- Verify `VITE_DEN_BASE_URL` is exactly `https://admin.soapbox.build`

**Worker connection fails:**
- Check worker health: `curl https://worker-app.soapbox.build/health`
- Verify `OPENWORK_TOKEN` and `OPENWORK_HOST_TOKEN` are set correctly
- Check Railway logs for the worker service

## Next Steps

- Add more tenants: `node scripts/create-tenant-worker.mjs customer1`
- Read full guide: `TENANT_DEPLOYMENT_GUIDE.md`
- Configure monitoring and alerts in Railway
- Set up automated backups of `tenant-*-config.json` files

## Quick Reference

**Register new tenant:**
```bash
node scripts/create-tenant-worker.mjs <tenant-name>
```

**Deploy worker:**
```bash
railway service create worker-<tenant>
railway variables set ... # from registration output
railway up
```

**Deploy app:**
```bash
railway service create app-<tenant>
railway variables set ... # from registration output
railway up
```

**Test:**
```bash
curl https://worker-<tenant>.soapbox.build/health
# Visit https://<tenant>.soapbox.build
```

That's it! Each tenant takes about 10 minutes to deploy.
