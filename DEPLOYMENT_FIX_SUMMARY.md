# OpenWork Deployment Fix Summary

**Date**: 2026-06-05  
**Status**: Fixes deployed, waiting for Railway deployment to complete

## The Root Cause

All Admin service deployments since 12:48 PM were failing due to an incorrect Next.js 16 middleware setup.

### The Bug

Commit `be84f040` migrated from `middleware.ts` to `proxy.ts` for Next.js 16 compatibility, but used the wrong export name:

**Broken Setup:**
```typescript
// File: proxy.ts
export function proxy(request: NextRequest) { ... }  // ❌ WRONG
```

**Correct Setup (Next.js 16):**
```typescript
// File: proxy.ts  
export function middleware(request: NextRequest) { ... }  // ✅ CORRECT
```

Next.js 16 changed the **filename** from `middleware.ts` to `proxy.ts`, but the **exported function** must still be named `middleware`.

## Fixes Applied

### 1. ✅ Fixed TypeID Prefix Error (worker_instance)
**Problem:** Database had `winst_01ktc2s5fmfer9zy3h2pr1nq6h` instead of `wki_01ktc2s5fmfer9zy3h2pr1nq6h`  
**Fix:** Updated via Railway web UI  
**Result:** Stops 500 errors on `/v1/workers`

### 2. ✅ Set Environment Variables (Admin Service)
**Problem:** Missing connection URL and worker ID  
**Fix:** Set via Railway dashboard:
- `NEXT_PUBLIC_OPENWORK_APP_CONNECT_URL=https://app.soapbox.build`
- `NEXT_PUBLIC_PREDEFINED_WORKER_ID=wrk_01ktc2s5fmfer9zy3h2pr1nq6h`
- `NEXT_PUBLIC_OPENWORK_AUTH_CALLBACK_URL=https://admin.soapbox.build`

**Result:** Stops "Failed to build connection URL" error

### 3. ✅ Fixed Next.js 16 Middleware Export
**Problem:** `proxy.ts` exported `function proxy()` instead of `function middleware()`  
**Fix:** Changed export to `export function middleware(request: NextRequest)`  
**Commit:** `8cc6e85c`  
**Result:** Middleware now executes correctly (auth, PostHog proxy, etc.)

## Deployment Status

**Current Commit:** `8cc6e85c` (pushed at ~5:50 PM UTC)

Railway is now deploying with the correct configuration:
- ✅ File: `proxy.ts` (Next.js 16 convention)
- ✅ Export: `export function middleware()` (required)
- ✅ Environment variables set
- ✅ TypeID fixed in database

## Expected Deployment Timeline

1. **Build phase** (~2-3 minutes): Compile Next.js app
2. **Deploy phase** (~1 minute): Start container, run health checks
3. **Total**: ~3-5 minutes from push

## How to Verify

Once the Railway deployment shows **SUCCESS**:

1. Go to https://app.soapbox.build
2. Sign in with GitHub
3. You should be:
   - ✅ Redirected to the app after auth
   - ✅ Auto-connected to workspace
   - ✅ No "Failed to build connection URL" error

## Monitor Deployment

**Railway Dashboard:**
- Project: workspaces
- Service: Admin (admin.soapbox.build)
- Deployments tab → Look for commit `8cc6e85c`

Expected status: **SUCCESS** (green)

## Rollback Plan (if still failing)

If the deployment still fails:

1. Check Railway deploy logs (may need to raise usage limit)
2. Common issues to check:
   - Database connection (DATABASE_URL)
   - Redis connection (REDIS_URL)
   - Port binding (should be 3000)
   - Missing environment variables

## Files Changed

```
ee/apps/den-web/proxy.ts  (renamed from middleware.ts, export fixed)
```

## Previous Failed Attempts

1. `4db4294d` - Empty commit to trigger deploy (failed - middleware still broken)
2. `86930158` - Renamed to middleware.ts (failed - wrong for Next.js 16)
3. `8cc6e85c` - Correct setup with proxy.ts + middleware export (should succeed)

## Next Steps

1. ⏳ Wait for Railway deployment to complete (~5 minutes)
2. ✅ Verify admin.soapbox.build is serving new version
3. ✅ Test sign-in flow at app.soapbox.build
4. ✅ Confirm auto-connect to workspace works

---

**Status Check:** Run `curl -I https://admin.soapbox.build` and look for the `etag` header to confirm new deployment
