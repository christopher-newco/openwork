import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import httpProxy from 'http-proxy';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const DEN_API_BASE = process.env.DEN_API_BASE || 'https://api.openworklabs.com';
const DEN_AUTH_ORIGIN = process.env.DEN_AUTH_ORIGIN || 'https://admin.soapbox.build';

// Create proxy instance
const proxy = httpProxy.createProxyServer({
  changeOrigin: true,
  ws: true,
  xfwd: true,
});

proxy.on('error', (err, req, res) => {
  console.error('[proxy] Error:', err.message);
  if (res.writeHead) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Proxy error', message: err.message }));
  }
});

async function getWorkspaceConfig(sessionToken) {
  try {
    // Get worker list
    const workersResponse = await fetch(`${DEN_API_BASE}/v1/workers`, {
      headers: {
        Cookie: `den.session=${sessionToken}`,
        Accept: 'application/json',
      },
    });

    if (!workersResponse.ok) {
      return null;
    }

    const workersData = await workersResponse.json();
    const workers = workersData?.workers;

    if (!Array.isArray(workers) || workers.length === 0) {
      return null;
    }

    const workerId = workers[0].id;

    // Get worker tokens
    const tokensResponse = await fetch(`${DEN_API_BASE}/v1/workers/${workerId}/tokens`, {
      headers: {
        Cookie: `den.session=${sessionToken}`,
        Accept: 'application/json',
      },
    });

    if (!tokensResponse.ok) {
      return null;
    }

    const tokensData = await tokensResponse.json();
    const instanceUrl = tokensData?.connect?.openworkUrl || tokensData?.worker?.instance?.url;
    const clientToken = tokensData?.tokens?.client;

    if (!instanceUrl || !clientToken) {
      return null;
    }

    return {
      target: instanceUrl,
      token: clientToken,
    };
  } catch (error) {
    console.error('[workspace-proxy] Failed to get workspace config:', error);
    return null;
  }
}

function getCookieValue(cookieHeader, name) {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';').map(c => c.trim());
  for (const cookie of cookies) {
    const [key, value] = cookie.split('=');
    if (key === name) {
      return value;
    }
  }
  return null;
}

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);

      // Extract session token from cookie
      const sessionToken = getCookieValue(req.headers.cookie, 'den.session');

      if (!sessionToken) {
        res.writeHead(302, {
          Location: `${DEN_AUTH_ORIGIN}/?mode=sign-in&redirect=${encodeURIComponent(req.url)}`,
        });
        res.end();
        return;
      }

      // Get workspace configuration
      const config = await getWorkspaceConfig(sessionToken);

      if (!config) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'workspace_unavailable',
          message: 'Workspace not available. Please ensure you have a workspace provisioned.',
        }));
        return;
      }

      // Add auth header for Daytona
      req.headers['authorization'] = `Bearer ${config.token}`;
      delete req.headers['cookie']; // Don't forward session cookie to Daytona

      console.log(`[proxy] ${req.method} ${req.url} -> ${config.target}${req.url}`);

      // Proxy the request
      proxy.web(req, res, {
        target: config.target,
      });
    } catch (error) {
      console.error('[server] Request error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  });

  // Handle WebSocket upgrades
  server.on('upgrade', async (req, socket, head) => {
    try {
      const sessionToken = getCookieValue(req.headers.cookie, 'den.session');

      if (!sessionToken) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      const config = await getWorkspaceConfig(sessionToken);

      if (!config) {
        socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
        socket.destroy();
        return;
      }

      req.headers['authorization'] = `Bearer ${config.token}`;
      delete req.headers['cookie'];

      console.log(`[proxy] WebSocket upgrade ${req.url} -> ${config.target}${req.url}`);

      proxy.ws(req, socket, head, {
        target: config.target,
      });
    } catch (error) {
      console.error('[server] WebSocket upgrade error:', error);
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
    }
  });

  server.listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
