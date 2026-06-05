# OpenWork Den Web Deployment Guide

This guide covers deploying the OpenWork Den Web application with auto-login and auto-connect features for dedicated app instances.

## Features

### Authentication Middleware
- Automatically redirects unauthenticated users to the login page
- Protects all routes except public paths (/, /api/auth/*, /sso/*)
- Checks for auth tokens in cookies or Authorization headers

### Auto-Connect to Predefined Worker
When `NEXT_PUBLIC_PREDEFINED_WORKER_ID` is set:
1. After login, users are redirected to `/connect`
2. The app automatically selects the predefined worker
3. Connection credentials are fetched
4. User is redirected to the worker instance with `autoConnect=1`

## Environment Variables

### Required

```bash
# Base URL for OpenWork app connection
NEXT_PUBLIC_OPENWORK_APP_CONNECT_URL=https://app.soapbox.build

# Auth callback URL (should match your deployment URL)
NEXT_PUBLIC_OPENWORK_AUTH_CALLBACK_URL=https://app.soapbox.build
```

### Optional

```bash
# Predefined worker ID for auto-connect
# When set, users will automatically connect to this worker after login
NEXT_PUBLIC_PREDEFINED_WORKER_ID=your-worker-id-here

# Posthog analytics
NEXT_PUBLIC_POSTHOG_KEY=your-posthog-key
NEXT_PUBLIC_POSTHOG_HOST=/ow

# Allowed development origins (comma-separated)
DEN_WEB_ALLOWED_DEV_ORIGINS=http://localhost:3000,http://localhost:3001
```

## Railway Deployment

### 1. Set Environment Variables

In your Railway project, add these environment variables:

```bash
NEXT_PUBLIC_OPENWORK_APP_CONNECT_URL=https://app.soapbox.build
NEXT_PUBLIC_OPENWORK_AUTH_CALLBACK_URL=https://app.soapbox.build
NEXT_PUBLIC_PREDEFINED_WORKER_ID=<your-worker-id>
```

### 2. Get Worker ID

To find your worker ID:

1. Log into your OpenWork Cloud account
2. Navigate to the Background Tasks page
3. The worker ID is displayed in the worker details
4. Copy the ID and set it as `NEXT_PUBLIC_PREDEFINED_WORKER_ID`

### 3. Deploy

```bash
# From the root of the repo
railway up
```

## Local Development

### 1. Create .env.local

```bash
cd ee/apps/den-web
cp .env.example .env.local
```

### 2. Configure Variables

Edit `.env.local`:

```bash
NEXT_PUBLIC_OPENWORK_APP_CONNECT_URL=http://localhost:3000
NEXT_PUBLIC_OPENWORK_AUTH_CALLBACK_URL=http://localhost:3001
NEXT_PUBLIC_PREDEFINED_WORKER_ID=your-test-worker-id
```

### 3. Run Development Server

```bash
pnpm dev
```

## Flow

### With Predefined Worker

1. User visits `app.soapbox.build`
2. Middleware checks authentication
   - If not authenticated → shows login page
   - If authenticated → proceeds to step 3
3. After login, AuthScreen redirects to `/connect`
4. Connect page:
   - Loads worker list
   - Finds predefined worker
   - Waits for worker to be "ready"
   - Fetches connection credentials
   - Redirects to `{OPENWORK_APP_CONNECT_URL}/connect-remote?openworkHostUrl=...&openworkToken=...&autoConnect=1`
5. User is now connected to their worker

### Without Predefined Worker

Standard flow - redirects to organization dashboard

## Troubleshooting

### "Worker not found" error

- Verify the `NEXT_PUBLIC_PREDEFINED_WORKER_ID` matches an existing worker
- Check that the user has access to this worker
- Ensure the worker belongs to the correct organization

### Auto-connect not working

- Check browser console for errors
- Verify `NEXT_PUBLIC_OPENWORK_APP_CONNECT_URL` is correct
- Ensure the worker status is "ready" (not "starting" or "failed")

### Authentication loop

- Clear cookies and local storage
- Check that `NEXT_PUBLIC_OPENWORK_AUTH_CALLBACK_URL` matches your deployment URL
- Verify middleware is not blocking auth endpoints

## Security Notes

- Auth tokens are stored in httpOnly cookies (server-side)
- Middleware validates tokens on every protected request
- Worker credentials (client/owner tokens) are only stored in memory
- Connection URLs with tokens are generated on-demand

## Architecture

```
┌─────────────────┐
│  User visits    │
│  app.soapbox    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Middleware    │
│ Checks auth     │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
Not Auth   Authenticated
    │         │
    ▼         ▼
┌─────┐   ┌──────────┐
│Login│   │AuthScreen│
│Page │   │ checks   │
└─────┘   │predefined│
          │ worker   │
          └────┬─────┘
               │
          ┌────┴────┐
          │         │
     Predefined   No Predefined
          │         │
          ▼         ▼
    ┌──────────┐ ┌─────────┐
    │ /connect │ │Dashboard│
    │   page   │ └─────────┘
    └────┬─────┘
         │
         ▼
    ┌──────────────┐
    │Load worker   │
    │Fetch tokens  │
    │Auto-connect  │
    └──────────────┘
```
