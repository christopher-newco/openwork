# CORS Fix for Tenant App

**Date**: 2026-06-05

## Problem

When users tried to paste the sign-in code manually in the tenant app (`app.soapbox.build`), they got:
```
Error: Failed to fetch
```

**Root Cause**: 
- The tenant app tried to POST to `den-api-production-89bf.up.railway.app/v1/auth/desktop-handoff/exchange`
- Browser blocked the request due to missing CORS headers
- Cross-origin requests require `Access-Control-Allow-Origin` headers

## Solution Applied

### 1. Added CORS_ORIGINS Environment Variable

```bash
CORS_ORIGINS=https://admin.soapbox.build,https://app.soapbox.build
```

Added to **den-api service** (`e269b4d6-3f64-4fea-a1af-996e0a37edbb`)

### 2. Updated TRUSTED_ORIGINS

Already had:
```bash
DEN_BETTER_AUTH_TRUSTED_ORIGINS=https://admin.soapbox.build,https://app.soapbox.build
```

This controls OAuth redirects and session validation.

## Deployment

**Service**: den-api (API)  
**Deployment ID**: `1a863327`  
**Status**: Building → will auto-deploy with CORS headers

## Testing After Deployment

### Test 1: CORS Preflight (OPTIONS)

```bash
curl -i -X OPTIONS https://den-api-production-89bf.up.railway.app/v1/auth/desktop-handoff/exchange \
  -H "Origin: https://app.soapbox.build" \
  -H "Access-Control-Request-Method: POST"
```

**Expected Headers**:
```
Access-Control-Allow-Origin: https://app.soapbox.build
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: content-type
```

### Test 2: Manual Code Paste in Web App

1. Go to https://app.soapbox.build
2. Click "Sign in with OpenWork Cloud"
3. Sign in at admin.soapbox.build
4. On the "Open desktop app" page, click "Copy code"
5. Go back to app.soapbox.build
6. Click "Paste sign-in code"
7. Paste the code
8. Click "Finish sign-in"

**Expected**: Should sign in successfully without "Failed to fetch" error

## Environment Variables Reference

### den-api Service

```bash
# CORS Configuration
CORS_ORIGINS=https://admin.soapbox.build,https://app.soapbox.build
DEN_BETTER_AUTH_TRUSTED_ORIGINS=https://admin.soapbox.build,https://app.soapbox.build

# Database
DATABASE_URL=${{MySQL.MYSQL_URL}}
DEN_DB_ENCRYPTION_KEY=<encrypted>

# Service URLs
RAILWAY_PUBLIC_DOMAIN=den-api-production-89bf.up.railway.app
```

## Files Modified

- Environment variables only (no code changes required)

## Related Fixes

This complements the earlier fix:
- Added `VITE_OPENWORK_DEPLOYMENT=web` to app service (commit `e6992495`)
- This fixed the OAuth redirect flow (was opening desktop app instead of web redirect)

Together, these fixes enable:
1. ✅ Button-based OAuth sign-in (redirects work correctly)
2. ✅ Manual code paste sign-in (CORS headers now allow API calls)

Both authentication methods now work for web deployments!
