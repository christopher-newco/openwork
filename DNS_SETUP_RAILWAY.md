# Railway DNS Setup for admin.soapbox.build

**Date**: 2026-06-05  
**Issue**: `admin.soapbox.build` returns ERR_NAME_NOT_RESOLVED

## Required DNS Record

The custom domain `admin.soapbox.build` needs a CNAME record pointing to Railway's infrastructure.

```
Type:  CNAME
Name:  admin
Value: ww1a4ma2.up.railway.app
```

## Setup via Railway Dashboard

Since you're using Railway as your DNS provider for `soapbox.build`:

### Option 1: Railway DNS Management (if available)

1. Go to https://railway.app
2. Navigate to your account/team settings
3. Look for **Domains** or **DNS Management**
4. Select `soapbox.build`
5. Add a new record:
   - **Type**: CNAME
   - **Name**: `admin`
   - **Value**: `ww1a4ma2.up.railway.app`
   - **TTL**: 300 (default)
6. Save

### Option 2: Through the Service

If Railway automatically manages DNS when you add a custom domain:

1. Go to https://railway.app/project/2ebd672b-41b6-428f-8501-acf1157b401e
2. Click the **Admin** service
3. Go to **Settings** → **Networking**
4. The custom domain `admin.soapbox.build` should be listed
5. Check the **DNS Status** - it should show what records are needed
6. If it says "Waiting for DNS", the CNAME might need to be added manually

### Option 3: CLI (if Railway DNS supports it)

```bash
# Check if Railway CLI has DNS commands
railway dns --help

# Add CNAME record (if supported)
railway dns add soapbox.build CNAME admin ww1a4ma2.up.railway.app
```

## Verification

### Check DNS Resolution

```bash
# Using nslookup
nslookup admin.soapbox.build

# Using dig
dig admin.soapbox.build

# Expected output should show:
# admin.soapbox.build CNAME ww1a4ma2.up.railway.app
```

### Test HTTPS

```bash
curl -I https://admin.soapbox.build
```

Should return HTTP 200 or a redirect (not connection error).

## Current State

✅ **Custom domain configured in Railway**: admin.soapbox.build  
✅ **Target CNAME**: ww1a4ma2.up.railway.app  
❌ **DNS record**: Not yet added/propagated

## Temporary Workaround

Use the Railway-generated domain directly:

**Working URL**: https://den-web-production-4616.up.railway.app

This works immediately while you set up the DNS record.

## After DNS is Set Up

Update the environment variables to use the custom domain:

### App Service (app.soapbox.build)
```bash
VITE_DEN_BASE_URL=https://admin.soapbox.build  # ✅ Already set
```

### Den-API Service
```bash
DEN_BETTER_AUTH_TRUSTED_ORIGINS=https://admin.soapbox.build,https://app.soapbox.build  # ✅ Already set
CORS_ORIGINS=https://admin.soapbox.build,https://app.soapbox.build  # ✅ Already set
```

All environment variables are already configured to use `admin.soapbox.build` - we just need the DNS record!

## DNS Propagation Time

Once added:
- **Railway DNS**: Usually instant to ~5 minutes
- **Global DNS cache**: Can take up to 24-48 hours (but usually <1 hour)

You can check propagation at: https://dnschecker.org/#CNAME/admin.soapbox.build
