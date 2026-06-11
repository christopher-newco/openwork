// VNC WebSocket relay for Soapbox OpenWork workers.
//
// The browser cannot connect to the Render backend directly via WebSocket
// because Cloudflare's HTTP/2 proxy strips the Upgrade header. This Worker
// acts as the relay: the browser connects here (WSS), and the Worker
// connects to the backend using Cloudflare's internal network (which uses
// HTTP/1.1 for outbound WebSocket fetch, bypassing the proxy issue).
//
// The backend URL is passed as a `serverUrl` query parameter so this Worker
// works for any worker deployment without code changes.

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const upgrade = request.headers.get("upgrade");

    if (!upgrade || upgrade.toLowerCase() !== "websocket") {
      return new Response("Soapbox VNC relay (dynamic mode)", { status: 200 });
    }
    if (!url.pathname.includes("/browser/vnc")) {
      return new Response("Path must include /browser/vnc", { status: 400 });
    }

    // Extract backend URL from query param (set by the OpenWork frontend)
    const serverUrl = url.searchParams.get("serverUrl");
    if (!serverUrl) {
      return new Response("Missing required ?serverUrl= parameter", { status: 400 });
    }

    // Build the backend WebSocket URL: swap the host from serverUrl
    // and keep the /workspace/.../browser/vnc path + token query
    let backendBase;
    try {
      backendBase = new URL(serverUrl);
    } catch {
      return new Response("Invalid serverUrl", { status: 400 });
    }
    const token = url.searchParams.get("token") || "";
    const wsPath = url.pathname; // /workspace/<id>/browser/vnc
    const backendWsUrl = `wss://${backendBase.host}${wsPath}?token=${encodeURIComponent(token)}`;

    console.log("[relay] Connecting to backend:", backendWsUrl.replace(/token=\w+/, "token=***"));

    let backendResp;
    try {
      backendResp = await fetch(backendWsUrl, {
        headers: {
          "Upgrade": "websocket",
          "Connection": "Upgrade",
          "Sec-WebSocket-Version": "13",
          "Sec-WebSocket-Protocol": "binary",
        },
      });
    } catch (err) {
      console.error("[relay] Backend fetch error:", err.message);
      return new Response(`Backend unreachable: ${err.message}`, { status: 502 });
    }

    console.log("[relay] Backend response status:", backendResp.status);

    if (!backendResp.webSocket) {
      const body = await backendResp.text().catch(() => "(no body)");
      console.error("[relay] Backend did not upgrade to WebSocket:", backendResp.status, body.slice(0, 200));
      return new Response(`Backend WebSocket failed (${backendResp.status}): ${body.slice(0, 100)}`, { status: 502 });
    }

    const backendWs = backendResp.webSocket;
    backendWs.accept();

    const { 0: browser, 1: worker } = new WebSocketPair();
    worker.accept();

    // Relay messages in both directions. Both sides use the CF WebSocket
    // abstraction which handles framing/deframing transparently.
    worker.addEventListener("message", (e) => {
      try { backendWs.send(e.data); } catch (err) { console.error("[relay] browser→backend error:", err.message); }
    });
    backendWs.addEventListener("message", (e) => {
      try { worker.send(e.data); } catch (err) { console.error("[relay] backend→browser error:", err.message); }
    });
    worker.addEventListener("close", (e) => {
      console.log("[relay] browser closed:", e.code, e.reason);
      try { backendWs.close(e.code, e.reason); } catch {}
    });
    backendWs.addEventListener("close", (e) => {
      console.log("[relay] backend closed:", e.code, e.reason);
      try { worker.close(e.code, e.reason); } catch {}
    });
    worker.addEventListener("error", (e) => { console.error("[relay] browser WS error:", e.message); });
    backendWs.addEventListener("error", (e) => { console.error("[relay] backend WS error:", e.message); });

    return new Response(null, { status: 101, webSocket: browser });
  },
};
