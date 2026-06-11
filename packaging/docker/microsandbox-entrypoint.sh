#!/usr/bin/env sh
set -eu

OPENWORK_WORKSPACE="${OPENWORK_WORKSPACE:-/workspace}"
OPENWORK_DATA_DIR="${OPENWORK_DATA_DIR:-/data/openwork-orchestrator}"
OPENWORK_SIDECAR_DIR="${OPENWORK_SIDECAR_DIR:-/data/sidecars}"
# Honor a platform-injected PORT (e.g. Render/Heroku assign $PORT and route to it)
# before falling back to the default published port.
OPENWORK_PORT="${OPENWORK_PORT:-${PORT:-8787}}"
OPENWORK_OPENCODE_PORT="${OPENWORK_OPENCODE_PORT:-4096}"
OPENWORK_TOKEN="${OPENWORK_TOKEN:-microsandbox-token}"
OPENWORK_HOST_TOKEN="${OPENWORK_HOST_TOKEN:-microsandbox-host-token}"
OPENWORK_APPROVAL_MODE="${OPENWORK_APPROVAL_MODE:-auto}"
OPENWORK_CORS_ORIGINS="${OPENWORK_CORS_ORIGINS:-*}"
OPENWORK_CONNECT_HOST="${OPENWORK_CONNECT_HOST:-127.0.0.1}"
HOME="${HOME:-/root}"
USER="${USER:-root}"
SHELL="${SHELL:-/bin/sh}"
XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
XDG_CACHE_HOME="${XDG_CACHE_HOME:-$HOME/.cache}"
XDG_DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
XDG_STATE_HOME="${XDG_STATE_HOME:-$HOME/.local/state}"

if [ "$HOME" = "/" ]; then
  HOME=/root
  XDG_CONFIG_HOME="$HOME/.config"
  XDG_CACHE_HOME="$HOME/.cache"
  XDG_DATA_HOME="$HOME/.local/share"
  XDG_STATE_HOME="$HOME/.local/state"
fi

export HOME USER SHELL XDG_CONFIG_HOME XDG_CACHE_HOME XDG_DATA_HOME XDG_STATE_HOME

mkdir -p "$OPENWORK_WORKSPACE" "$OPENWORK_DATA_DIR" "$OPENWORK_SIDECAR_DIR"
mkdir -p "$HOME" "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME" "$XDG_DATA_HOME" "$XDG_STATE_HOME"

printf '%s\n' "Starting OpenWork micro-sandbox"
printf '%s\n' "- workspace: $OPENWORK_WORKSPACE"
printf '%s\n' "- home: $HOME"
printf '%s\n' "- openwork url: http://$OPENWORK_CONNECT_HOST:$OPENWORK_PORT"
printf '%s\n' "- client token: $OPENWORK_TOKEN"
printf '%s\n' "- host token: $OPENWORK_HOST_TOKEN"
printf '%s\n' "- health: curl http://$OPENWORK_CONNECT_HOST:$OPENWORK_PORT/health"
printf '%s\n' "- auth test: curl -H \"Authorization: Bearer $OPENWORK_TOKEN\" http://$OPENWORK_CONNECT_HOST:$OPENWORK_PORT/workspaces"

# Run openwork-server DIRECTLY instead of the `openwork serve` orchestrator.
# The orchestrator (0.15.x) freezes at its opencode health-gate in this headless
# container — opencode comes up on 127.0.0.1 but the gate never returns, so the
# orchestrator never starts openwork-server and nothing binds 0.0.0.0 (Render's
# port scan then times out). openwork-server is self-sufficient: it binds its
# HTTP server immediately (no blocking gate) and, with OPENWORK_MANAGE_OPENCODE=1,
# spawns and manages its own opencode. Tokens/workspace come from OPENWORK_* env.
export OPENWORK_MANAGE_OPENCODE=1
export OPENWORK_OPENCODE_BIN="${OPENWORK_OPENCODE_BIN:-/usr/local/bin/opencode}"

