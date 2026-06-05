# OpenWork Den - Railway Deployment Guide

This guide explains how to deploy OpenWork Den (den-api + den-web) on Railway with full functionality including workspace provisioning.

## Architecture Overview

- **den-web**: Next.js web application for the admin dashboard
- **den-api**: Hono API server providing authentication, workspace management, and provisioning
- **Database**: PostgreSQL or MySQL for persistent storage
- **Redis**: Session and queue management
- **Worker**: Isolated workspace instances provisioned on-demand

## Prerequisites

1. Railway account
2. GitHub repository access
3. GitHub OAuth application credentials

## Step 1: Create Railway Project

1. Go to https://railway.app
2. Create a new project
3. Note your **Project ID** (found in project settings)

## Step 2: Add Database Services

### Option A: MySQL (Recommended - Native Support)

1. Click "New" → "Database" → "Add MySQL"
2. Railway will automatically create `DATABASE_URL` environment variable
3. **Note**: OpenWork was designed for MySQL - all existing migrations are in MySQL format

### Option B: PostgreSQL (Alternative - Requires Fresh Start)

1. Click "New" → "Database" → "Add PostgreSQL"
2. Railway will automatically create `DATABASE_URL` environment variable
3. **Note**: PostgreSQL support was added recently. You'll need to push schema directly rather than using migrations
4. **Warning**: Existing MySQL migrations won't work with PostgreSQL

### Add Redis

1. Click "New" → "Database" → "Add Redis"
2. Railway will automatically create `REDIS_URL` environment variable

## Step 3: Deploy den-api Service

### 3.1 Add Service from GitHub

1. Click "New" → "GitHub Repo"
2. Select your OpenWork repository
3. Name the service `den-api`

### 3.2 Configure Build Settings

Railway will auto-detect the Dockerfile. If not:

1. Go to service Settings
2. Set **Dockerfile Path**: `packaging/docker/Dockerfile.den-api`
3. Set **Root Directory**: (leave empty to use repo root)

### 3.3 Configure Environment Variables

Add these required variables:

```bash
# Database (automatically provided by Railway when you add a DB service)
DATABASE_URL=${{Postgres.DATABASE_URL}}  # or ${{MySQL.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}

# Security - Generate these securely!
DEN_DB_ENCRYPTION_KEY=<base64-encoded-32+-char-key>  # openssl rand -base64 128
BETTER_AUTH_SECRET=<32+-char-secret>                  # openssl rand -hex 32

# Authentication
BETTER_AUTH_URL=https://den-api-production.up.railway.app
DEN_BETTER_AUTH_TRUSTED_ORIGINS=https://admin.soapbox.build

# GitHub OAuth (from your GitHub OAuth app)
GITHUB_CLIENT_ID=<your-github-client-id>
GITHUB_CLIENT_SECRET=<your-github-client-secret>

# Optional: Stripe billing
STRIPE_SECRET_KEY=<your-stripe-secret-key>
STRIPE_WEBHOOK_SECRET=<your-stripe-webhook-secret>
STRIPE_INFERENCE_PRICE_ID=<your-stripe-price-id>

# Optional: Email (choose one)
RESEND_API_KEY=<your-resend-api-key>
# OR
SMTP_HOST=<smtp-host>
SMTP_PORT=587
SMTP_USER=<smtp-user>
SMTP_PASS=<smtp-password>
```

### 3.4 Configure Custom Domain (Optional)

1. Go to service Settings → Networking
2. Add custom domain: `den-api-production.your-domain.com`
3. Update `BETTER_AUTH_URL` to match

### 3.5 Deploy

Click "Deploy" - Railway will build and deploy the service.

## Step 4: Deploy den-web Service

### 4.1 Add Service from GitHub

1. Click "New" → "GitHub Repo"
2. Select the same OpenWork repository
3. Name the service `Admin` or `den-web`

### 4.2 Configure Build Settings

1. Go to service Settings
2. Set **Dockerfile Path**: `packaging/docker/Dockerfile.den-web`
3. Set **Root Directory**: (leave empty)

### 4.3 Configure Environment Variables

```bash
# API connection
NEXT_PUBLIC_DEN_API_URL=https://den-api-production.up.railway.app

# Optional: Analytics
NEXT_PUBLIC_POSTHOG_KEY=<posthog-key>
NEXT_PUBLIC_POSTHOG_API_KEY=<posthog-api-key>
```

### 4.4 Configure Custom Domain

1. Go to service Settings → Networking
2. Add custom domain: `admin.soapbox.build` (or your domain)
3. Update den-api's `DEN_BETTER_AUTH_TRUSTED_ORIGINS` to match

### 4.5 Deploy

Click "Deploy".

## Step 5: Set Up GitHub OAuth

### 5.1 Create GitHub OAuth App

