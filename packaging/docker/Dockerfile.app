FROM node:22-bookworm-slim AS builder

# Declare build arguments for Vite environment variables
ARG VITE_DEN_BASE_URL
ARG VITE_DEN_API_BASE_URL
ARG VITE_DEN_REQUIRE_SIGNIN
ARG VITE_PREDEFINED_WORKER_ID
ARG VITE_OPENWORK_DEPLOYMENT

# Export them as environment variables for the build
ENV VITE_DEN_BASE_URL=$VITE_DEN_BASE_URL
ENV VITE_DEN_API_BASE_URL=$VITE_DEN_API_BASE_URL
ENV VITE_DEN_REQUIRE_SIGNIN=$VITE_DEN_REQUIRE_SIGNIN
ENV VITE_PREDEFINED_WORKER_ID=$VITE_PREDEFINED_WORKER_ID
ENV VITE_OPENWORK_DEPLOYMENT=$VITE_OPENWORK_DEPLOYMENT

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml /app/
COPY patches /app/patches
COPY packages/types/package.json /app/packages/types/package.json
COPY packages/ui/package.json /app/packages/ui/package.json
COPY apps/app/package.json /app/apps/app/package.json

RUN pnpm install --frozen-lockfile --filter @openwork/app...

COPY packages/types /app/packages/types
COPY packages/ui /app/packages/ui
COPY apps/app /app/apps/app

RUN pnpm --filter @openwork/app build:web

# Production stage - serve static files
FROM node:22-bookworm-slim

WORKDIR /app

# Install serve globally for static file serving
RUN npm install -g serve

# Copy built files from builder
COPY --from=builder /app/apps/app/dist /app/dist

EXPOSE 5173

# Serve the built files - Railway provides PORT env var
CMD sh -c "serve -s dist -l ${PORT:-5173}"
