# REST API

The API is served from `apps/api` and exposes:

Authenticated endpoints require a bearer session token. Create one with `POST /api/v1/auth/login`, then send `Authorization: Bearer <token>` on REST requests. The seeded local users are `usr_demo_gm` and `usr_demo_player`. The legacy `x-user-id` header remains available for local test compatibility, but the browser client and documented flows use bearer sessions. Asset blob and realtime URLs accept `sessionToken=<token>` for contexts that cannot set an `Authorization` header.

- `GET /api/v1/health`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/session`
- `GET /api/v1/openapi.json`
- `GET|POST /api/v1/campaigns`
- `GET|PATCH|DELETE /api/v1/campaigns/{campaignId}`
- `GET /api/v1/campaigns/{campaignId}/members`
- `GET|POST /api/v1/campaigns/{campaignId}/scenes`
- `GET|POST /api/v1/campaigns/{campaignId}/assets`
- `POST /api/v1/campaigns/{campaignId}/assets/upload`
- `GET /api/v1/assets/{assetId}/blob`
- `GET|PATCH|DELETE /api/v1/scenes/{sceneId}`
- `POST /api/v1/scenes/{sceneId}/fog`
- `POST /api/v1/scenes/{sceneId}/walls`
- `POST /api/v1/scenes/{sceneId}/lights`
- `GET|POST /api/v1/scenes/{sceneId}/tokens`
- `PATCH|DELETE /api/v1/tokens/{tokenId}`
- `GET|POST /api/v1/campaigns/{campaignId}/actors`
- `PATCH /api/v1/actors/{actorId}`
- `GET|POST /api/v1/campaigns/{campaignId}/items`
- `GET|POST /api/v1/campaigns/{campaignId}/journal`
- `PATCH /api/v1/journal/{entryId}`
- `POST /api/v1/dice/roll`
- `GET|POST /api/v1/chat/messages`
- `GET|POST /api/v1/campaigns/{campaignId}/encounters`
- `GET|POST /api/v1/campaigns/{campaignId}/combats`
- `GET|POST /api/v1/campaigns/{campaignId}/proposals`
- `POST /api/v1/proposals/{proposalId}/approve`
- `POST /api/v1/proposals/{proposalId}/apply`
- `POST /api/v1/campaigns/{campaignId}/ai/threads`
- `POST /api/v1/campaigns/{campaignId}/ai/encounter-design`
- `POST /api/v1/campaigns/{campaignId}/ai/session-recap`
- `GET|POST /api/v1/campaigns/{campaignId}/ai/memory`
- `POST /api/v1/ai/memory/{factId}/approve`
- `GET|POST /api/v1/plugins`
- `GET /api/v1/campaigns/{campaignId}/plugins`
- `POST /api/v1/campaigns/{campaignId}/plugins/{pluginId}/install`
- `POST /api/v1/campaigns/{campaignId}/plugins/{pluginId}/chat-command`
- `GET|POST /api/v1/systems`
- `GET /api/v1/campaigns/{campaignId}/systems`
- `POST /api/v1/campaigns/{campaignId}/systems/{systemId}/install`
- `GET /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/sheet`
- `POST /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/roll`
- `GET /api/v1/campaigns/{campaignId}/export`
- `POST /api/v1/import/campaign`

Plugin runtime endpoints are campaign-scoped. Installing a plugin creates a `permissionGrants` record for `subjectType: "plugin"`; command execution checks the human caller's permission and the plugin grant before the plugin can post chat or read token context.

System runtime endpoints are campaign-scoped. The generic fantasy runtime can summarize an actor sheet and produce quick-roll dice formulas from actor data, posting the resulting roll into chat.

AI thread requests use the configured provider from `OTTE_AI_PROVIDER`. The default `local-echo` provider is offline and deterministic; `codex-loopback` exercises the Codex App Server provider path against a local loopback transport. Provider requests receive campaign context filtered through the caller's actual permissions, and assistant responses are persisted into chat as `public` for player-visible context or `gm_only` when the caller can read GM AI memory. Chat reads filter `gm_only` and `whisper` messages per viewer.

Proposal approval is a two-step flow: `POST /api/v1/proposals/{proposalId}/approve` marks a pending proposal as approved, and `POST /api/v1/proposals/{proposalId}/apply` mutates campaign state only after approval. Applying a pending proposal returns `409`. `POST /api/v1/ai/memory/{factId}/approve` marks queued AI memory as approved.

Create a session token:

```bash
curl -X POST \
  -H "content-type: application/json" \
  --data '{"userId":"usr_demo_gm"}' \
  "http://localhost:4000/api/v1/auth/login"
```

Map upload accepts raw image bytes with an authenticated bearer token:

```bash
curl -X POST \
  -H "Authorization: Bearer $OTTE_SESSION_TOKEN" \
  -H "content-type: image/png" \
  -H "x-asset-name: vault.png" \
  --data-binary @vault.png \
  "http://localhost:4000/api/v1/campaigns/camp_demo/assets/upload?sceneId=scn_vault_entry&setAsBackground=true"
```

Uploaded assets are stored under `OTTE_UPLOAD_DIR`, checksummed as `sha256`, recorded as `MapAsset` rows, and served through `GET /api/v1/assets/{assetId}/blob?sessionToken=<token>`.

Scene layer authoring is split into focused endpoints. Fog reveal uses `token.reveal`; wall and light creation use `scene.update` and return the updated scene for realtime rebroadcast.

`POST /api/v1/import/campaign` accepts either a raw `.ottx` archive or:

```json
{
  "archive": {},
  "mode": "upsert"
}
```

The default `upsert` mode replaces records with matching ids and inserts missing records, which supports round-tripping a campaign into a fresh instance or refreshing an existing imported campaign. Use `reject_conflicts` to return `409` when imported ids already exist.

Archives include uploaded local asset files in a top-level `files` array. Each entry stores base64 data plus size and `sha256` checksum metadata. Import validates the asset id, size, and checksum before restoring the file under `OTTE_UPLOAD_DIR`, so uploaded map backgrounds can round-trip into a fresh instance.

Realtime clients connect to:

```text
ws://localhost:4000/api/v1/realtime?campaignId=camp_demo&sessionToken=<token>
```
