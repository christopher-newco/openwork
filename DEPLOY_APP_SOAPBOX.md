# Deploying app.soapbox.build

This guide covers deploying the tenant instance at app.soapbox.build.

## Prerequisites

1. Worker must be created in admin.soapbox.build first
2. Railway project and service should exist for "App" deployment
3. Domain app.soapbox.build should be configured in Railway

## Step 1: Create Worker for app.soapbox.build

1. Go to https://admin.soapbox.build
2. Sign in with GitHub
3. Navigate to Dashboard → Background Agents
4. Click "Launch New Worker"
5. Name it "App Soapbox Worker" (or similar)
6. Wait for worker to reach "ready" status
7. **Copy the Worker ID** - you'll need this for environment variables

## Step 2: Configure Railway Environment Variables

In Railway dashboard for the App service, set these environment variables:

```bash
# Orchestrator configuration
VITE_DEN_BASE_URL=https://admin.soapbox.build
VITE_DEN_API_BASE_URL=https://den-api-production-89bf.up.railway.app

# Force authentication
VITE_DEN_REQUIRE_SIGNIN=true

# Predefined worker ID (from Step 1)
VITE_PREDEFINED_WORKER_ID=<paste-worker-id-here>

# Optional: CORS configuration
VITE_ALLOWED_HOSTS=app.soapbox.build
OPENWORK_PUBLIC_HOST=app.soapbox.build
```

## Step 3: Trigger Deployment

```bash
# Push changes to trigger Railway deployment
git push origin main
```

Or manually trigger deployment in Railway dashboard.

## Step 4: Verify Deployment

1. Visit https://app.soapbox.build
2. You should be redirected to GitHub OAuth sign-in
3. After signing in, you should see "Connecting to your workspace..."
4. Once connected, you should be in the OpenWork interface connected to your worker

## Troubleshooting

### "Worker not found" error

**Cause**: The worker ID doesn't exist or isn't accessible

**Fix**:
1. Verify the worker ID in admin.soapbox.build matches `VITE_PREDEFINED_WORKER_ID`
2. Check that the worker status is "ready" (not "starting" or "failed")
3. Ensure the user has access to this worker's organization

### Authentication loop

**Cause**: OAuth callback isn't working correctly

**Fix**:
1. Clear browser cookies and localStorage
2. Check that `VITE_DEN_BASE_URL` is set to `https://admin.soapbox.build`
3. Verify the GitHub OAuth app has `https://admin.soapbox.build` in the callback URLs

### "Failed to load worker information"

**Cause**: API call to orchestrator is failing

**Fix**:
1. Check that `VITE_DEN_API_BASE_URL` is correct
2. Verify admin.soapbox.build and den-api are both running
3. Check Railway logs for the App service for specific API errors
4. Test the API endpoint directly: `curl https://den-api-production-89bf.up.railway.app/health`

### Worker connection times out

**Cause**: Worker backend isn't accessible

**Fix**:
1. Check worker status in admin.soapbox.build (must be "ready")
2. Verify worker's `instanceUrl` is set and accessible
3. Check worker logs in Railway for the worker service
4. Ensure worker service is running and healthy

## Monitoring

Check these in Railway dashboard:

1. **App Service Logs**: Look for authentication and connection errors
2. **Worker Service Logs**: Check for backend errors
3. **den-api Logs**: Verify API calls are succeeding
4. **Metrics**: Monitor request rates and error rates

## Rolling Back

If deployment fails:

```bash
# In Railway dashboard
1. Go to App service
2. Click "Deployments"
3. Find previous successful deployment
4. Click "Redeploy"
```

Or revert the git commit:

```bash
git revert HEAD
git push origin main
```

## Next Steps

To add additional tenant domains (customer1.soapbox.build, etc.):

1. Duplicate the App Railway service
2. Create a new worker in admin.soapbox.build
3. Set environment variables with the new worker ID
4. Configure the new custom domain
5. Deploy and test

See `apps/app/MULTI_TENANT_DEPLOYMENT.md` for detailed multi-tenant architecture documentation.
