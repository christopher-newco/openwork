# Worker Connection URL Fix

**Date**: 2026-06-05  
**Error**: "Connection Error: Failed to build connection URL"

## Problem

After successfully signing in, the app showed:
```
OpenWork
Connection Error
Failed to build connection URL
```

**Root Cause**: Missing `worker_instance` database record.

The worker was registered in the `worker` table but had no corresponding `worker_instance` record with the connection URL. The den-api returns worker credentials including the `openworkUrl` from the `worker_instance` table.

## Database State

### Before Fix

**worker table** (existed):
```sql
id: wrk_01ktc2s5fmfer9zy3h2pr1nq6h
name: app Worker
status: healthy
```

**worker_instance table** (missing):
```
(no record found)
```

### After Fix

**worker_instance table** (created):
```sql
id: winst_01ktc2s5fmfer9zy3h2pr1nq6h
worker_id: wrk_01ktc2s5fmfer9zy3h2pr1nq6h
provider: railway
url: https://worker-app-production-f23e.up.railway.app
status: healthy
```

## Fix Applied

```sql
INSERT INTO worker_instance (
  id, 
  worker_id, 
  provider, 
  url, 
  status, 
  created_at, 
  updated_at
) VALUES (
  'winst_01ktc2s5fmfer9zy3h2pr1nq6h',
  'wrk_01ktc2s5fmfer9zy3h2pr1nq6h',
  'railway',
  'https://worker-app-production-f23e.up.railway.app',
  'healthy',
  NOW(),
  NOW()
);
```

## Why This Happened

When we initially registered the worker, we created the `worker` record but forgot to create the `worker_instance` record. The worker registration process should create both:

1. **worker** - metadata about the worker (name, org, status)
2. **worker_instance** - connection details (URL, provider, region)

## Code Flow

The auto-connect flow in `predefined-worker-connect.tsx`:

```typescript
// 1. Fetch worker details from den-api
const workerList = await denClient.listWorkers(orgId);
const worker = workerList.find(w => w.workerId === PREDEFINED_WORKER_ID);

// 2. Get worker connection tokens (includes openworkUrl from worker_instance)
const tokens = await denClient.getWorkerTokens(PREDEFINED_WORKER_ID, orgId);

// 3. Check if tokens have required fields
if (!tokens?.openworkUrl || !tokens?.ownerToken) {
  setError("Worker credentials are incomplete");  // ← This was failing
  return;
}

// 4. Connect to worker
localStorage.setItem("openwork.predefinedWorker", JSON.stringify({
  openworkUrl: tokens.openworkUrl,  // ← Now populated from worker_instance.url
  accessToken: tokens.ownerToken,
  ...
}));
```

## Testing

Now when you sign in to https://app.soapbox.build:

1. ✅ Sign in with email/password or OAuth
2. ✅ Auto-connect to worker (no more "Connection Error")
3. ✅ Opens workspace connected to https://worker-app-production-f23e.up.railway.app

## Complete Authentication & Connection Flow

```
User visits app.soapbox.build
  ↓
VITE_DEN_REQUIRE_SIGNIN=true → Redirect to /signin
  ↓
User clicks "Sign in with OpenWork Cloud"
  ↓
VITE_OPENWORK_DEPLOYMENT=web → Redirects to admin.soapbox.build
  ↓
User signs in (email/password or OAuth)
  ↓
admin.soapbox.build redirects back to app.soapbox.build
  ↓
VITE_PREDEFINED_WORKER_ID set → Navigate to /connect
  ↓
Fetch worker details for wrk_01ktc2s5fmfer9zy3h2pr1nq6h
  ↓
Fetch worker tokens (openworkUrl from worker_instance.url)
  ↓
Store worker connection info in localStorage
  ↓
Navigate to /session
  ↓
✅ Connected to worker at worker-app-production-f23e.up.railway.app
```

## Related Fixes

This is the third fix in the authentication/connection flow:

1. **OAuth Redirect Fix** (commit `e6992495`)
   - Added `VITE_OPENWORK_DEPLOYMENT=web`
   - Fixed desktop app popup issue

2. **CORS Fix** (environment variable)
   - Added `CORS_ORIGINS` to den-api
   - Fixed "Failed to fetch" on manual code paste

3. **Worker URL Fix** (this fix)
   - Added `worker_instance` database record
   - Fixed "Failed to build connection URL"

All three components now working together! 🎉
