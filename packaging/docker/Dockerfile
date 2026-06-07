FROM node:22-bookworm-slim

ARG OPENWORK_ORCHESTRATOR_VERSION=0.15.1

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    tar \
    unzip \
  && rm -rf /var/lib/apt/lists/*

RUN npm install -g "openwork-orchestrator@${OPENWORK_ORCHESTRATOR_VERSION}"

# Install the pinned OpenCode binary onto PATH.
# Workers are launched with `--opencode-source external`, which execs an
# `opencode` binary from PATH; the orchestrator npm package does not ship one,
# so without this the worker crash-loops on startup ("ERROR Run failed", exit 1)
# and never goes live. We resolve the exact OpenCode version the orchestrator
# pins (its constants.json) so the two stay in lockstep, then fetch the matching
# prebuilt binary (mirrors ee/apps/den-worker-runtime/scripts/install-opencode.mjs).
ARG OPENCODE_DOWNLOAD_BASE_URL=https://github.com/anomalyco/opencode/releases/download
RUN set -eux; \
  ORCH_DIR="$(npm root -g)/openwork-orchestrator"; \
  OPENCODE_VERSION="$(node -pe "require('${ORCH_DIR}/constants.json').opencodeVersion" | sed 's/^v//')"; \
  test -n "${OPENCODE_VERSION}"; \
  case "$(dpkg --print-architecture)" in \
    amd64) OPENCODE_ASSET="opencode-linux-x64-baseline.tar.gz" ;; \
    arm64) OPENCODE_ASSET="opencode-linux-arm64.tar.gz" ;; \
    *) echo "unsupported architecture: $(dpkg --print-architecture)" >&2; exit 1 ;; \
  esac; \
  curl -fsSL "${OPENCODE_DOWNLOAD_BASE_URL}/v${OPENCODE_VERSION}/${OPENCODE_ASSET}" -o /tmp/opencode.tar.gz; \
  mkdir -p /tmp/opencode; \
  tar -xzf /tmp/opencode.tar.gz -C /tmp/opencode; \
  OPENCODE_BIN="$(find /tmp/opencode -type f -name opencode | head -n1)"; \
  test -n "${OPENCODE_BIN}"; \
  install -m 0755 "${OPENCODE_BIN}" /usr/local/bin/opencode; \
  rm -rf /tmp/opencode /tmp/opencode.tar.gz; \
  opencode --version

# Persistent directories (mount volumes here on PaaS/SSH).
ENV OPENWORK_DATA_DIR=/data/openwork-orchestrator
ENV OPENWORK_SIDECAR_DIR=/data/sidecars

# The workspace is mounted from the host/volume.
ENV OPENWORK_WORKSPACE=/workspace

# OpenWork host contract surface.
EXPOSE 8787

# Optional: opencode-router health (only relevant if you enable the router).
EXPOSE 3005

# VOLUME ["/workspace", "/data"]  # Disabled for Railway - use Railway Volumes instead

# Defaults:
# - OpenWork server is published intentionally via --remote-access
# - OpenCode stays internal (127.0.0.1:4096)
# - OpenWork server proxies OpenCode via localhost
# - OpenCode Router disabled by default
CMD ["openwork", "serve", "--workspace", "/workspace", "--remote-access", "--openwork-port", "8787", "--opencode-host", "127.0.0.1", "--opencode-port", "4096", "--connect-host", "127.0.0.1", "--cors", "*", "--approval", "manual", "--no-opencode-router"]
