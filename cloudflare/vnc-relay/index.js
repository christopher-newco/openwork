// Connect directly to Render's server IPs (not the Cloudflare-proxied hostname).
// This bypasses Cloudflare's hop-by-hop header stripping.
// IPs for: den-worker-soapbox-workspace-kh0rew6t3arn.onrender.com
const RENDER_HOST = "den-worker-soapbox-workspace-kh0rew6t3arn.onrender.com";
const RENDER_IPS = ["216.24.57.8", "216.24.57.9"];  // Render's own IPs (not Cloudflare)

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const upgrade = request.headers.get("upgrade");

    if (!upgrade || upgrade.toLowerCase() !== "websocket") {
      return new Response(`Soapbox VNC relay v4. Direct IP mode.`, { status: 200 });
    }

    if (!url.pathname.includes("/browser/vnc")) {
      return new Response("Path must include /browser/vnc", { status: 400 });
    }

    const token = url.searchParams.get("token") ?? "";

    // Try each Render IP directly (bypasses Cloudflare proxy layer)
    let backendWs = null;
    let lastError = "";

    for (const ip of RENDER_IPS) {
      const backendUrl = `https://${ip}${url.pathname}${url.search}`;
      console.log("[relay] Trying direct IP:", ip);
      try {
        const resp = await fetch(backendUrl, {
          headers: {
            "Host": RENDER_HOST,
            "Upgrade": "websocket",
            "Connection": "Upgrade",
            "Sec-WebSocket-Version": "13",
            "Sec-WebSocket-Protocol": "binary",
            "Authorization": `Bearer ${token}`,
          },
        });
        console.log("[relay] Response status:", resp.status);
        if (resp.webSocket) {
          backendWs = resp.webSocket;
          console.log("[relay] WebSocket established via", ip);
          break;
        } else {
          const body = await resp.text().catch(() => "");
          lastError = `IP ${ip}: status=${resp.status} body=${body.slice(0,100)}`;
          console.log("[relay] No WS on", ip, ":", lastError);
        }
      } catch (err) {
        lastError = `IP ${ip}: ${err.message}`;
        console.error("[relay] Error on", ip, ":", err.message);
      }
    }

    if (!backendWs) {
      return new Response(`Backend connection failed: ${lastError}`, { status: 502 });
    }

    backendWs.accept();

    const { 0: browser, 1: worker } = new WebSocketPair();
    worker.accept();

    worker.addEventListener("message", (e) => { try { backendWs.send(e.data); } catch {} });
    backendWs.addEventListener("message", (e) => { try { worker.send(e.data); } catch {} });
    worker.addEventListener("close", (e) => { console.log("[relay] browser→close:", e.code); try { backendWs.close(e.code, e.reason); } catch {} });
    backendWs.addEventListener("close", (e) => { console.log("[relay] render→close:", e.code); try { worker.close(e.code, e.reason); } catch {} });
    worker.addEventListener("error", (e) => { console.error("[relay] browser error"); try { backendWs.close(); } catch {} });
    backendWs.addEventListener("error", (e) => { console.error("[relay] render error"); try { worker.close(); } catch {} });

    return new Response(null, { status: 101, webSocket: browser });
  },
};
