FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS base
WORKDIR /app
RUN corepack enable

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
COPY --from=build /app/api-build-fingerprint ./api-build-fingerprint
COPY apps/api/package.json ./apps/api/package.json
RUN mkdir -p /app/storage/plugins /app/uploads && chown -R node:node /app/storage /app/uploads
USER node
EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]
