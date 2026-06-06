# OpenWork Workspace Proxy

Reverse proxy for OpenWork cloud workspaces. Provides clean URLs and secure access to Daytona-hosted workspaces.

## Features

- **Clean URLs**: Access workspace at `app.soapbox.build` instead of ugly Daytona signed preview URLs
- **Secure**: Tokens handled server-side, never exposed to client
- **WebSocket support**: Full bidirectional communication for real-time workspace features
- **Session validation**: Validates Den session before proxying

## Architecture

```
User visits app.soapbox.build
    ↓
Workspace Proxy (validates session)
    ↓ (fetches workspace URL + token from Den API)
Daytona Workspace
```

## Environment Variables

- `DEN_API_BASE` - Den API base URL (default: `https://api.openworklabs.com`)
- `DEN_AUTH_ORIGIN` - Auth redirect URL (default: `https://admin.soapbox.build`)
- `PORT` - Server port (default: `3000`)

## Deployment

### Railway

1. Create new service from this directory
2. Set environment variables
3. Configure custom domain: `app.soapbox.build`
4. Deploy

### Local Development

```bash
npm install
npm run dev
```

Visit `http://localhost:3000` - it will redirect to auth if you're not logged in.

## How It Works

1. User visits `app.soapbox.build`
2. Proxy extracts `den.session` cookie
3. Validates session with Den API
4. Fetches workspace URL and client token
5. Proxies all HTTP and WebSocket requests to Daytona
6. Adds `Authorization: Bearer <token>` header
7. User sees workspace at clean URL

## Security

- Session validation on every request
- Tokens never exposed to client
- Cookies not forwarded to Daytona
- HTTPS enforced in production
