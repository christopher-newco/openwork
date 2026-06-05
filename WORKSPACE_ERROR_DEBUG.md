# Workspace Creation Error Debug

**Date**: 2026-06-05  
**Error**: "Failed to create workspace" with 500/409 API errors

## Symptoms

```
Error message: "Failed to create workspace. Please contact support."
API errors:
- api/den/v1/workers?limit=20 → 500 (Internal Server Error)
- api/den/v1/workers → 409 (Conflict)
```

## Possible Causes

### 1. Worker API 500 Error

**Cause**: `listWorkers()` API call failing server-side

**Check**:
```bash
# Test workers endpoint
curl -s 'https://admin.soapbox.build/api/den/v1/workers?limit=20' \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "x-openwork-legacy-org-id: YOUR_ORG_ID" | jq .
```

**Common reasons**:
- Database connection issue
- Missing org_id header
- Invalid auth token
- Database query error

### 2. Worker API 409 Conflict

**Cause**: Trying to create something that already exists

**Likely scenarios**:
- Workspace already exists for this user/worker
- Worker instance already registered
- Duplicate API call race condition

**Check database**:
```sql
-- Check if workspace exists
SELECT * FROM openwork_workspace 
WHERE owner_org_membership_id = '<your-member-id>';

-- Check worker status
SELECT * FROM worker 
WHERE id = 'wrk_01ktc2s5fmfer9zy3h2pr1nq6h';

-- Check worker instance
SELECT * FROM worker_instance 
WHERE worker_id = 'wrk_01ktc2s5fmfer9zy3h2pr1nq6h';
```

## Auto-Provision Flow Analysis

The auto-provision code in `session-route.tsx` (line 994):

```typescript
// Auto-provision workspace for predefined worker (web deployment)
if (!isDesktopRuntime() && list.items.length === 0) {
  try {
    const predefinedWorkerJson = localStorage.getItem("openwork.predefinedWorker");
    if (predefinedWorkerJson) {
      const predefinedWorker = JSON.parse(predefinedWorkerJson);
      if (predefinedWorker.openworkUrl && predefinedWorker.accessToken) {
        // Create remote workspace
        const provisionedList = await openworkClient.createRemoteWorkspace({
          baseUrl: predefinedWorker.openworkUrl,
          openworkHostUrl: predefinedWorker.openworkUrl,
          openworkToken: predefinedWorker.accessToken,
          displayName: predefinedWorker.workerName || "Workspace",
          directory: null,
          remoteType: "openwork",
        });
        localStorage.removeItem("openwork.predefinedWorker");
        if (provisionedList?.workspaces) {
          list = await openworkClient.listWorkspaces();
        }
      }
    }
  } catch (error) {
    console.error("[session-route] Failed to auto-provision", error);
  }
}
```

### Potential Issues

1. **localStorage check happens AFTER listWorkers fails**
   - If listWorkers returns 500, we never get to auto-provision
   - Need to handle 500 error gracefully

2. **Workspace might already exist**
   - Code only runs if `list.items.length === 0`
   - If workspace exists but listWorkers fails, we're stuck

3. **createRemoteWorkspace might be causing 409**
   - If workspace already exists for this worker
   - If called multiple times (race condition)

## Diagnostic Steps

### Step 1: Check Authentication

Open browser DevTools → Application → localStorage:
```
openwork.den.authToken = ?
openwork.den.activeOrgId = ?
```

### Step 2: Test Workers API

In browser console:
```javascript
// Get current settings
const token = localStorage.getItem('openwork.den.authToken');
const orgId = localStorage.getItem('openwork.den.activeOrgId');

// Test workers endpoint
fetch('https://admin.soapbox.build/api/den/v1/workers?limit=20', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'x-openwork-legacy-org-id': orgId
  }
}).then(r => r.json()).then(console.log);
```

### Step 3: Check localStorage

```javascript
// Check if predefinedWorker exists
console.log('Predefined worker:', localStorage.getItem('openwork.predefinedWorker'));

// Check all openwork keys
Object.keys(localStorage)
  .filter(k => k.startsWith('openwork'))
  .forEach(k => console.log(k, localStorage.getItem(k)));
```

### Step 4: Check Network Tab

