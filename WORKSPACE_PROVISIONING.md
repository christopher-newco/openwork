# OpenWork Workspace Provisioning Guide

This guide explains how to configure OpenWork Den to automatically provision isolated workspace instances for users.

## Overview

OpenWork Den can automatically provision web-based workspace instances on-demand when users create new workspaces. Each workspace runs an isolated OpenWork server that users can access through their browser.

## Supported Provisioner Modes

### 1. Stub Mode (Default)

**Use case**: Development, testing, or when you have your own custom provisioning system.

```bash
PROVISIONER_MODE=stub
WORKER_URL_TEMPLATE=https://workers.local/{workerId}
```

In stub mode, den-api returns a URL based on the template but doesn't actually provision anything. You handle provisioning externally.

### 2. Render.com Mode

**Use case**: Production deployments with automatic scaling and custom domains.

Render.com provisions full-featured web services with:
- Automatic SSL certificates
- Custom domain support  
- Regional deployment
- Health checking
- Auto-scaling

#### Configuration

```bash
# Required
PROVISIONER_MODE=render
RENDER_API_KEY=<your-render-api-key>
RENDER_OWNER_ID=<your-render-owner-id>

# Worker configuration
RENDER_WORKER_REPO=https://github.com/different-ai/openwork
RENDER_WORKER_BRANCH=main
RENDER_WORKER_ROOT_DIR=apps/orchestrator
RENDER_WORKER_PLAN=starter  # or: standard, pro, etc.
RENDER_WORKER_REGION=oregon  # or: frankfurt, singapore, etc.
RENDER_WORKER_NAME_PREFIX=openwork-workspace
RENDER_WORKER_OPENWORK_VERSION=latest  # or specific version: 1.2.3

# Optional: Custom domains
RENDER_WORKER_PUBLIC_DOMAIN_SUFFIX=workspace.yourdomain.com
VERCEL_TOKEN=<vercel-api-token>
VERCEL_DNS_DOMAIN=yourdomain.com
VERCEL_TEAM_ID=<vercel-team-id>  # for team accounts

# Timeouts (optional)
RENDER_PROVISION_TIMEOUT_MS=600000  # 10 minutes
RENDER_HEALTHCHECK_TIMEOUT_MS=120000  # 2 minutes
RENDER_CUSTOM_DOMAIN_READY_TIMEOUT_MS=180000  # 3 minutes
RENDER_POLL_INTERVAL_MS=5000  # 5 seconds
```

#### How It Works

1. User creates a workspace in den-web
2. den-api calls Render API to create a new web service
3. Render builds and deploys openwork-orchestrator
4. Service waits for deployment to become "live"
5. Health endpoint is checked at `/health`
6. (Optional) Custom domain is attached via DNS
7. Workspace URL is returned to user

#### Cost Estimation

- **Starter plan**: ~$7/month per active workspace
- **Standard plan**: ~$20/month per active workspace
- Workspaces can be suspended when not in use to save costs

### 3. Daytona Mode

**Use case**: Ephemeral, container-based workspaces with fast provisioning.

Daytona provisions Docker containers as workspaces with:
- Sub-minute provisioning
- Snapshot-based cloning
- Auto-stop/archive/delete policies
- Shared volumes for persistence
- Signed preview URLs

#### Configuration

```bash
# Required
PROVISIONER_MODE=daytona
DAYTONA_API_URL=https://app.daytona.io/api
DAYTONA_API_KEY=<your-daytona-api-key>

# Target configuration
DAYTONA_TARGET=<target-id>  # Get from Daytona dashboard
DAYTONA_SNAPSHOT=<snapshot-id>  # Optional: base snapshot

# Sandbox configuration
DAYTONA_SANDBOX_IMAGE=different-ai/openwork-sandbox:latest
DAYTONA_SANDBOX_CPU=2  # CPU cores
DAYTONA_SANDBOX_MEMORY=4096  # MB
DAYTONA_SANDBOX_DISK=10240  # MB
DAYTONA_SANDBOX_PUBLIC=true  # Allow public access
DAYTONA_SANDBOX_NAME_PREFIX=openwork-workspace

# Lifecycle policies
DAYTONA_SANDBOX_AUTO_STOP_INTERVAL=3600  # Stop after 1 hour idle
DAYTONA_SANDBOX_AUTO_ARCHIVE_INTERVAL=86400  # Archive after 1 day
DAYTONA_SANDBOX_AUTO_DELETE_INTERVAL=2592000  # Delete after 30 days

# Volume configuration
DAYTONA_SHARED_VOLUME_NAME=openwork-shared
DAYTONA_VOLUME_NAME_PREFIX=openwork-vol
DAYTONA_WORKSPACE_MOUNT_PATH=/workspace
DAYTONA_DATA_MOUNT_PATH=/data
DAYTONA_RUNTIME_WORKSPACE_PATH=/tmp/workspace
DAYTONA_RUNTIME_DATA_PATH=/tmp/data

# Network configuration
DAYTONA_WORKER_PROXY_BASE_URL=https://proxy.yourdomain.com
DAYTONA_OPENWORK_PORT=10000
DAYTONA_OPENCODE_PORT=4096
DAYTONA_SIGNED_PREVIEW_EXPIRES_SECONDS=3600

# Timeouts
DAYTONA_CREATE_TIMEOUT_SECONDS=180  # 3 minutes
DAYTONA_DELETE_TIMEOUT_SECONDS=60  # 1 minute
DAYTONA_HEALTHCHECK_TIMEOUT_MS=120000  # 2 minutes
```

