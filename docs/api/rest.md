# REST API

The API is served from `apps/api` and exposes:

Authenticated endpoints require an `x-user-id` session header. The seeded local GM user is `usr_demo_gm`.

- `GET /api/v1/health`
- `GET /api/v1/auth/session`
- `GET /api/v1/openapi.json`
- `GET|POST /api/v1/campaigns`
- `GET|PATCH|DELETE /api/v1/campaigns/{campaignId}`
- `GET|POST /api/v1/campaigns/{campaignId}/scenes`
- `GET|POST /api/v1/campaigns/{campaignId}/assets`
- `GET|PATCH|DELETE /api/v1/scenes/{sceneId}`
- `POST /api/v1/scenes/{sceneId}/fog`
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
- `GET|POST /api/v1/systems`
- `GET /api/v1/campaigns/{campaignId}/export`
- `POST /api/v1/import/campaign`

`POST /api/v1/import/campaign` accepts either a raw `.ottx` archive or:

```json
{
  "archive": {},
  "mode": "upsert"
}
```

The default `upsert` mode replaces records with matching ids and inserts missing records, which supports round-tripping a campaign into a fresh instance or refreshing an existing imported campaign. Use `reject_conflicts` to return `409` when imported ids already exist.

Realtime clients connect to:

```text
ws://localhost:4000/api/v1/realtime?campaignId=camp_demo
```
