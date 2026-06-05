# OpenWork Den - Complete Deployment Overview

This document provides a high-level overview of deploying and operating OpenWork Den, a multi-tenant workspace platform.

## What is OpenWork Den?

OpenWork Den is the server-side infrastructure that enables:

1. **User Authentication** - GitHub OAuth, email/password, SSO
2. **Organization Management** - Multi-tenant organizations with teams and members
3. **Workspace Provisioning** - Automatic deployment of isolated OpenWork instances
4. **Billing & Metering** - Stripe integration for usage-based billing
5. **API Access** - RESTful API with MCP server capabilities

## Architecture Components

```
┌─────────────┐      ┌──────────────┐      ┌─────────────────┐
│  den-web    │─────▶│   den-api    │─────▶│   Database      │
│  (Next.js)  │      │   (Hono)     │      │ (PostgreSQL/    │
│  Admin UI   │      │   REST API   │      │  MySQL)         │
└─────────────┘      └──────────────┘      └─────────────────┘
                            │
                            ├──────────────┐
                            │              │
                     ┌──────▼─────┐  ┌────▼──────┐
                     │   Redis    │  │ Provisioner│
                     │  (Sessions)│  │ (Render/   │
                     └────────────┘  │  Daytona)  │
                                     └────────────┘
                                           │
                                           ▼
                                   ┌──────────────┐
                                   │  Worker      │
                                   │  Instances   │
                                   │ (OpenWork)   │
                                   └──────────────┘
```

## Deployment Guides

### 1. [RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md)

**Covers**: Deploying the core Den infrastructure to Railway

- Setting up den-api and den-web services
- Configuring PostgreSQL or MySQL database
- GitHub OAuth integration
- Environment variable reference
- Database migrations
- Troubleshooting common issues

**Start here** if you're deploying for the first time.

### 2. [WORKSPACE_PROVISIONING.md](./WORKSPACE_PROVISIONING.md)

**Covers**: Configuring automatic workspace provisioning

- Provisioner modes: stub, Render.com, Daytona
- Environment configuration for each mode
- Cost estimation and resource limits
- Testing workspace creation
- Security and monitoring

**Use this** after deploying the core infrastructure to enable workspace provisioning.

## Quick Start

### Minimum Viable Deployment

To get den-api and den-web running with authentication:

1. **Deploy to Railway** (follow [RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md)):
   - Add PostgreSQL database
   - Add Redis database
   - Deploy den-api service
   - Deploy den-web service
   - Set up GitHub OAuth

2. **Run database migrations**:
   ```bash
   railway run pnpm --filter @openwork-ee/den-db db:migrate
   ```

3. **Test the deployment**:
   ```bash
   curl https://den-api-production.up.railway.app/health
   # Expected: {"ok":true,"service":"den-api"}
   ```

4. **Sign in**:
   - Go to https://admin.soapbox.build (your den-web URL)
   - Click "Sign in with GitHub"
   - Create your first organization

**At this point**, you have a working Den deployment with authentication and organization management, but workspace provisioning is in stub mode (non-functional).

### Adding Workspace Provisioning

To enable automatic workspace creation (follow [WORKSPACE_PROVISIONING.md](./WORKSPACE_PROVISIONING.md)):

**Option A: Render.com (Recommended for production)**
1. Get Render API key and Owner ID
2. Set environment variables in Railway:
   ```bash
   PROVISIONER_MODE=render
   RENDER_API_KEY=<your-key>
   RENDER_OWNER_ID=<your-id>
   RENDER_WORKER_REPO=https://github.com/different-ai/openwork
   ```
3. Redeploy den-api

**Option B: Daytona (Recommended for fast ephemeral workspaces)**
1. Get Daytona API key
2. Set environment variables in Railway:
   ```bash
   PROVISIONER_MODE=daytona
   DAYTONA_API_KEY=<your-key>
   DAYTONA_API_URL=https://app.daytona.io/api
   DAYTONA_TARGET=<target-id>
   ```
3. Redeploy den-api

**Option C: Stub (Development only)**
- No configuration needed
- Workspace creation returns mock URLs
- Use this for testing the API without actual provisioning

## Database Support

OpenWork Den supports three database backends:

| Database     | Connection URL Format       | Use Case                    |
|--------------|-----------------------------|-----------------------------|
| PostgreSQL   | `postgresql://...`          | Recommended for production  |
| MySQL        | `mysql://...`               | Traditional deployments     |
| PlanetScale  | Set HOST/USERNAME/PASSWORD  | Serverless MySQL            |

The database type is **auto-detected** from the `DATABASE_URL` format.

## Environment Variables Quick Reference

### Required (All Deployments)

| Variable | Generate With | Example |
|----------|---------------|---------|
| `DATABASE_URL` | Railway provides | `postgresql://...` |
| `REDIS_URL` | Railway provides | `redis://...` |
| `DEN_DB_ENCRYPTION_KEY` | `openssl rand -base64 128` | (base64 string) |
| `BETTER_AUTH_SECRET` | `openssl rand -hex 32` | (hex string) |
| `BETTER_AUTH_URL` | Your domain | `https://den-api.yourdomain.com` |
| `DEN_BETTER_AUTH_TRUSTED_ORIGINS` | Your domain | `https://admin.yourdomain.com` |

