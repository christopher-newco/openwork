FROM node:22-bookworm-slim

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

EXPOSE 5173

CMD ["pnpm", "--filter", "@openwork/app", "preview"]
