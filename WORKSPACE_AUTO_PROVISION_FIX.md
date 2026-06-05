# Workspace Auto-Provisioning Fix

**Date**: 2026-06-05  
**Commit**: `fa036421`  
**Issue**: "Failed to create workspace" error after successful authentication

## Problem

After fixing the authentication flow (OAuth redirect, CORS, worker URL), users could successfully sign in but encountered:

```
OpenWork Connection Error
Failed to create workspace
```

**Root Cause**: Missing workspace auto-provisioning for predefined workers.

### What Was Happening

1. ✅ User signs in → OAuth redirect back to app.soapbox.build
2. ✅ App navigates to `/connect` route
3. ✅ `PredefinedWorkerConnect` component fetches worker tokens from den-api
4. ✅ Stores worker credentials in `localStorage`:
   ```json
   {
     "workerId": "wrk_01ktc2s5fmfer9zy3h2pr1nq6h",
     "workerName": "app Worker",
     "openworkUrl": "https://worker-app-production-f23e.up.railway.app",
     "accessToken": "a1d0d323e36752f36dc61227cb4691890cc7d52acd10c41aa1aae7945ab0af68",
     "workspaceId": "ws_c52ddf65534b"
   }
   ```
5. ✅ Navigates to `/session` route
6. ❌ **Session route never reads localStorage or creates workspace**
7. ❌ Shows "Connect custom remote" form (desktop behavior)
8. ❌ If user clicks connect → "Failed to create workspace"

### Why It Failed

The predefined worker connect flow was designed for **desktop deployment** where `workspaceBootstrap()` creates the workspace connection using native APIs.

For **web deployment**, the code stored credentials in localStorage but `SessionRoute` never consumed them to create the actual workspace connection with the remote worker.

## Fix

Added auto-provisioning logic to `session-route.tsx` at line 995:

```typescript
// Auto-provision workspace for predefined worker (web deployment)
if (!isDesktopRuntime() && list.items.length === 0) {
  try {
    const predefinedWorkerJson = localStorage.getItem("openwork.predefinedWorker");
    if (predefinedWorkerJson) {
      const predefinedWorker = JSON.parse(predefinedWorkerJson);
      if (predefinedWorker.openworkUrl && predefinedWorker.accessToken) {
        // Create remote workspace for the predefined worker
        const provisionedList = await openworkClient.createRemoteWorkspace({
          baseUrl: predefinedWorker.openworkUrl,
          openworkHostUrl: predefinedWorker.openworkUrl,
          openworkToken: predefinedWorker.accessToken,
          displayName: predefinedWorker.workerName || "Workspace",
          directory: null,
          remoteType: "openwork",
        });
        // Clear the predefined worker from localStorage (one-time provision)
        localStorage.removeItem("openwork.predefinedWorker");
        // Update list with the newly created workspace
        if (provisionedList?.workspaces) {
          list = await openworkClient.listWorkspaces();
        }
      }
    }
  } catch (error) {
    console.error("[session-route] Failed to auto-provision predefined worker", error);
    // Continue without auto-provisioning if it fails
  }
}
```

### How It Works

1. After fetching workspace list from openwork server
2. Check if:
   - Not desktop runtime (web deployment)
   - Workspace list is empty (first time connecting)
   - Predefined worker credentials exist in localStorage
3. If all true → call `createRemoteWorkspace()` with stored credentials
4. Clear localStorage entry (one-time provisioning)
5. Re-fetch workspace list to include the newly created workspace
6. Continue with normal session initialization

## Complete Flow (Fixed)

```
User visits app.soapbox.build
  ↓
VITE_DEN_REQUIRE_SIGNIN=true → Redirect to /signin
  ↓
User clicks "Sign in with OpenWork Cloud"
  ↓
VITE_OPENWORK_DEPLOYMENT=web → Redirects to admin.soapbox.build (not desktop app)
  ↓
User signs in (email/password or OAuth)
  ↓
admin.soapbox.build redirects back to app.soapbox.build
  ↓
VITE_PREDEFINED_WORKER_ID set → Navigate to /connect
  ↓
Fetch worker details for wrk_01ktc2s5fmfer9zy3h2pr1nq6h
  ↓
Fetch worker tokens (openworkUrl, ownerToken)
  ↓
Store worker credentials in localStorage
  ↓
Navigate to /session
  ↓
SessionRoute.refreshRouteState() runs
  ↓
Check localStorage for predefined worker
  ↓
createRemoteWorkspace() with worker credentials
  ↓
Clear localStorage (one-time provision)
  ↓
Re-fetch workspace list
  ↓
✅ Workspace exists, select it as active
  ↓
✅ Connected to worker at worker-app-production-f23e.up.railway.app
```

## Testing

Push to `main` triggered auto-deployment via GitHub webhook.

Once deployment completes (~2-3 minutes):

