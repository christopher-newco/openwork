// Connect to Render backend using CF's resolveOverride to use the raw IP
// while keeping the hostname for TLS SNI. openssl proved this works:
//   openssl s_client -connect 216.24.57.8:443 -servername den-worker-...onrender.com
// bypasses the Cloudflare proxy layer that strips WebSocket headers.
const RENDER_HOST = "den-worker-soapbox-workspace-kh0rew6t3arn.onrender.com";
const RENDER_IPS = ["216.24.57.8", "216.24.57.9"];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const upgrade = request.headers.get("upgrade");

    if (!upgrade || upgrade.toLowerCase() !== "websocket") {
      return new Response("Soapbox VNC relay v5 (resolveOverride mode)", { status: 200 });
    }
    if (!url.pathname.includes("/browser/vnc")) {
      return new Response("Path must include /browser/vnc", { status: 400 });
    }

    const backendPath = `${url.pathname}${url.search}`;
    console.log("[relay] Request:", backendPath.replace(/token=\w+/, "token=***"));

    // Try each Render IP with resolveOverride (proper SNI + direct IP)
    for (const ip of RENDER_IPS) {
      console.log("[relay] Trying resolveOverride to", ip);
      let resp;
      try {
        resp = await fetch(`https://${RENDER_HOST}${backendPath}`, {
          headers: {
            "Upgrade": "websocket",
            "Connection": "Upgrade",
            "Sec-WebSocket-Version": "13",
            "Sec-WebSocket-Protocol": "binary",
          },
          // @ts-ignore — CF Workers specific option
          cf: { resolveOverride: ip },
        });
        console.log("[relay] Status from", ip, ":", resp.status);
      } catch (err) {
        console.error("[relay] Error:", ip, err.message);
        continue;
      }

      if (resp.webSocket) {
        console.log("[relay] WebSocket established via", ip);
        const backendWs = resp.webSocket;
        backendWs.accept();

        const { 0: browser, 1: worker } = new WebSocketPair();
        worker.accept();

        worker.addEventListener("message", (e) => { try { backendWs.send(e.data); } catch {} });
        backendWs.addEventListener("message", (e) => { try { worker.send(e.data); } catch {} });
        worker.addEventListener("close", (e) => { console.log("[relay] browser closed:", e.code); try { backendWs.close(e.code, e.reason); } catch {} });
        backendWs.addEventListener("close", (e) => { console.log("[relay] render closed:", e.code); try { worker.close(e.code, e.reason); } catch {} });

        return new Response(null, { status: 101, webSocket: browser });
      }

      const body = await resp.text().catch(() => "");
      console.log("[relay] No WS from", ip, "- status:", resp.status, "body:", body.slice(0, 100));
    }

    return new Response("All backend IPs failed", { status: 502 });
  },
};
