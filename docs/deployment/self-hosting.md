# Self-Hosting

Run the full local stack:

```bash
cp .env.example .env
pnpm install
docker compose up --build
```

Services:

- Web: `http://localhost:5173`
- API: `http://localhost:4000`
- MinIO console: `http://localhost:9001`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

The API persists campaign state to SQLite at `storage/opentabletop.sqlite` by default. In Docker Compose this file lives in the `api-storage` volume. The API still starts PostgreSQL, Redis, and MinIO because those services are part of the target architecture and remain available for later storage, queue, and object-store work.

For local development without Docker:

```bash
pnpm --filter @open-tabletop/api dev
pnpm --filter @open-tabletop/web dev
```

The browser client sends the development session header `x-user-id: usr_demo_gm`. Direct API calls must include an authenticated user header:

```bash
curl -H "x-user-id: usr_demo_gm" http://localhost:4000/api/v1/campaigns
```

Campaign archives are JSON `.ottx` files. The import endpoint upserts every archive collection, including users, members, scenes, assets, tokens, actors, journals, encounters, combats, AI memory, audit logs, and permission grants.
