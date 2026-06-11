// VNC WebSocket relay — TCP socket edition
//
// Problem: both the browser→Worker and Worker→Render connections go through
// Cloudflare's HTTP/2 edge, which strips WebSocket Upgrade headers before they
// reach the Render origin. fetch() with websocket upgrade headers doesn't work
// because CF still uses HTTP/2 to proxy the request to the origin.
//
// Fix: use cloudflare:sockets connect() to make a raw TCP/TLS connection to the
// Render backend. This bypasses the HTTP/2 proxy entirely — we send a raw
// HTTP/1.1 Upgrade request over the TLS socket, get a 101, then relay
// WebSocket frames at the binary level.
//
// Browser sends masked WS frames → we forward them raw to the TCP socket.
// Backend sends unmasked WS frames → we forward them raw to the browser.
// The openwork-server's manual frame parser receives proper WS frames.

import { connect } from "cloudflare:sockets";

function concatBytes(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

// Build a minimal masked WebSocket frame for a binary message (client→server)
function buildWsFrame(data) {
  const payload = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  const len = payload.length;
  const mask = crypto.getRandomValues(new Uint8Array(4));

  let header;
  if (len <= 125) {
    header = new Uint8Array([0x82, 0x80 | len, mask[0], mask[1], mask[2], mask[3]]);
  } else if (len <= 65535) {
    header = new Uint8Array([0x82, 0x80 | 126, len >> 8, len & 0xff, mask[0], mask[1], mask[2], mask[3]]);
  } else {
    header = new Uint8Array(14);
    header[0] = 0x82; header[1] = 0x80 | 127;
    const dv = new DataView(header.buffer, 2);
    dv.setBigUint64(0, BigInt(len), false);
    header.set(mask, 10);
  }

  const masked = new Uint8Array(payload.length);
  for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i % 4];
  return concatBytes(header, masked);
}

// Parse all complete WebSocket frames from buf; return {frames, remaining}
function parseFrames(buf) {
  const frames = [];
  let offset = 0;
  while (offset + 2 <= buf.length) {
    const b0 = buf[offset], b1 = buf[offset + 1];
    const masked = (b1 & 0x80) !== 0;
    let payloadLen = b1 & 0x7f;
    let headerLen = 2 + (masked ? 4 : 0);
    if (payloadLen === 126) {
      if (offset + 4 > buf.length) break;
      payloadLen = (buf[offset + 2] << 8) | buf[offset + 3];
      headerLen += 2;
    } else if (payloadLen === 127) {
      if (offset + 10 > buf.length) break;
      payloadLen = Number(
        (BigInt(buf[offset+2]) << 56n) | (BigInt(buf[offset+3]) << 48n) |
        (BigInt(buf[offset+4]) << 40n) | (BigInt(buf[offset+5]) << 32n) |
        (BigInt(buf[offset+6]) << 24n) | (BigInt(buf[offset+7]) << 16n) |
        (BigInt(buf[offset+8]) << 8n) | BigInt(buf[offset+9])
      );
      headerLen += 8;
    }
    if (offset + headerLen + payloadLen > buf.length) break;
    const opcode = b0 & 0x0f;
    let payload = buf.slice(offset + headerLen, offset + headerLen + payloadLen);
    if (masked) {
      const m = buf.slice(offset + headerLen - 4, offset + headerLen);
      const unmasked = new Uint8Array(payload.length);
      for (let i = 0; i < payload.length; i++) unmasked[i] = payload[i] ^ m[i % 4];
      payload = unmasked;
    }
    frames.push({ opcode, payload });
    offset += headerLen + payloadLen;
  }
  return { frames, remaining: buf.slice(offset) };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const upgrade = request.headers.get("upgrade");

    if (!upgrade || upgrade.toLowerCase() !== "websocket") {
      return new Response("Soapbox VNC relay (TCP socket mode)", { status: 200 });
    }
    if (!url.pathname.includes("/browser/vnc")) {
      return new Response("Path must include /browser/vnc", { status: 400 });
    }

    const serverUrl = url.searchParams.get("serverUrl");
    if (!serverUrl) {
      return new Response("Missing required ?serverUrl= parameter", { status: 400 });
    }

    let backendHost;
    try { backendHost = new URL(serverUrl).hostname; }
    catch { return new Response("Invalid serverUrl", { status: 400 }); }

    const token = url.searchParams.get("token") || "";
    const wsPath = `${url.pathname}?token=${encodeURIComponent(token)}`;

    // Accept the browser WebSocket immediately
    const { 0: browser, 1: worker } = new WebSocketPair();
    worker.accept();

    ctx.waitUntil((async () => {
      try {
        // Raw TLS connection to Render — bypasses HTTP/2 proxy
        const socket = connect(`${backendHost}:443`, { secureTransport: "on" });
        const writer = socket.writable.getWriter();
        const reader = socket.readable.getReader();

        // Send HTTP/1.1 WebSocket upgrade request
        const wsKey = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
        const httpUpgrade = [
          `GET ${wsPath} HTTP/1.1`,
          `Host: ${backendHost}`,
          `Upgrade: websocket`,
          `Connection: Upgrade`,
          `Sec-WebSocket-Key: ${wsKey}`,
          `Sec-WebSocket-Version: 13`,
          `Sec-WebSocket-Protocol: binary`,
          ``, ``
        ].join("\r\n");
        await writer.write(new TextEncoder().encode(httpUpgrade));
        writer.releaseLock();

        // Read the HTTP 101 response
        let respBuf = new Uint8Array(0);
        while (true) {
          const { done, value } = await reader.read();
          if (done) throw new Error("Socket closed before 101");
          respBuf = concatBytes(respBuf, value);
          const respStr = new TextDecoder().decode(respBuf);
          if (respStr.includes("\r\n\r\n")) {
            if (!respStr.startsWith("HTTP/1.1 101")) {
              throw new Error(`Backend rejected upgrade: ${respStr.slice(0, 80)}`);
            }
            console.log("[relay] TCP WebSocket upgrade accepted");
            // Any bytes after the \r\n\r\n are the start of the WS stream
            const headerEnd = respStr.indexOf("\r\n\r\n") + 4;
            respBuf = respBuf.slice(headerEnd);
            break;
          }
        }

        // Browser → backend: re-frame browser messages as masked WS frames
        worker.addEventListener("message", (e) => {
          const data = e.data instanceof ArrayBuffer ? new Uint8Array(e.data) :
                       typeof e.data === "string" ? new TextEncoder().encode(e.data) : e.data;
          const frame = buildWsFrame(data);
          socket.writable.getWriter().write(frame).catch(() => {});
        });
        worker.addEventListener("close", () => {
          try { socket.close(); } catch {}
        });

        // Backend → browser: parse raw WS frames, forward payloads
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          respBuf = concatBytes(respBuf, value);
          const { frames, remaining } = parseFrames(respBuf);
          respBuf = remaining;
          for (const { opcode, payload } of frames) {
            if (opcode === 8) { worker.close(1000, "backend closed"); return; }
            if (opcode === 2 || opcode === 0 || opcode === 1) {
              try { worker.send(payload.buffer); } catch {}
            }
          }
        }
        worker.close(1001, "backend disconnected");
      } catch (err) {
        console.error("[relay] TCP error:", err.message);
        try { worker.close(1011, err.message.slice(0, 100)); } catch {}
      }
    })());

    return new Response(null, { status: 101, webSocket: browser });
  },
};