1. Go to GitHub Settings → Developer settings → OAuth Apps
2. Click "New OAuth App"
3. Set **Authorization callback URL**: `https://den-api-production.up.railway.app/api/auth/callback/github`
4. Copy the **Client ID** and **Client Secret**

### 5.2 Update den-api Environment Variables

Add the GitHub credentials to den-api service:

```bash
GITHUB_CLIENT_ID=Ov23li...
GITHUB_CLIENT_SECRET=842780fe...
```

Redeploy den-api for changes to take effect.

## Step 6: Run Database Migrations

After first deployment, you need to run migrations:

### Option A: Using Railway CLI

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Link to your project
railway link

# Run migrations
railway run pnpm --filter @openwork-ee/den-db db:migrate
```

### Option B: Using Railway Shell

1. Go to den-api service
2. Click "Shell" tab
3. Run:
```bash
cd ee/packages/den-db
pnpm run db:migrate
```

## Step 7: Test the Deployment

### 7.1 Health Check

```bash
curl https://den-api-production.up.railway.app/health
# Expected: {"ok":true,"service":"den-api"}
```

### 7.2 Test GitHub Login

1. Go to `https://admin.soapbox.build` (your den-web URL)
2. Click "Sign in with GitHub"
3. Authorize the app
4. You should be redirected back and logged in

## Troubleshooting

### Database Connection Errors

**Error**: `transient mysql error on query`  
**Fix**: Make sure `DATABASE_URL` matches your database type (postgres:// or mysql://)

**Error**: `dial tcp: lookup postgres.railway.internal`  
**Fix**: Make sure den-api service has a reference to the database service in Railway

### GitHub OAuth Errors

**Error**: `redirect_uri_mismatch`  
**Fix**: Update GitHub OAuth app callback URL to match `BETTER_AUTH_URL`

**Error**: `unauthorized`  
**Fix**: Check that `DEN_BETTER_AUTH_TRUSTED_ORIGINS` includes your den-web URL

### Build Errors

**Error**: `Cannot find module`  
**Fix**: Make sure Dockerfile copies all required workspace packages

**Error**: `pnpm: command not found`  
**Fix**: Dockerfile should `RUN corepack enable` before using pnpm

## Database Support

OpenWork Den supports three database modes:

1. **MySQL** ⭐ (Recommended - Native)
   - Auto-detected from `DATABASE_URL=mysql://...`
   - Uses mysql2 driver
   - **All existing migrations are MySQL-formatted**
   - Best for production deployments on Railway

2. **PlanetScale** (Serverless MySQL)
   - Used when `DATABASE_HOST`, `DATABASE_USERNAME`, `DATABASE_PASSWORD` are set
   - Uses PlanetScale serverless driver
   - Good for serverless deployments
   - Compatible with MySQL migrations

3. **PostgreSQL** (Alternative)
   - Auto-detected from `DATABASE_URL=postgresql://...`
   - Uses native Postgres driver
   - **Requires schema push instead of migrations** (no migration files available)
   - Good if you prefer PostgreSQL ecosystem

The database type is auto-detected from the `DATABASE_URL` format.

### Migration vs Schema Push

- **MySQL/PlanetScale**: Use `pnpm run db:migrate` (recommended - migration history tracked)
- **PostgreSQL**: Use `pnpm run db:push` (pushes schema directly - no migration history)

## Environment Variables Reference

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | Database connection string | `postgresql://...` or `mysql://...` |
| `REDIS_URL` | Redis connection string | `redis://...` |
| `DEN_DB_ENCRYPTION_KEY` | Encryption key for sensitive data | Generate with `openssl rand -base64 128` |
| `BETTER_AUTH_SECRET` | Secret for session signing | Generate with `openssl rand -hex 32` |
| `BETTER_AUTH_URL` | Public URL of den-api | `https://den-api.your-domain.com` |
| `DEN_BETTER_AUTH_TRUSTED_ORIGINS` | Allowed origins for CORS | `https://admin.your-domain.com` |

### Optional

| Variable | Description |
|----------|-------------|
| `GITHUB_CLIENT_ID` | GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth app secret |
| `STRIPE_SECRET_KEY` | Stripe API key for billing |
| `RESEND_API_KEY` | Resend API key for email |
| `SMTP_HOST` | SMTP server for email |
| `PROVISIONER_MODE` | Workspace provisioner (`daytona`, `railway`, etc.) |

## Next Steps

1. **Set up worker provisioning**: Configure `PROVISIONER_MODE` and related credentials
2. **Configure billing**: Add Stripe credentials for metered billing
3. **Set up monitoring**: Add logging and error tracking
4. **Configure email**: Set up transactional emails for invites and notifications
5. **Test workspace creation**: Create a test workspace to verify provisioning

## Support

For issues or questions:
- GitHub Issues: https://github.com/different-ai/openwork/issues
- Documentation: https://github.com/different-ai/openwork
