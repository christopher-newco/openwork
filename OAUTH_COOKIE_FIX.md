# OAuth Cookie Fix - Session Not Persisting

## Problem

GitHub OAuth completes successfully but doesn't create a session. The HAR file shows:

1. ✅ GitHub authorization succeeds
2. ✅ Callback returns 302 redirect
3. ❌ **No session cookie is set** (cookie is on wrong domain)
4. ❌ `/api/den/v1/me` returns 401 Unauthorized

## Root Cause

The OAuth callback URL is configured to go **directly to the API**, bypassing the frontend proxy:

**Current (broken):**
```
https://den-api-production-89bf.up.railway.app/api/auth/callback/github
```

**Should be:**
```
https://admin.soapbox.build/api/auth/callback/github
```

When the callback goes directly to the API domain, the session cookie is set for `den-api-production-89bf.up.railway.app`. The browser won't send this cookie to `admin.soapbox.build` (different domain).

## Architecture

The den-web Next.js app has a built-in auth proxy at `/api/auth/[...path]` that:
- Proxies all auth requests to the upstream API
- **Copies Set-Cookie headers** from upstream to client
- Rewrites redirect URLs to the frontend domain

This allows cross-domain auth to work correctly!

## Fix

### 1. Update Railway Environment Variables (den-web)

Set the following on the **den-web** (admin UI) service:

```bash
DEN_API_BASE=https://den-api-production-89bf.up.railway.app
DEN_AUTH_ORIGIN=https://admin.soapbox.build
```

### 2. Update Railway Environment Variables (den-api)

Update on the **den-api** service:

```bash
BETTER_AUTH_URL=https://admin.soapbox.build
# ^^ Changed from den-api URL to frontend URL!

DEN_BETTER_AUTH_TRUSTED_ORIGINS=https://admin.soapbox.build
# ^^ Keep this the same
```

### 3. Update GitHub OAuth App

Go to GitHub OAuth App settings and update the callback URL:

**From:**
```
https://den-api-production-89bf.up.railway.app/api/auth/callback/github
```

**To:**
```
https://admin.soapbox.build/api/auth/callback/github
```

**App URL:** https://github.com/settings/applications/2598931

## How It Works After Fix

**Correct flow:**

1. User clicks "Sign in with GitHub" on `admin.soapbox.build`
2. Redirects to GitHub with callback = `admin.soapbox.build/api/auth/callback/github`
3. GitHub redirects to `admin.soapbox.build/api/auth/callback/github`
4. Next.js proxy route catches the request
5. Proxy forwards to `den-api-production-89bf.up.railway.app/api/auth/callback/github`
6. API creates session and returns Set-Cookie header
7. **Proxy copies the cookie to the response** ✅
8. Browser receives cookie on `admin.soapbox.build` domain
9. All subsequent requests include the cookie
10. User is authenticated!

## Why This Approach?

### Option 1: Same-Domain (not using)
```
api.soapbox.build
admin.soapbox.build
```
Both share `.soapbox.build` cookie domain. Requires custom domains on Railway.

### Option 2: Proxy (current approach) ✅
```
admin.soapbox.build/api/auth/* → proxies to → den-api.railway.app
```
No custom domains needed, cookies work via proxy.

## Deploy the Fix

1. **Update den-api environment variables**
   - Go to Railway → den-api service → Variables
   - Change `BETTER_AUTH_URL` to `https://admin.soapbox.build`
   - Redeploy den-api

2. **Update den-web environment variables**
   - Go to Railway → den-web service → Variables
   - Add `DEN_API_BASE=https://den-api-production-89bf.up.railway.app`
   - Add `DEN_AUTH_ORIGIN=https://admin.soapbox.build`
   - Redeploy den-web

3. **Update GitHub OAuth App**
   - Go to https://github.com/settings/applications/2598931
   - Change callback URL to `https://admin.soapbox.build/api/auth/callback/github`
   - Save

## Testing

After deployment:

1. Go to https://admin.soapbox.build
2. Click "Continue with GitHub"
3. Authorize the app
4. **Should redirect back and be logged in** ✅
5. Check browser cookies - should see session cookie on `admin.soapbox.build`

## Verification

Check that the frontend is using the proxy:

```bash
# Check frontend .env.local or Railway variables
DEN_API_BASE=https://den-api-production-89bf.up.railway.app
```

Test the proxy:
```bash
curl -I https://admin.soapbox.build/api/auth/session
# Should proxy to API and return headers
```

---

**Last Updated:** June 5, 2026  
**Issue:** OAuth callback bypassing frontend proxy  
**Solution:** Configure BETTER_AUTH_URL to point to frontend domain
