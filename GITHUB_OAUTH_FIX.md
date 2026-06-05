# GitHub OAuth Fix - state_mismatch Error

## Problem

GitHub OAuth login was failing with `state_mismatch` error because:

1. **Admin UI**: `admin.soapbox.build`  
2. **API callback**: `den-api-production-89bf.up.railway.app`  
3. **Different domains** = browsers block cross-domain state cookies

## Solution

Added `skipStateCookieCheck: true` to Better Auth configuration in `ee/apps/den-api/src/auth.ts`:

```typescript
account: {
  // Skip state cookie check for cross-domain OAuth
  // The verification record in database still validates the state parameter
  skipStateCookieCheck: true,
},
```

## Security Note

This is safe because:
- The verification record in the MySQL database **still validates the state parameter**
- Only the secondary cookie check is skipped
- Primary CSRF protection remains intact via database verification

## Alternative Solutions (if this doesn't work)

### Option 1: Use Same Domain for Both
Set up:
- Admin UI: `admin.soapbox.build`
- API: `api.soapbox.build`

Both on `*.soapbox.build` allows cookie sharing.

### Option 2: Cookie Strategy
In `ee/apps/den-api/src/auth.ts`:

```typescript
export const auth = betterAuth({
  // ... existing config
  verification: {
    storeStateStrategy: "cookie", // Instead of default "database"
  },
});
```

This encrypts state into a cookie instead of using the database.

## Deploy the Fix

**Railway isn't auto-deploying from git pushes.** You need to manually trigger a redeploy:

1. Go to Railway dashboard → `den-api` service
2. Click **Deploy** or **Redeploy latest**
3. Wait for deployment to complete (~2 minutes)

## Testing

After den-api redeploys:

1. Go to `https://admin.soapbox.build`
2. Click "Continue with GitHub"
3. Authorize the OAuth app
4. Should redirect back and log in successfully ✅

---

**Commit:** 9eee65f8  
**File Changed:** `ee/apps/den-api/src/auth.ts`  
**Date:** June 5, 2026
