FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS base
WORKDIR /app
# Node.js 25+ no longer bundles Corepack, so install it explicitly.
RUN npm install -g corepack@0.36.0 && corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY plugins ./plugins
RUN pnpm install --frozen-lockfile

FROM deps AS build
RUN pnpm turbo run build --filter=@open-tabletop/worker...

FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=build /app/apps/worker/dist ./apps/worker/dist
COPY apps/worker/package.json ./apps/worker/package.json
USER node
CMD ["node", "apps/worker/dist/index.js"]
