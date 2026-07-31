FROM node:26-alpine@sha256:e88a35be04478413b7c71c455cd9865de9b9360e1f43456be5951032d7ac1a66 AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile

FROM deps AS build
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm turbo run build --filter=@open-tabletop/web...

FROM nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10
COPY infra/docker/nginx.conf /etc/nginx/templates/default.conf.otte
COPY --chmod=755 infra/docker/render-web-nginx-config.sh /docker-entrypoint.d/15-render-otte-nginx-config.sh
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
