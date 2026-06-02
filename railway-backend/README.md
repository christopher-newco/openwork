# OpenWork Backend Service

This directory contains the configuration for deploying the OpenWork backend (OpenCode server) to Railway.

## What it does

- Runs `openwork-orchestrator` which manages the OpenCode server
- Listens on Railway's assigned PORT
- Auto-approves requests (use with caution in production)
- Creates a workspace at `/app/workspace`

## Environment Variables

Set these in Railway:

```bash
ANTHROPIC_API_KEY=your-api-key-here
OPENCODE_API_KEY=your-opencode-api-key-here  # if needed
```

## Connecting Frontend to Backend

In the frontend service, set:

```bash
VITE_OPENCODE_API_URL=https://openwork-backend-production.up.railway.app
```

(Replace with your actual backend Railway URL)
