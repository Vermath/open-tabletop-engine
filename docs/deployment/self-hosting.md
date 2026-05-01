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

The API persists campaign state to SQLite at `storage/opentabletop.sqlite` by default. Uploaded map assets are stored under `uploads` by default. AI threads use `OTTE_AI_PROVIDER=local-echo` unless configured otherwise; `OTTE_AI_PROVIDER=codex-loopback` is available as a deterministic local Codex App Server adapter smoke test. In Docker Compose these paths live in the `api-storage` and `api-uploads` volumes. The API still starts PostgreSQL, Redis, and MinIO because those services are part of the target architecture and remain available for later storage, queue, and object-store work.

For local development without Docker:

```bash
pnpm --filter @open-tabletop/api dev
pnpm --filter @open-tabletop/web dev
```

Direct API calls must include an authenticated bearer session token:

```bash
OTTE_SESSION_TOKEN="$(curl -sS -X POST \
  -H "content-type: application/json" \
  --data '{"userId":"usr_demo_gm"}' \
  http://localhost:4000/api/v1/auth/login | jq -r .token)"

curl -H "Authorization: Bearer $OTTE_SESSION_TOKEN" http://localhost:4000/api/v1/campaigns
```

Campaign archives are JSON `.ottx` files. The import endpoint upserts every archive collection, including users, members, scenes, assets, tokens, actors, journals, encounters, combats, AI memory, audit logs, and permission grants. Uploaded local asset files are embedded as base64 archive `files` entries with size and `sha256` checksums; import validates and restores them under `OTTE_UPLOAD_DIR`.

Raw image uploads can be assigned directly to a scene background:

```bash
curl -X POST \
  -H "Authorization: Bearer $OTTE_SESSION_TOKEN" \
  -H "content-type: image/png" \
  -H "x-asset-name: vault.png" \
  --data-binary @vault.png \
  "http://localhost:4000/api/v1/campaigns/camp_demo/assets/upload?sceneId=scn_vault_entry&setAsBackground=true"
```