# --- opencode org-config inheritance (native .well-known/opencode) ---
# When provisioned with an org-scoped config key, seed opencode's auth.json with
# a `wellknown` entry pointing at den-api. opencode then fetches the org's model
# catalog ({config:{provider}}) on its own and merges it natively -- the org's
# providers/models appear in the worker with no per-workspace plumbing.
SOAPBOX_DEN_API_URL="${SOAPBOX_DEN_API_URL:-https://api.admin.soapbox.build}"
if [ -n "${SOAPBOX_OPENCODE_CONFIG_KEY:-}" ]; then
  OPENCODE_DATA_DIR="$XDG_DATA_HOME/opencode"
  AUTH_FILE="$OPENCODE_DATA_DIR/auth.json"
  mkdir -p "$OPENCODE_DATA_DIR"
  printf '{"%s":{"type":"wellknown","key":"SOAPBOX_ORG_TOKEN","token":"%s"}}\n' \
    "$SOAPBOX_DEN_API_URL" "$SOAPBOX_OPENCODE_CONFIG_KEY" > "$AUTH_FILE"
  chmod 600 "$AUTH_FILE"
  printf '%s\n' "- opencode org-config: wellknown seeded for $SOAPBOX_DEN_API_URL"
else
  printf '%s\n' "- opencode org-config: SOAPBOX_OPENCODE_CONFIG_KEY unset, skipping seed"
fi

# --- Tailscale (optional SSH access) ---
if [ -n "${TS_AUTHKEY:-}" ]; then
  # /var/lib/tailscale required for SSH host key storage
  mkdir -p /var/lib/tailscale
  # Supervisor loop: restart tailscaled if it exits
  (while true; do
    tailscaled --tun=userspace-networking \
      --statedir=/var/lib/tailscale \
      --socket=/tmp/tailscaled.sock >>/tmp/tailscaled.log 2>&1
    echo "tailscaled exited ($?), restarting in 3s..." >>/tmp/tailscaled.log
    sleep 3
  done) &
  sleep 3
  tailscale --socket=/tmp/tailscaled.sock up \
    --authkey="$TS_AUTHKEY" \
    --hostname="openwork-worker-$(hostname)" \
    --ssh \
    --accept-routes=false \
    >/tmp/tailscale-up.log 2>&1 && \
    printf '%s\n' "- tailscale: up, SSH enabled ($(tailscale --socket=/tmp/tailscaled.sock ip -4 2>/dev/null))" || \
    printf '%s\n' "- tailscale: up failed (see /tmp/tailscale-up.log)"
  # Copy logs to persistent workspace volume for debugging
  cp /tmp/tailscale-up.log "$OPENWORK_WORKSPACE/.tailscale-up.log" 2>/dev/null || true
  cp /tmp/tailscaled.log "$OPENWORK_WORKSPACE/.tailscaled.log" 2>/dev/null || true
else
  printf '%s\n' "- tailscale: TS_AUTHKEY unset, skipping"
fi

# --- built-in browser (Chromium via Xvfb + x11vnc for noVNC streaming) ---
# Xvfb provides a virtual X display; Chromium runs headful on it for full CDP
# and interactive control; x11vnc serves the display over VNC (TCP 5900) which
# the openwork-server proxies as a WebSocket for the in-app browser panel.
export DISPLAY=:99
Xvfb :99 -screen 0 1280x800x24 -ac +extension GLX +render -noreset &
XVFB_PID=$!
# Wait briefly for Xvfb to be ready
sleep 1
# Start compositor to ensure window contents are painted to X framebuffer
xcompmgr &
sleep 0.5