### Required for GitHub OAuth

| Variable | Source |
|----------|--------|
| `GITHUB_CLIENT_ID` | GitHub OAuth app |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth app |

### Required for Workspace Provisioning (Render)

| Variable | Source |
|----------|--------|
| `PROVISIONER_MODE` | Set to `render` |
| `RENDER_API_KEY` | Render dashboard |
| `RENDER_OWNER_ID` | Render dashboard |
| `RENDER_WORKER_REPO` | Git repository |

### Required for Workspace Provisioning (Daytona)

| Variable | Source |
|----------|--------|
| `PROVISIONER_MODE` | Set to `daytona` |
| `DAYTONA_API_KEY` | Daytona dashboard |
| `DAYTONA_API_URL` | Daytona instance |
| `DAYTONA_TARGET` | Daytona target ID |

## Testing Your Deployment

### 1. Health Check

```bash
curl https://den-api-production.up.railway.app/health
# Expected: {"ok":true,"service":"den-api"}
```

### 2. GitHub OAuth Login

1. Go to your den-web URL
2. Click "Sign in with GitHub"
3. You should be redirected and logged in

### 3. Create an Organization

1. After login, create a new organization
2. Add team members
3. Configure settings

### 4. Create a Workspace (if provisioning configured)

1. Go to Workspaces tab
2. Click "Create Workspace"
3. Wait for provisioning to complete
4. Click the workspace URL to access it

## Cost Estimation

### Minimum Deployment (Railway)

- **PostgreSQL**: $5/month (Hobby plan)
- **Redis**: $5/month (Hobby plan)
- **den-api**: $5/month (512MB RAM)
- **den-web**: $5/month (512MB RAM)

**Total**: ~$20/month for the core infrastructure

### With Workspace Provisioning

**Render.com mode**:
- Add $7-20/month per active workspace (depending on plan)
- Workspaces can be suspended when not in use

**Daytona mode**:
- Pricing varies by Daytona plan and resource usage
- Containers can auto-stop when idle

## Monitoring

### Railway Dashboard

- View deployment logs
- Monitor resource usage
- Check service health
- Manage environment variables

### Application Logs

```bash
# Using Railway CLI
railway logs --service den-api
railway logs --service den-web

# Or in Railway web UI
# Go to service → Deployments → Click latest → View logs
```

### Database Queries

To inspect the database:

1. Go to Railway → PostgreSQL service
2. Click "Query" tab
3. Run SQL queries to check data

## Security Checklist

- [ ] Set strong random values for `DEN_DB_ENCRYPTION_KEY` and `BETTER_AUTH_SECRET`
- [ ] Configure `DEN_BETTER_AUTH_TRUSTED_ORIGINS` to only allow your domains
- [ ] Use environment-specific GitHub OAuth apps (dev vs prod)
- [ ] Enable SSL/TLS for all services (Railway provides this automatically)
- [ ] Set resource limits for provisioned workspaces
- [ ] Regularly update dependencies and review security advisories
- [ ] Monitor logs for suspicious activity
- [ ] Set up backups for the database

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| `DATABASE_URL must include host` | Check DATABASE_URL format matches database type |
| `transient mysql error on query` | Database type mismatch - verify URL starts with `postgresql://` |
| `Not Authorized` (Railway API) | Check Railway API token is account-scoped, not workspace-scoped |
| `redirect_uri_mismatch` (GitHub) | Update GitHub OAuth app callback URL |
| `RENDER_API_KEY is required` | Set all required Render environment variables |

### Getting Help

- **GitHub Issues**: https://github.com/different-ai/openwork/issues
- **Documentation**: https://github.com/different-ai/openwork
- **Logs**: Always check Railway deployment logs first

## Next Steps

1. ✅ **Deploy core infrastructure** ([RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md))
2. ✅ **Run database migrations**
3. ✅ **Test GitHub OAuth login**
4. ⬜ **Configure workspace provisioning** ([WORKSPACE_PROVISIONING.md](./WORKSPACE_PROVISIONING.md))
5. ⬜ **Set up billing** (Stripe integration)
6. ⬜ **Configure email** (transactional emails)
7. ⬜ **Add custom domains** (vanity URLs for workspaces)
8. ⬜ **Set up monitoring** (logging, error tracking)

## Production Readiness

Before going to production:

- [ ] Configure production GitHub OAuth app
- [ ] Set up production Stripe account
- [ ] Configure email provider (Resend or SMTP)
- [ ] Set up database backups
- [ ] Configure auto-scaling policies
- [ ] Set up monitoring and alerting
- [ ] Review security settings
- [ ] Test disaster recovery procedures
- [ ] Document incident response procedures

## Support

For issues, questions, or contributions:
- GitHub: https://github.com/different-ai/openwork
- Issues: https://github.com/different-ai/openwork/issues