1. Open DevTools → Network tab
2. Clear console
3. Refresh page
4. Look for `/api/den/v1/workers` requests
5. Click on failed request
6. Check:
   - Request headers (Authorization, x-openwork-legacy-org-id)
   - Response body (exact error message)
   - Status code details

## Likely Fixes

### Fix 1: Handle 500 Error Gracefully

```typescript
// In session-route.tsx, wrap listWorkers in try/catch
try {
  list = await openworkClient.listWorkspaces();
} catch (error) {
  console.error("[session-route] listWorkspaces failed", error);
  // Check for predefined worker anyway
  const predefinedWorkerJson = localStorage.getItem("openwork.predefinedWorker");
  if (predefinedWorkerJson && !isDesktopRuntime()) {
    // Try to auto-provision even if list failed
    // ...
  }
  throw error; // Re-throw to show error to user
}
```

### Fix 2: Check if Workspace Already Exists

```typescript
// Before creating workspace, check if it exists
const existingWorkspace = list.items.find(
  w => w.openworkHostUrl === predefinedWorker.openworkUrl
);

if (existingWorkspace) {
  // Workspace already exists, just use it
  console.log("[session-route] Workspace already exists", existingWorkspace.id);
  localStorage.removeItem("openwork.predefinedWorker");
} else {
  // Create new workspace
  await openworkClient.createRemoteWorkspace(...)
}
```

### Fix 3: Add Idempotency

```typescript
// Use worker ID as idempotency key
const workspaceId = `ws_${predefinedWorker.workerId}`;
try {
  await openworkClient.createRemoteWorkspace({
    ...payload,
    id: workspaceId // Idempotent creation
  });
} catch (error) {
  if (error.status === 409) {
    // Workspace already exists, that's fine
    console.log("[session-route] Workspace already exists (409)");
  } else {
    throw error;
  }
}
```

## Immediate Workarounds

### Workaround 1: Clear localStorage

```javascript
// In browser console
localStorage.removeItem('openwork.predefinedWorker');
location.reload();
```

### Workaround 2: Manual Workspace Creation

1. Sign in to admin.soapbox.build
2. Go to Workers section
3. Manually create workspace for worker `wrk_01ktc2s5fmfer9zy3h2pr1nq6h`
4. Go back to app.soapbox.build
5. Should connect to existing workspace

### Workaround 3: Delete Existing Workspace

If workspace exists but is broken:

```sql
-- Find workspace
SELECT * FROM openwork_workspace 
WHERE worker_id = 'wrk_01ktc2s5fmfer9zy3h2pr1nq6h';

-- Delete it (if safe)
DELETE FROM openwork_workspace 
WHERE id = '<workspace-id>';
```

## Next Steps

1. **Get exact error details** from browser DevTools
2. **Check database state** to see if workspace/worker exists
3. **Test API endpoints** directly with curl
4. **Apply appropriate fix** based on root cause

## Testing After Fix

```bash
# 1. Clear browser data
# DevTools → Application → Clear storage

# 2. Test sign-in flow
# Visit https://app.soapbox.build
# Sign in
# Should auto-connect without errors

# 3. Verify workspace created
# Check database for new workspace entry
# Check that localStorage.predefinedWorker is cleared
# Check that workspace is active
```

## Related Files

- Auto-provision code: `apps/app/src/react-app/shell/session-route.tsx:994`
- Predefined worker connect: `apps/app/src/react-app/domains/cloud/predefined-worker-connect.tsx`
- OpenWork server client: `apps/app/src/app/lib/openwork-server.ts`
- Den client: `apps/app/src/app/lib/den.ts`

## Environment Check

Verify Railway app service has:
```bash
VITE_DEN_BASE_URL=https://admin.soapbox.build
VITE_DEN_API_BASE_URL=https://admin.soapbox.build/api/den  # Via proxy!
VITE_DEN_REQUIRE_SIGNIN=true
VITE_PREDEFINED_WORKER_ID=wrk_01ktc2s5fmfer9zy3h2pr1nq6h
VITE_OPENWORK_DEPLOYMENT=web
```

Check deployment:
```bash
# Get app bundle and check for embedded vars
curl -s https://app.soapbox.build/assets/index-*.js | grep "wrk_01ktc2s5fmfer9zy3h2pr1nq6h"
# Should find the worker ID embedded in the bundle
```
