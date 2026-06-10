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

# --- built-in browser (Chromium via Xvfb + x11vnc for noVNC streaming) ---
# Xvfb provides a virtual X display; Chromium runs headful on it for full CDP
# and interactive control; x11vnc serves the display over VNC (TCP 5900) which
# the openwork-server proxies as a WebSocket for the in-app browser panel.
export DISPLAY=:99
Xvfb :99 -screen 0 1280x800x24 -ac +extension GLX +render -noreset &
XVFB_PID=$!
# Wait briefly for Xvfb to be ready
sleep 1
# Start Chromium in non-headless mode (needed for xvfb capture)
chromium \
  --no-sandbox \
  --disable-gpu \
  --use-gl=swiftshader \
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
x11vnc -display :99 -nopw -listen 127.0.0.1 -rfbport 5900 -forever -shared -noxdamage -noscr -repeat -speeds modem &
# websockify bridges WebSocket on 5901 to raw VNC on 5900
websockify 127.0.0.1:5901 127.0.0.1:5900 &
printf '%s\n' "- browser: Xvfb :99 + Chromium + x11vnc ready"

# Rename default workspace to Portfolio after the server starts
(sleep 8 && WS_ID=$(curl -sf -H "Authorization: Bearer $OPENWORK_TOKEN" \\
    "http://127.0.0.1:${OPENWORK_PORT:-8787}/workspaces" | \\
    python3 -c "import sys,json;ws=json.load(sys.stdin).get('items',[]);print(ws[0]['id'] if ws else '')" 2>/dev/null) && \\
  [ -n "$WS_ID" ] && curl -sf -X PATCH \\
    -H "Authorization: Bearer $OPENWORK_HOST_TOKEN" -H "X-OpenWork-Host-Token: $OPENWORK_HOST_TOKEN" \\
    -H "Content-Type: application/json" -d '{"displayName":"Portfolio"}' \\
    "http://127.0.0.1:${OPENWORK_PORT:-8787}/workspaces/$WS_ID/display-name" >/dev/null 2>&1) &

# Navigate Chromium to portfolio.audette.io on startup
(sleep 10 && curl -sf "http://127.0.0.1:9222/json" >/dev/null 2>&1 && \
  TARGET_ID=$(curl -sf "http://127.0.0.1:9222/json" | python3 -c \
    "import sys,json;pages=[t for t in json.load(sys.stdin) if t.get('type')=='page'];print(pages[0]['id'] if pages else '')" 2>/dev/null) && \
  [ -n "$TARGET_ID" ] && curl -sf -X POST \
    "http://127.0.0.1:9222/json/runtime/evaluate" \
    --data-raw "$(python3 -c \"import json;print(json.dumps({'id':1,'method':'Page.navigate','params':{'url':'https://portfolio.audette.io'}}))\")" \
    "http://127.0.0.1:9222/json/activate/$TARGET_ID" >/dev/null 2>&1 ; \
  curl -sf "http://127.0.0.1:${OPENWORK_PORT:-8787}/workspace/$(curl -sf -H \"Authorization: Bearer $OPENWORK_TOKEN\" \"http://127.0.0.1:${OPENWORK_PORT:-8787}/workspaces\" | python3 -c \"import sys,json;ws=json.load(sys.stdin).get('items',[]);print(ws[0]['id'] if ws else '')\" 2>/dev/null)/browser/navigate" \
    -X POST -H "Authorization: Bearer $OPENWORK_TOKEN" -H "Content-Type: application/json" \
    -d '{"url":"https://portfolio.audette.io"}' >/dev/null 2>&1) &

# --- global opencode MCP servers (applies to all workspaces) ---
# Write org-wide MCP entries into the global opencode config before the server
# starts. Seeded on every boot so additions here are always in effect.
OPENCODE_GLOBAL_CONFIG_DIR="$XDG_CONFIG_HOME/opencode"
OPENCODE_GLOBAL_CONFIG="$OPENCODE_GLOBAL_CONFIG_DIR/opencode.jsonc"
mkdir -p "$OPENCODE_GLOBAL_CONFIG_DIR"
# Only write if the file does not yet contain the audette entry.
if ! grep -q '"audette"' "$OPENCODE_GLOBAL_CONFIG" 2>/dev/null; then
  EXISTING=""
  if [ -f "$OPENCODE_GLOBAL_CONFIG" ]; then
    EXISTING=$(cat "$OPENCODE_GLOBAL_CONFIG")
  fi
  if [ -z "$EXISTING" ] || [ "$EXISTING" = "{}" ]; then
    printf '{"mcp":{"audette":{"type":"remote","url":"https://mcp-server.prod.audette.io/mcp"}}}
'       > "$OPENCODE_GLOBAL_CONFIG"
  else
    # File exists with other content — append the mcp block by rewriting.
    # Use a simple approach: inject audette into whatever is already there via a
    # temporary node/bun one-liner if available, otherwise overwrite safely.
    if command -v node >/dev/null 2>&1; then
      node -e "
        const fs=require('fs');
        let cfg={};
        try{cfg=JSON.parse(fs.readFileSync('$OPENCODE_GLOBAL_CONFIG','utf8'));}catch(e){}
        if(!cfg.mcp) cfg.mcp={};
        cfg.mcp.audette={type:'remote',url:'https://mcp-server.prod.audette.io/mcp'};
        fs.writeFileSync('$OPENCODE_GLOBAL_CONFIG',JSON.stringify(cfg,null,2));
      " 2>/dev/null || true
    fi
  fi
  printf '%s
' "- org MCP: audette seeded in global opencode config"
else
  printf '%s
' "- org MCP: audette already present in global opencode config"
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
