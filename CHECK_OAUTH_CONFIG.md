# GitHub OAuth Configuration Checklist

## Problem
Still getting `state_mismatch` error after deploying `skipStateCookieCheck: true` fix.

## Required Configuration

### 1. GitHub OAuth App Settings

Go to: https://github.com/settings/developers

Find your OAuth App with Client ID: `Ov23liE1PHGsaX5glwDx`

**Required values:**

| Field | Value |
|-------|-------|
| **Application name** | OpenWork Den (or whatever you want) |
| **Homepage URL** | `https://admin.soapbox.build` |
| **Authorization callback URL** | `https://den-api-production-89bf.up.railway.app/api/auth/callback/github` |

⚠️ **The callback URL MUST point to the den-api domain, NOT the admin domain**

### 2. Railway Environment Variables (den-api)

Verify these are set correctly in Railway → den-api → Variables:

```bash
BETTER_AUTH_URL=https://den-api-production-89bf.up.railway.app
DEN_BETTER_AUTH_TRUSTED_ORIGINS=https://admin.soapbox.build
GITHUB_CLIENT_ID=Ov23liE1PHGsaX5glwDx
GITHUB_CLIENT_SECRET=<your-secret>
```

### 3. How the OAuth Flow Works

```
1. User clicks "Sign in with GitHub" at admin.soapbox.build
   ↓
2. Browser redirects to github.com/login/oauth/authorize
   ↓
3. User authorizes app on GitHub
   ↓
4. GitHub redirects to: den-api-production-89bf.up.railway.app/api/auth/callback/github?code=xxx&state=yyy
   ↓
5. den-api validates state, exchanges code for token
   ↓
6. den-api creates session and redirects back to admin.soapbox.build
```

## Debug Steps

### A. Check GitHub callback URL
```bash
# Should match the Authorization callback URL in GitHub
curl https://den-api-production-89bf.up.railway.app/api/auth/callback/github
# Should return 400 or error (not 404) because it expects query params
```

### B. Check den-api env vars
In Railway dashboard:
1. Go to den-api service
2. Click **Variables**
3. Confirm `BETTER_AUTH_URL` and `DEN_BETTER_AUTH_TRUSTED_ORIGINS`

### C. Test the flow
1. Clear browser cookies for both domains
2. Go to https://admin.soapbox.build
3. Open DevTools → Network tab
4. Click "Sign in with GitHub"
5. Watch the redirects - note the callback URL GitHub uses

## Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| `state_mismatch` | GitHub callback URL doesn't match | Update GitHub OAuth app callback URL |
| `redirect_uri_mismatch` | GitHub rejects the flow | Callback URL in GitHub app settings is wrong |
| CORS error | Admin can't talk to API | Add admin domain to `DEN_BETTER_AUTH_TRUSTED_ORIGINS` |
| 404 on callback | den-api not handling the route | Check `BETTER_AUTH_URL` is set correctly |

## If Still Broken

Try the alternative fix - use cookie strategy instead of database:

```typescript
// In ee/apps/den-api/src/auth.ts
export const auth = betterAuth({
  // ... existing config
  verification: {
    storeStateStrategy: "cookie", // Instead of default "database"
  },
  account: {
    skipStateCookieCheck: true, // Keep this too
  },
});
```

---

**Last checked:** June 5, 2026  
**den-api deployment:** SUCCESS at 03:33:49