# Start Chromium (no --disable-gpu so it uses X11 rendering path)
chromium \
  --no-sandbox \
  --disable-gpu-compositing \
  --disable-dev-shm-usage \
  --disable-extensions \
  --disable-notifications \
  --no-first-run \
  --no-default-browser-check \
  --remote-debugging-port=9222 \
  --remote-debugging-address=127.0.0.1 \
  --window-size=1280,800 \
  --window-position=0,0 \
  --force-device-scale-factor=1 \
  --start-maximized \
  about:blank &
# Start x11vnc: listen on localhost only, no password, share across connections
x11vnc -display :99 -nopw -listen 127.0.0.1 -rfbport 5900 -forever -shared -noxdamage -wait 10 -defer 0 &
# websockify no longer needed - server.ts handles WS framing directly
printf '%s\n' "- browser: Xvfb :99 + Chromium + x11vnc ready"

# Rename default workspace to Portfolio after the server starts
(sleep 8 && OWPORT="${OPENWORK_PORT:-8787}" && WSID=$(curl -sf -H "Authorization: Bearer $OPENWORK_TOKEN" "http://127.0.0.1:$OWPORT/workspaces" | python3 -c "import sys,json;ws=json.load(sys.stdin).get('items',[]);print(ws[0]['id'] if ws else '')" 2>/dev/null) && [ -n "$WSID" ] && curl -sf -X PATCH -H "Authorization: Bearer $OPENWORK_HOST_TOKEN" -H "X-OpenWork-Host-Token: $OPENWORK_HOST_TOKEN" -H "Content-Type: application/json" -d '{"displayName":"Portfolio"}' "http://127.0.0.1:$OWPORT/workspaces/$WSID/display-name" >/dev/null 2>&1) &

# Navigate Chromium to portfolio.audette.io on startup
(sleep 12 && OWPORT="${OPENWORK_PORT:-8787}" && WSID=$(curl -sf -H "Authorization: Bearer $OPENWORK_TOKEN" "http://127.0.0.1:$OWPORT/workspaces" | python3 -c "import sys,json;ws=json.load(sys.stdin).get('items',[]);print(ws[0]['id'] if ws else '')" 2>/dev/null) && [ -n "$WSID" ] && curl -sf -X POST -H "Authorization: Bearer $OPENWORK_TOKEN" -H "Content-Type: application/json" -d '{"url":"https://portfolio.audette.io"}' "http://127.0.0.1:$OWPORT/workspace/$WSID/browser/navigate" >/dev/null 2>&1) &

