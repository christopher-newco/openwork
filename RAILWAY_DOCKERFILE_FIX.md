# Railway Dockerfile Configuration Fix

## What Happened

When you switched all services from `dev` to `main` branch, Railway auto-detected the build method and **switched from Dockerfile to Nixpacks** for all services.

Nixpacks runs `npx serve` instead of your proper Docker builds → Everything breaks.

## The Fix (CRITICAL)

**You MUST manually configure each service in Railway UI to use Dockerfile builder:**

### For EACH service (den-api, Admin, App, inference):

1. Go to Railway Dashboard → **[Service Name]**
2. Click **Settings** → **Build**
3. **Builder**: Change from `NIXPACKS` to `DOCKERFILE`
4. **Dockerfile Path**: Set to the correct path (see table below)
5. **Root Directory**: Leave blank or set to `/`
6. **Branch**: Confirm it's set to `main`
7. Click **Deploy**

### Dockerfile Paths

| Service | Dockerfile Path |
|---------|----------------|
| **den-api** | `packaging/docker/Dockerfile.den-api` |
| **Admin** (den-web) | `packaging/docker/Dockerfile.den-web` |
| **App** | `packaging/docker/Dockerfile.app` |
| **inference** | `packaging/docker/Dockerfile.inference` |
| **den-worker-proxy** | `packaging/docker/Dockerfile.den-worker-proxy` |

## Why Railway Ignored railway.json

Each service has a `railway.json` that specifies `"builder": "DOCKERFILE"`, but:

- Railway UI settings **override** railway.json
- When you switched branches, Railway re-detected and chose Nixpacks
- You have to manually force Dockerfile in the UI

## What's Fixed on main Branch

✅ Better Auth upgraded to v1.6.14 (latest stable)
✅ OAuth fix applied (`skipStateCookieCheck: true`)
✅ All Dockerfiles are correct
✅ Environment variables are configured

## After Configuring Dockerfile Builder

All services should build and deploy successfully:

- **den-api**: OAuth login will work
- **Admin**: Next.js app serves correctly  
- **App**: Vite preview server binds to 0.0.0.0
- **inference**: TypeScript builds without errors

---

**Last Updated:** June 5, 2026  
**Commit:** e7911233 (Better Auth v1.6.14 upgrade)