#### How It Works

1. User creates a workspace in den-web
2. den-api calls Daytona API to create a sandbox
3. Daytona provisions a Docker container from snapshot or image
4. Volumes are mounted for workspace persistence
5. OpenWork server starts inside container
6. Health endpoint is checked
7. Signed preview URL is generated
8. Workspace URL is returned to user

#### Cost Estimation

- Pricing varies by Daytona plan and resource usage
- Containers can auto-stop when idle to save costs
- Snapshots allow fast cloning without rebuilding

## Required Database Migrations

Before provisioning works, run the database migrations:

```bash
# Using Railway CLI
railway run pnpm --filter @openwork-ee/den-db db:migrate

# Or using Railway shell
# 1. Go to den-api service in Railway
# 2. Click "Shell" tab
# 3. Run:
cd ee/packages/den-db
pnpm run db:migrate
```

This creates the `workers` table and related infrastructure.

## Testing Workspace Provisioning

### 1. Create a Test Workspace

```bash
export AUTH_TOKEN="your-session-token"
export API_BASE="https://den-api-production.up.railway.app"

# Create workspace
curl -X POST $API_BASE/v1/workers \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Workspace",
    "organizationId": "org_xxxxx"
  }' | jq
```

### 2. Check Provisioning Status

```bash
export WORKER_ID="wrk_xxxxx"  # From response above

# Get worker status
curl -X GET $API_BASE/v1/workers/$WORKER_ID \
  -H "Authorization: Bearer $AUTH_TOKEN" | jq
```

### 3. Access the Workspace

The response includes a `url` field. Open that URL in your browser to access the workspace.

## Provisioning Workflow

1. **Create**: User creates a workspace via den-web or API
2. **Generate Tokens**: System generates host and client tokens
3. **Provision**: Provisioner creates the instance (Render/Daytona/stub)
4. **Health Check**: System waits for `/health` to return 200
5. **Register**: Workspace URL is saved to database
6. **Connect**: User can now access workspace at the URL

## Deprovisioning

Workspaces can be deleted, which triggers deprovisioning:

```bash
curl -X DELETE $API_BASE/v1/workers/$WORKER_ID \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

This will:
- Mark worker as deleted in database
- Call provisioner to remove the instance
- (Render) Suspend the service
- (Daytona) Delete the sandbox and volumes

## Worker Activity Tracking

Workspaces send heartbeat pings to track activity:

```bash
WORKER_ACTIVITY_BASE_URL=https://den-api-production.up.railway.app
```

Each workspace pings `${WORKER_ACTIVITY_BASE_URL}/v1/workers/${WORKER_ID}/activity` every 30 seconds.

This enables:
- Last active timestamp
- Auto-stop policies
- Usage tracking
- Activity-based billing

## Security Considerations

### Tokens

Each workspace has three tokens:

1. **Host Token**: Full admin access to workspace
2. **Client Token**: Limited access for user operations
3. **Activity Token**: Limited to sending heartbeats

These are generated server-side and passed as environment variables.

### Network Isolation

- Workspaces should not have access to each other
- Consider using network policies or VPCs
- Use signed URLs with expiration for preview access

### Resource Limits

Set appropriate resource limits:

```bash
# Render
RENDER_WORKER_PLAN=starter  # Limits CPU/memory

# Daytona
DAYTONA_SANDBOX_CPU=2
DAYTONA_SANDBOX_MEMORY=4096
DAYTONA_SANDBOX_DISK=10240
```

## Monitoring and Debugging

### Check Provisioning Logs

```bash
# Railway deployment logs
railway logs --service den-api

# Or in Railway web UI:
# Go to den-api service → Deployments → Click latest → View logs
```

### Common Issues

**Error**: `RENDER_API_KEY is required for render provisioner`  
**Fix**: Set all required Render environment variables

**Error**: `Timed out waiting for worker health endpoint`  
**Fix**: Check that workspace is actually starting and `/health` responds

**Error**: `Render deploy ended with build_failed`  
**Fix**: Check Render dashboard for build logs

**Error**: `Daytona API authentication failed`  
**Fix**: Verify DAYTONA_API_KEY is correct

## Next Steps

1. **Choose provisioner**: Pick stub/render/daytona based on your needs
2. **Configure environment**: Set all required variables in Railway
3. **Run migrations**: Ensure database schema is up to date
4. **Test provisioning**: Create a test workspace
5. **Monitor costs**: Track active workspaces and resource usage
6. **Set lifecycle policies**: Configure auto-stop/delete for cost optimization

## Support

For issues or questions:
- GitHub Issues: https://github.com/different-ai/openwork/issues
- Documentation: https://github.com/different-ai/openwork