# Auto-install Audette Skills and CRREM plugins into every workspace at startup
# Fetches plugin metadata + resolved memberships from den-api, builds the correct
# {plugin, memberships} body, and installs via openwork-server cloud-plugins API.
(sleep 15 && \
  OWPORT="${OPENWORK_PORT:-8787}" && \
  DEN_API="${SOAPBOX_DEN_API_URL:-https://api.admin.soapbox.build}" && \
  ORG_KEY="${SOAPBOX_OPENCODE_CONFIG_KEY:-}" && \
  [ -n "$ORG_KEY" ] && \
  WSID=$(curl -sf -H "Authorization: Bearer $OPENWORK_TOKEN" "http://127.0.0.1:$OWPORT/workspaces" | python3 -c "import sys,json;ws=json.load(sys.stdin).get('items',[]);print(ws[0]['id'] if ws else '')" 2>/dev/null) && \
  [ -n "$WSID" ] && \
  for PLUGIN_ID in plg_01kttctrteexzayvvtte2198am plg_01kttet2dqexzayyre0whxw5n4; do
    PLUGIN_META=$(curl -sf -H "x-api-key: $ORG_KEY" "$DEN_API/v1/plugins/$PLUGIN_ID" 2>/dev/null)
    PLUGIN_ITEMS=$(curl -sf -H "x-api-key: $ORG_KEY" "$DEN_API/v1/plugins/$PLUGIN_ID/resolved" 2>/dev/null)
    [ -n "$PLUGIN_META" ] && [ -n "$PLUGIN_ITEMS" ] && \
    BODY=$(python3 -c "
import sys,json,os
meta=json.loads(os.environ['PLUGIN_META']).get('item',{})
items=json.loads(os.environ['PLUGIN_ITEMS']).get('items',[])
ext=meta.get('extension',{})
body={
  'resolved':{
    'plugin':{'id':meta['id'],'name':ext.get('name') or meta.get('description') or meta['id'],'description':meta.get('description'),'updatedAt':meta.get('updatedAt')},
    'memberships':[{'configObjectId':i['configObjectId'],'configObject':i.get('configObject')} for i in items if i.get('configObjectId')]
  },
  'marketplaceId':'mkt_01ktb1fepmfan9y4p5xq9d7d25'
}
print(json.dumps(body))
" PLUGIN_META="$PLUGIN_META" PLUGIN_ITEMS="$PLUGIN_ITEMS" 2>/dev/null) && \
    [ -n "$BODY" ] && \
    curl -sf -X POST \
      -H "Authorization: Bearer $OPENWORK_TOKEN" \
      -H "Content-Type: application/json" \
      -d "$BODY" \
      "http://127.0.0.1:$OWPORT/workspace/$WSID/cloud-plugins" >/dev/null 2>&1 && \
    printf '%s\n' "- auto-installed plugin: $PLUGIN_ID"
  done
) &

# --- global opencode MCP servers (applies to all workspaces) ---
# Merge org-wide MCPs into the global opencode config on every boot (idempotent).
# Add new MCPs here; existing keys are overwritten with the latest config.
OPENCODE_GLOBAL_CONFIG_DIR="$XDG_CONFIG_HOME/opencode"
OPENCODE_GLOBAL_CONFIG="$OPENCODE_GLOBAL_CONFIG_DIR/opencode.jsonc"
SOAPBOX_MEMORY_API_KEY="${SOAPBOX_MEMORY_API_KEY:-hs_KbxDNoQUY1IiBrvhEbNEkHkO1mwedmj}"
mkdir -p "$OPENCODE_GLOBAL_CONFIG_DIR"
if command -v node >/dev/null 2>&1; then
  OPENCODE_GLOBAL_CONFIG="$OPENCODE_GLOBAL_CONFIG" \
  SOAPBOX_MEMORY_API_KEY="$SOAPBOX_MEMORY_API_KEY" \
  node -e '
    const fs=require("fs");
    const cfgPath=process.env.OPENCODE_GLOBAL_CONFIG;
    let cfg={};
    try{cfg=JSON.parse(fs.readFileSync(cfgPath,"utf8"));}catch(e){}
    if(!cfg.mcp) cfg.mcp={};
    cfg.mcp.audette={type:"remote",url:"https://mcp-server.prod.audette.io/mcp"};
    const memKey=process.env.SOAPBOX_MEMORY_API_KEY;
    if(memKey){
      cfg.mcp["soapbox-memory"]={type:"remote",url:"https://soapbox-memory-production.up.railway.app/mcp/",headers:{Authorization:"Bearer "+memKey}};
    }
    fs.writeFileSync(cfgPath,JSON.stringify(cfg,null,2));
  ' 2>/dev/null || true
  printf '%s\n' "- org MCPs seeded: audette, soapbox-memory"
else
  printf '{"mcp":{"audette":{"type":"remote","url":"https://mcp-server.prod.audette.io/mcp"}}}\n' > "$OPENCODE_GLOBAL_CONFIG"
  printf '%s\n' "- org MCP: audette seeded (node unavailable, soapbox-memory skipped)"
fi

exec openwork-server \
  --host 0.0.0.0 \
  --port "$OPENWORK_PORT" \
  --workspace "$OPENWORK_WORKSPACE" \
  --token "$OPENWORK_TOKEN" \
  --host-token "$OPENWORK_HOST_TOKEN" \
  --approval "$OPENWORK_APPROVAL_MODE" \
  --cors "$OPENWORK_CORS_ORIGINS" \
  --verbose
