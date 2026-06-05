# Multi-Tenant OpenWork Deployment Guide

This guide covers deploying OpenWork in a multi-tenant architecture where each tenant domain has its own worker instance.

## Architecture

```
┌─────────────────────────────────────┐
│   admin.soapbox.build               │
│   (Orchestrator)                    │
│   - den-web (Next.js)               │
│   - den-api (API server)            │
│   - Authentication DB               │
│   - Worker management               │
└─────────────────────────────────────┘
            │
            │ Authentication & API calls
            │
    ┌───────┴────────┬────────────┐
    │                │            │
┌───▼──────────┐ ┌──▼──────────┐ ┌──▼──────────┐
│ app.soapbox  │ │ customer1.  │ │ customer2.  │
│ .build       │ │ soapbox     │ │ soapbox     │
│              │ │ .build      │ │ .build      │
│ Tenant App   │ │ Tenant App  │ │ Tenant App  │
│ Worker ID: A │ │ Worker ID: B│ │ Worker ID: C│
└──────────────┘ └─────────────┘ └─────────────┘
```

## How It Works

1. **User visits tenant domain** (e.g., app.soapbox.build)
2. **Authentication check** against orchestrator's database
3. **Redirected to sign-in** if not authenticated
4. **After sign-in**, automatically connects to tenant's predefined worker
5. **User is now in their workspace** connected to the tenant-specific worker backend

## Environment Variables

Each tenant deployment needs these environment variables:

### Required

```bash
# Orchestrator URLs
VITE_DEN_BASE_URL=https://admin.soapbox.build
VITE_DEN_API_BASE_URL=https://den-api-production-89bf.up.railway.app

# Force authentication
VITE_DEN_REQUIRE_SIGNIN=true

# Tenant-specific worker ID (unique per tenant)
VITE_PREDEFINED_WORKER_ID=<worker-id-for-this-tenant>
```

### Optional

```bash
# Allowed hosts for CORS (comma-separated)
VITE_ALLOWED_HOSTS=app.soapbox.build,*.soapbox.build

# Public host for this deployment
OPENWORK_PUBLIC_HOST=app.soapbox.build
```

## Railway Deployment Steps

### 1. Create Worker for Tenant

Before deploying the tenant app, create a worker for this tenant in the orchestrator:

1. Log into admin.soapbox.build
2. Navigate to Workers/Background Agents
3. Create a new worker for this tenant
4. Note the Worker ID (you'll need it for `VITE_PREDEFINED_WORKER_ID`)

### 2. Deploy Tenant Instance

Create a new Railway service for the tenant:

```bash
# From the repo root
cd apps/app

# Deploy to Railway
railway up
```

### 3. Configure Environment Variables

In the Railway dashboard for this service:

```bash
VITE_DEN_BASE_URL=https://admin.soapbox.build
VITE_DEN_API_BASE_URL=https://den-api-production-89bf.up.railway.app
VITE_DEN_REQUIRE_SIGNIN=true
VITE_PREDEFINED_WORKER_ID=<paste-worker-id-here>
```

### 4. Add Custom Domain

In Railway dashboard:
- Go to service settings
- Add custom domain: `app.soapbox.build` (or `customer1.soapbox.build`, etc.)
- Railway will provide DNS settings
- Update your DNS provider with the CNAME record

### 5. Test Deployment

1. Visit your tenant domain (e.g., https://app.soapbox.build)
2. You should be redirected to sign-in
3. After signing in with GitHub, you should auto-connect to the worker
4. Verify you can interact with the workspace

## Multiple Tenants

To deploy additional tenants:

1. Create a new worker in admin.soapbox.build for the new tenant
2. Create a new Railway service (or duplicate the existing one)
3. Set the environment variables with the new worker ID
4. Add the custom domain for this tenant
5. Test the deployment

## Worker Provisioning Options

### Option A: Pre-provision Workers
Create workers manually in admin.soapbox.build before deploying tenant apps.

**Pros:**
- Full control over worker configuration
- Can configure worker settings before deployment

**Cons:**
- Manual process for each tenant

### Option B: Auto-provision on First Access
Modify the auto-connect logic to create a worker if one doesn't exist.

**Pros:**
- Automatic worker creation
- Less manual setup

**Cons:**
- Need to implement worker creation logic
- Requires API endpoint for worker creation

## Security Considerations

1. **Authentication is centralized** - All tenants authenticate against the same orchestrator DB
2. **Worker isolation** - Each tenant has a dedicated worker instance
3. **API tokens** - Connection tokens are fetched on-demand and not stored
4. **HTTPS only** - Ensure all deployments use HTTPS

## Troubleshooting

### "Worker not found" error

- Verify `VITE_PREDEFINED_WORKER_ID` matches an existing worker in admin.soapbox.build
- Check that the worker belongs to an organization the user has access to

### Authentication loop

- Clear browser cookies and localStorage
- Verify `VITE_DEN_BASE_URL` and `VITE_DEN_API_BASE_URL` are correct
- Check that the orchestrator is accessible from the tenant domain

### Worker connection fails

- Check worker status in admin.soapbox.build (must be "ready")
- Verify worker instanceUrl is accessible
- Check browser console for CORS errors

### Build fails

- Verify all required environment variables are set
- Check that the build command in railway.json is correct
- Review Railway build logs for specific errors

## Cost Optimization

Each tenant deployment requires:
- 1x Railway service (app frontend)
- 1x Worker instance (backend)

To optimize costs:
- Use Railway's shared infrastructure
- Configure auto-sleep for low-traffic tenants
- Consider worker pooling for similar tenants

## Monitoring

Monitor these metrics for each tenant:
- Worker uptime and status
- API response times to orchestrator
- Authentication success rate
- User connection errors

Access logs via:
- Railway dashboard for each service
- admin.soapbox.build for worker logs
- den-api logs for authentication events
