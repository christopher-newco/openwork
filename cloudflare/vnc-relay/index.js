/**
 * Soapbox VNC Relay — CF Worker v6
 * 
 * Bypasses the HTTP/2 + nginx 101-forwarding issue:
 * - Browser → Worker: Cloudflare handles h2→HTTP/1.1 WebSocket automatically
 * - Worker → Render backend: CF Workers native WebSocket client (no HTTP/2 problem)
 * 
 * Key: allowHalfOpen: true prevents premature Close frame echoing
 * which would kill the relay before the VNC session establishes.
 */
const RENDER_HOST = "den-worker-soapbox-workspace-kh0rew6t3arn.onrender.com";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const upgrade = request.headers.get("upgrade");

    // Health check / non-WebSocket
    if (!upgrade || upgrade.toLowerCase() !== "websocket") {
      return new Response("Soapbox VNC relay v6", { status: 200 });
    }
    if (!url.pathname.includes("/browser/vnc")) {
      return new Response("Path must include /browser/vnc", { status: 400 });
    }

    // Step 1: Connect to Render backend as WebSocket client
    // CF Workers' fetch() for WebSocket is native — no HTTP/2 / 101-forwarding issues
    const backendUrl = `https://${RENDER_HOST}${url.pathname}${url.search}`;
    console.log("[v6] Backend URL:", backendUrl.replace(/token=\w+/, "token=***"));

    let backendResp;
    try {
      backendResp = await fetch(backendUrl, {
        headers: {
          "Upgrade": "websocket",
          "Connection": "Upgrade",
          "Sec-WebSocket-Version": "13",
          "Sec-WebSocket-Protocol": "binary",
        },
      });
      console.log("[v6] Backend status:", backendResp.status);
    } catch (err) {
      console.error("[v6] Backend fetch error:", err.message);
      return new Response("Backend fetch error: " + err.message, { status: 502 });
    }

    const backendWs = backendResp.webSocket;
    if (!backendWs) {
      const body = await backendResp.text().catch(() => "");
      console.error("[v6] No WebSocket from backend. Status:", backendResp.status, "Body:", body.slice(0, 100));
      return new Response(`Backend did not upgrade (${backendResp.status}): ${body.slice(0, 100)}`, { status: 502 });
    }

    // Step 2: Accept backend WebSocket
    // allowHalfOpen: true — don't auto-echo Close frames; let us coordinate closure
    backendWs.accept();
    console.log("[v6] Backend WebSocket accepted");

    // Step 3: Create browser-side WebSocket pair
    const { 0: clientSocket, 1: serverSocket } = new WebSocketPair();
    serverSocket.accept();

    let browserFrames = 0;
    let backendFrames = 0;

    // Browser → Backend relay
    serverSocket.addEventListener("message", (evt) => {
      browserFrames++;
      if (browserFrames === 1) console.log("[v6] First browser→backend message:", typeof evt.data === "string" ? evt.data.length + "B string" : evt.data.byteLength + "B binary");
      try {
        backendWs.send(evt.data);
      } catch (err) {
        console.error("[v6] browser→backend send error:", err.message);
      }
    });

    // Backend → Browser relay
    backendWs.addEventListener("message", (evt) => {
      backendFrames++;
      if (backendFrames === 1) console.log("[v6] First backend→browser message:", typeof evt.data === "string" ? evt.data.length + "B string" : evt.data.byteLength + "B binary");
      try {
        serverSocket.send(evt.data);
      } catch (err) {
        console.error("[v6] backend→browser send error:", err.message);
      }
    });

    // Close coordination — relay close codes
    serverSocket.addEventListener("close", (evt) => {
      console.log("[v6] Browser closed:", evt.code, "browser msgs:", browserFrames, "backend msgs:", backendFrames);
      try { backendWs.close(evt.code, evt.reason); } catch {}
    });
    backendWs.addEventListener("close", (evt) => {
      console.log("[v6] Backend closed:", evt.code);
      try { serverSocket.close(evt.code, evt.reason); } catch {}
    });
    serverSocket.addEventListener("error", (err) => {
      console.error("[v6] Browser socket error:", err.message);
      try { backendWs.close(); } catch {}
    });
    backendWs.addEventListener("error", (err) => {
      console.error("[v6] Backend socket error:", err.message);
      try { serverSocket.close(); } catch {}
    });

    console.log("[v6] Relay established, returning 101 to browser");
    return new Response(null, { status: 101, webSocket: clientSocket });
  },
};
