FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5 AS base
WORKDIR /app
# Node.js 25+ no longer bundles Corepack, so install it explicitly.
RUN npm install -g corepack@0.36.0 && corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY plugins ./plugins
COPY infra/docker/api.Dockerfile ./infra/docker/api.Dockerfile
RUN pnpm install --frozen-lockfile

FROM deps AS build
RUN pnpm turbo run build --filter=@open-tabletop/api...
RUN node --input-type=module -e "import { computeApiSourceFingerprint } from './apps/api/dist/build-fingerprint.js'; process.stdout.write(computeApiSourceFingerprint('/app'))" > /app/api-build-fingerprint

FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/packages ./packages
COPY --chown=node:node --from=build /app/plugins ./plugins
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/demo-art ./apps/api/demo-art
COPY --from=build /app/api-build-fingerprint ./api-build-fingerprint
COPY apps/api/package.json ./apps/api/package.json
RUN mkdir -p /app/storage/plugins /app/uploads && chown -R node:node /app/storage /app/uploads
USER node
EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]
