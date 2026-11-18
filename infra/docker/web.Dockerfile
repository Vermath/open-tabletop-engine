FROM node:26-alpine@sha256:e88a35be04478413b7c71c455cd9865de9b9360e1f43456be5951032d7ac1a66 AS base
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
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm turbo run build --filter=@open-tabletop/web...

FROM nginx:1.29-alpine@sha256:5616878291a2eed594aee8db4dade5878cf7edcb475e59193904b198d9b830de
COPY infra/docker/nginx.conf /etc/nginx/templates/default.conf.otte
COPY --chmod=755 infra/docker/render-web-nginx-config.sh /docker-entrypoint.d/15-render-otte-nginx-config.sh
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
