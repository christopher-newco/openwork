# Authentication Issues Fixed

**Date**: 2026-06-05

## Issues Found

### 1. ❌ Desktop Auth Flow in Web App (CRITICAL)

**Problem**: When clicking "Sign in with OpenWork Cloud" from the tenant web app:
1. Redirects to admin.soapbox.build ✅
2. User signs in successfully ✅  
3. Admin tries to redirect back using `openwork://` deep link ❌
4. This opens the desktop app instead of continuing in browser ❌

**Root Cause**: Missing `VITE_OPENWORK_DEPLOYMENT` environment variable caused the app to default to "desktop" mode.

```typescript
// openwork-deployment.ts
function normalizeDeployment(value: string | undefined): OpenWorkDeployment {
  const normalized = value?.trim().toLowerCase();
  return normalized === "web" ? "web" : "desktop";  // ⬅️ defaults to desktop!
}
```

**Fix**: 
- Set `VITE_OPENWORK_DEPLOYMENT=web` in Railway environment variables
- Added to Dockerfile.app build args (commit `e6992495`)
- Rebuild and redeploy

**After Fix**: OAuth sign-in will redirect back to `app.soapbox.build` instead of trying to open desktop app.

### 2. ❌ "Failed to fetch" on Manual Code Paste

**Problem**: When pasting the sign-in code manually:
```
pXRn5B2QiHMJ-apaNibx_qfbtLh-3onn
```
Error: `Failed to fetch`

**Root Cause**: CORS (Cross-Origin Resource Sharing) blocking.
- Tenant app runs on `app.soapbox.build`
- API runs on `den-api-production-89bf.up.railway.app`
- Browser blocks cross-origin POST requests without proper CORS headers

**Workaround**: Use the button-based OAuth flow instead of manual code paste.

**Permanent Fix Options**:
1. Add CORS headers to den-api for `app.soapbox.build` origin
2. Add API proxy in tenant app (like admin portal does)
3. Disable manual code paste UI in web deployments (desktop-only feature)

## Environment Variables Updated

### App Service (d03ad034-a04d-4c69-8835-e45d9d42dd4f)

Added:
```bash
VITE_OPENWORK_DEPLOYMENT=web
```

Complete list:
```bash
VITE_DEN_BASE_URL=https://admin.soapbox.build
VITE_DEN_API_BASE_URL=https://den-api-production-89bf.up.railway.app
VITE_DEN_REQUIRE_SIGNIN=true
VITE_PREDEFINED_WORKER_ID=wrk_01ktc2s5fmfer9zy3h2pr1nq6h
VITE_OPENWORK_DEPLOYMENT=web  # ⬅️ NEW
RAILWAY_DOCKERFILE_PATH=packaging/docker/Dockerfile.app
NIXPACKS_NO_MUSL=1
```

## Deployment

**Build ID**: `33cefa2d-a812-4e6b-9ba2-87b152bcef78`  
**Status**: Building (should complete in ~2-3 minutes)

## Testing After Deployment

1. Visit https://app.soapbox.build
2. Click "Sign in with OpenWork Cloud"
3. Redirects to https://admin.soapbox.build
4. Sign in with email/password or OAuth
5. **Should redirect back to app.soapbox.build** (not try to open desktop app)
6. Auto-connects to worker `wrk_01ktc2s5fmfer9zy3h2pr1nq6h`

## Branding (Cosmetic Issue)

The sign-in page still shows "OpenWork Cloud" branding. To customize:

1. Add environment variables:
```bash
VITE_DEN_BRAND_NAME="Soapbox Admin"
VITE_DEN_SIGNIN_BUTTON_TEXT="Sign in with Soapbox"
```

2. Update code to use these variables (currently hardcoded)

Not critical - centralized auth at admin.soapbox.build works fine.

## Files Modified

- `packaging/docker/Dockerfile.app` - Added `VITE_OPENWORK_DEPLOYMENT` build arg
- Environment variables via Railway CLI

## Related Documentation

- `DEPLOYMENT_COMPLETE.md` - Initial deployment summary
- `FINAL_DEPLOYMENT_SUMMARY.md` - All issues fixed during deployment
- `reference_openwork_tenant_deployment.md` - Memory file with credentials
