# Self-Hosting

Run the full local stack:

```bash
cp .env.example .env
pnpm install
docker compose up --build
```

If the default host ports are already in use, override them before starting Compose:

```bash
API_PORT=4480 \
WEB_PORT=5183 \
POSTGRES_PORT=55432 \
REDIS_PORT=56379 \
MINIO_API_PORT=9900 \
MINIO_CONSOLE_PORT=9901 \
VITE_API_URL=http://localhost:4480 \
docker compose up --build
```

Services:

- Web: `http://localhost:5173`
- API: `http://localhost:4000`
- MinIO console: `http://localhost:9001`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

The API persists campaign state to SQLite at `storage/opentabletop.sqlite` by default. Local non-Docker API runs store uploaded map assets under `OTTE_UPLOAD_DIR` unless `OTTE_ASSET_STORAGE=s3` is configured. Docker Compose defaults uploaded assets to MinIO with bucket `opentabletop-assets`, endpoint `http://minio:9000`, and path-style S3 access. The SQLite file lives in the `api-storage` volume; the `api-uploads` volume remains available for local-storage fallback. AI threads use `OTTE_AI_PROVIDER=local-echo` unless configured otherwise. `OTTE_AI_PROVIDER=codex-loopback` is available as a deterministic local Codex App Server adapter smoke test. `OTTE_AI_PROVIDER=openai-responses` enables the OpenAI Responses API adapter and requires `OPENAI_API_KEY`; optional provider settings are `OPENAI_MODEL`, `OPENAI_BASE_URL`, `OPENAI_ORGANIZATION`, and `OPENAI_PROJECT`.

The worker app can process a single JSON job from stdin against a running API:

```bash
OTTE_API_URL=http://127.0.0.1:4000 OTTE_USER_ID=usr_demo_gm pnpm --filter @open-tabletop/worker exec tsx src/index.ts < job.json
```

Supported worker job types are `campaign.export`, `campaign.import`, `ai.memory.extract`, and `ai.session.recap`. Use `OTTE_SESSION_TOKEN` for bearer-session auth in production-like runs; `OTTE_USER_ID` is available for local compatibility with the API's development auth path.

Asset storage configuration:

```bash
OTTE_ASSET_STORAGE=s3
OTTE_S3_ENDPOINT=http://minio:9000
OTTE_S3_BUCKET=opentabletop-assets
OTTE_S3_REGION=us-east-1
OTTE_S3_ACCESS_KEY_ID=opentabletop
OTTE_S3_SECRET_ACCESS_KEY=opentabletop-dev
OTTE_S3_FORCE_PATH_STYLE=true
```

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

Campaign archives are JSON `.ottx` files. The import endpoint upserts every archive collection, including users, members, scenes, assets, tokens, actors, journals, encounters, combats, AI memory, audit logs, and permission grants. Uploaded asset files are embedded as base64 archive `files` entries with size and `sha256` checksums; import validates and restores them through the active asset storage provider.

Raw image uploads can be assigned directly to a scene background:

```bash
curl -X POST \
  -H "Authorization: Bearer $OTTE_SESSION_TOKEN" \
  -H "content-type: image/png" \
  -H "x-asset-name: vault.png" \
  --data-binary @vault.png \
  "http://localhost:4000/api/v1/campaigns/camp_demo/assets/upload?sceneId=scn_vault_entry&setAsBackground=true"
```
