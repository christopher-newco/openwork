# Update to Use Admin Portal Proxy

**Date**: 2026-06-05  
**Security Improvement**: Remove CORS, use server-side proxy

## The Change

Switch from direct browser→den-api requests (requires CORS) to browser→admin→den-api (no CORS needed).

### Current (CORS Required)
```
Browser → https://den-api-production-89bf.up.railway.app
         ↓
    CORS headers required
    Tokens in localStorage (XSS risk)
```

### After Update (Secure)
```
Browser → https://admin.soapbox.build/api/den → https://den-api-production-89bf.up.railway.app
         ↓                                       ↓
    Same-origin request                    Server-side request
    No CORS needed                         Can use HttpOnly cookies
```

## How to Update

### Option 1: Railway Dashboard (Recommended)

1. Go to https://railway.app/project/[your-project-id]
2. Click on the **app** service (d03ad034-a04d-4c69-8835-e45d9d42dd4f)
3. Go to **Variables** tab
4. Find `VITE_DEN_API_BASE_URL`
5. Change from: `https://den-api-production-89bf.up.railway.app`
6. Change to: `https://admin.soapbox.build/api/den`
7. Click **Save**
8. Wait for automatic redeploy (~2-3 minutes)

### Option 2: Railway CLI

```bash
railway link d03ad034-a04d-4c69-8835-e45d9d42dd4f
railway variables set VITE_DEN_API_BASE_URL="https://admin.soapbox.build/api/den"
```

## Verification

The proxy is already working:

```bash
$ curl https://admin.soapbox.build/api/den/v1/app-version
{"minAppVersion":"0.11.207","latestAppVersion":"0.0.0"}
```

After deploying the change:

1. Visit https://app.soapbox.build
2. Open browser DevTools → Network tab
3. Sign in
4. Check network requests - should go to `admin.soapbox.build/api/den/*` instead of `den-api-production-89bf.up.railway.app/*`

## What This Fixes

### Security ✅
- **No more CORS configuration needed**
- **Removes XSS token theft risk** (can migrate to HttpOnly cookies later)
- **Matches admin portal security model**

### Architecture ✅
- All API traffic routes through one secured gateway
- Consistent with Next.js best practices
- Admin portal's `upstream-proxy.ts` handles auth, fallbacks, redirects

### Operations ✅
- One less environment variable to manage (`CORS_ORIGINS`)
- Can remove CORS config from den-api service
- Easier to monitor (all traffic through admin portal)

## Files That Use den.ts

After this change, these files will automatically use the proxy:
- `predefined-worker-connect.tsx` - Worker token fetching
- `den-auth-provider.tsx` - Authentication
- `cloud-session-provider.tsx` - Session management
- `provider-auth/store.ts` - Provider connections
- All den-api calls throughout the app

## Optional: Remove CORS from den-api

Once the change is deployed and tested, you can remove the CORS environment variable from den-api:

```bash
railway variables delete CORS_ORIGINS --service 9992e96c-aa06-4ac0-bb35-a72ab9b1c8f9
```

The admin portal's proxy doesn't need CORS because it makes server-side requests.

## Admin Portal Proxy Code

The proxy that handles this is at `ee/apps/den-web/app/api/den/[...path]/route.ts`:

```typescript
export async function GET(request: NextRequest) {
  return proxyUpstream(request, segments, {
    routePrefix: "/api/den",
  });
}
```

It forwards all `/api/den/*` requests to den-api, adding proper headers, handling auth, and managing redirects.

## Rollback Plan

If anything goes wrong, revert the variable:

```bash
railway variables set VITE_DEN_API_BASE_URL="https://den-api-production-89bf.up.railway.app"
```

The app will go back to direct CORS mode.

## Related Documentation

- Admin portal proxy: `ee/apps/den-web/app/api/_lib/upstream-proxy.ts`
- Tenant app config: `apps/app/src/app/lib/den.ts`
- Environment setup: `WORKSPACE_AUTO_PROVISION_FIX.md`
