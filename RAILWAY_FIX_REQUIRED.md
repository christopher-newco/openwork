# Railway Services - Manual Fixes Required

## Summary

Most services are deployed and working. Two services need manual configuration via Railway UI:

---

## ✅ Working Services

| Service | Status | URL |
|---------|--------|-----|
| **MySQL** | Running | Internal only |
| **den-api** | ✅ Healthy | https://den-api-production-89bf.up.railway.app |
| **Admin** | ✅ Deployed | https://admin.soapbox.build |
| **den-worker-proxy** | ✅ Running | Internal |

**Verification:**
```bash
# den-api health check
curl https://den-api-production-89bf.up.railway.app/health
# Returns: {"ok":true,"service":"den-api"}

# Admin shows login UI with GitHub OAuth
# Visit: https://admin.soapbox.build
```

---

## ⚠️ App Service - Needs Redeploy

**Status:** 502 Error  
**Issue:** Railway using Nixpacks instead of Dockerfile  
**Fix:** Railway.json created (`apps/app/railway.json`) but not picked up yet

### Manual Fix Steps:

1. **In Railway UI**, go to App service → Settings → Build
2. Set **Builder** to: `DOCKERFILE`
3. Set **Dockerfile Path** to: `packaging/docker/Dockerfile.app`
4. Set **Watch Patterns** to: `apps/app/**,packages/**`
5. Click **Save** and **Redeploy**

**Alternative:** Delete and recreate the App service, Railway will auto-detect the railway.json

---

## ❌ Inference Service - Missing Env Vars

**Status:** Failed deployment  
**Issue:** Missing required environment variables

### Required Environment Variables:

Add these via **Railway UI** → inference service → Variables:

```bash
# Database connection (required)
DATABASE_URL=${{MySQL.MYSQL_URL}}

# Encryption key (required - copy from den-api)
DEN_DB_ENCRYPTION_KEY=<copy exact value from den-api service>

# Optional but recommended
CORS_ORIGINS=https://admin.soapbox.build,https://app.soapbox.build
PORT=8791
```

### Steps:

1. Go to **den-api service** → Variables
2. Copy the value of `DEN_DB_ENCRYPTION_KEY`
3. Go to **inference service** → Variables
4. Add:
   - `DATABASE_URL` = `${{MySQL.MYSQL_URL}}`
   - `DEN_DB_ENCRYPTION_KEY` = (paste value from step 2)
   - `CORS_ORIGINS` = `https://admin.soapbox.build,https://app.soapbox.build`
5. Click **Redeploy**

---

## Next Steps After Fixes

Once both services are fixed:

### 1. Test App Service
```bash
curl https://app.soapbox.build
# Should return HTML (Vite preview server)
```

### 2. Test Inference Service
```bash
curl https://<inference-url>/health
# Should return: {"ok":true,"service":"inference"}
```

### 3. Test GitHub OAuth Login

1. Go to https://admin.soapbox.build
2. Click "Continue with GitHub"
3. Authorize the OAuth app
4. Should redirect back and log you in

**OAuth Callback URL:** `https://den-api-production-89bf.up.railway.app/api/auth/callback/github`

---

## Files Created

- ✅ `apps/app/railway.json` - App service Railway config (committed)
- ✅ `ee/apps/inference/railway.json` - Inference service config (already existed)
- ✅ `packaging/docker/Dockerfile.app` - App Dockerfile (already existed)
- ✅ `packaging/docker/Dockerfile.inference` - Inference Dockerfile (already existed)

---

## Why Manual Fixes?

Railway GraphQL API token has limited permissions:
- ❌ Cannot update service variables (`variableUpsert` returns "Not Authorized")
- ❌ Cannot update build settings
- ✅ Can query service status
- ✅ Can restart deployments

These fixes require Railway UI access with full permissions.

---

**Last Updated:** June 5, 2026