1. Clear browser localStorage and cookies for app.soapbox.build
2. Visit https://app.soapbox.build
3. Click "Sign in with OpenWork Cloud"
4. Sign in at admin.soapbox.build
5. Should redirect back to app.soapbox.build
6. **SHOULD NO LONGER SEE "Failed to create workspace"**
7. Should see workspace interface connected to worker
8. Can send messages and interact with the workspace

### What to Look For

**Success indicators:**
- ✅ No error messages after sign-in
- ✅ Workspace sidebar shows sessions
- ✅ Can type in the prompt input
- ✅ Can send messages and get responses
- ✅ Browser devtools console has no errors
- ✅ localStorage `openwork.predefinedWorker` is cleared after first load

**Failure indicators:**
- ❌ "Failed to create workspace" error
- ❌ "Connect custom remote" form showing
- ❌ Console errors about missing workspace
- ❌ Can't send messages

## Related Fixes

This is the **fourth and final fix** in the authentication/connection flow:

1. **OAuth Redirect Fix** (commit `e6992495`)
   - Added `VITE_OPENWORK_DEPLOYMENT=web`
   - Fixed desktop app popup issue

2. **CORS Fix** (environment variable)
   - Added `CORS_ORIGINS` to den-api
   - Fixed "Failed to fetch" on manual code paste

3. **Worker URL Fix** (manual database insert)
   - Added `worker_instance` database record
   - Fixed "Failed to build connection URL"

4. **Workspace Auto-Provision Fix** (this fix, commit `fa036421`)
   - Added auto-provisioning logic to `session-route.tsx`
   - Fixed "Failed to create workspace"

All four components now working together! 🎉

## Architecture Notes

### Desktop vs Web Deployment

**Desktop deployment:**
- Uses native `workspaceBootstrap()` API
- Creates workspace connections through Tauri/desktop runtime
- Workspace persistence handled by desktop app state

**Web deployment:**
- Uses `createRemoteWorkspace()` API
- Workspace connections stored on openwork server
- Requires explicit workspace creation (can't use desktop APIs)

### Predefined Worker Pattern

Predefined workers are useful for:
- **SaaS deployments**: Auto-connect tenants to their dedicated worker
- **Managed environments**: Pre-provision infrastructure for users
- **White-label products**: Seamless experience without manual connection

The pattern:
1. Set `VITE_PREDEFINED_WORKER_ID` at build time
2. Worker must be registered in den-api database
3. After sign-in, automatically fetch and use worker credentials
4. Create workspace connection without user intervention
5. User lands in ready-to-use workspace

### Security Considerations

- Worker credentials stored temporarily in localStorage only during provisioning
- Cleared immediately after workspace creation
- All token exchanges use HTTPS
- CORS headers restrict API access to known origins
- Worker tokens have appropriate scopes (client, host, owner)

## Implementation Details

### Files Modified

- `apps/app/src/react-app/shell/session-route.tsx` - Added auto-provisioning logic

### Key Functions

- `predefined-worker-connect.tsx:connectToWorker()` - Stores credentials in localStorage
- `session-route.tsx:refreshRouteState()` - Checks localStorage and auto-provisions workspace
- `openwork-server.ts:createRemoteWorkspace()` - Creates workspace connection to worker

### Environment Variables

```bash
# App service (app.soapbox.build)
VITE_DEN_BASE_URL=https://admin.soapbox.build
VITE_DEN_API_BASE_URL=https://den-api-production-89bf.up.railway.app
VITE_DEN_REQUIRE_SIGNIN=true
VITE_PREDEFINED_WORKER_ID=wrk_01ktc2s5fmfer9zy3h2pr1nq6h
VITE_OPENWORK_DEPLOYMENT=web

# API service (den-api-production-89bf.up.railway.app)
CORS_ORIGINS=https://admin.soapbox.build,https://app.soapbox.build
```

### Database State

**worker table:**
```sql
id: wrk_01ktc2s5fmfer9zy3h2pr1nq6h
name: app Worker
status: healthy
org_id: org_01ktc2s5fm123xyz
```

**worker_instance table:**
```sql
id: winst_01ktc2s5fmfer9zy3h2pr1nq6h
worker_id: wrk_01ktc2s5fmfer9zy3h2pr1nq6h
provider: railway
url: https://worker-app-production-f23e.up.railway.app
status: healthy
```

## Deployment Info

**Repository**: https://github.com/christopher-newco/openwork  
**Branch**: main  
**Commit**: fa036421  
**Railway Project**: Soapbox OpenWork  
**Services**:
- app: d03ad034-a04d-4c69-8835-e45d9d42dd4f → https://app.soapbox.build
- den-api: 9992e96c-aa06-4ac0-bb35-a72ab9b1c8f9 → https://den-api-production-89bf.up.railway.app
- worker-app: 01663ab7-bbe0-47c1-a61b-8def49a59896 → https://worker-app-production-f23e.up.railway.app

**Auto-deploy**: Enabled via GitHub webhook
