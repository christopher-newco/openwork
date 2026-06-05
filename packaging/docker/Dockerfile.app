FROM node:22-bookworm-slim AS builder

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

# Serve the built files
CMD ["serve", "-s", "dist", "-l", "5173"]
