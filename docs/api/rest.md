# REST API

The API is served from `apps/api` and exposes:

Authenticated endpoints require a bearer session token. Create one with `POST /api/v1/auth/login` or `POST /api/v1/auth/register`, then send `Authorization: Bearer <token>` on REST requests. Password-backed users authenticate by email and password. The seeded local users are `usr_demo_gm` and `usr_demo_player`; they remain passwordless for local test compatibility. The legacy `x-user-id` header is disabled outside tests unless `OTTE_ALLOW_LEGACY_USER_HEADER=true` is set. Asset blob and realtime URLs accept `sessionToken=<token>` for contexts that cannot set an `Authorization` header.

OIDC SSO is enabled when `OTTE_OIDC_ISSUER` and `OTTE_OIDC_CLIENT_ID` are set. The API discovers the provider metadata, starts an authorization-code flow with PKCE/state/nonce, exchanges the callback code, reads the OIDC userinfo endpoint, links an existing user by normalized email when possible, and issues the same opaque `ots_` bearer session token used by password login. Production return origins should be set with `OTTE_WEB_ORIGIN` or `OTTE_OIDC_ALLOWED_RETURN_ORIGINS`; localhost return origins are allowed for development.

- `GET /api/v1/health`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/session`
- `POST /api/v1/auth/password-reset/request`
- `POST /api/v1/auth/password-reset/confirm`
- `POST /api/v1/auth/password/change`
- `GET /api/v1/auth/sessions`
- `DELETE /api/v1/auth/sessions/{sessionId}`
- `GET /api/v1/auth/oidc/config`
- `GET|POST /api/v1/auth/oidc/start`
- `GET /api/v1/auth/oidc/callback`
- `GET /api/v1/admin/users`
- `PATCH /api/v1/admin/users/{userId}`
- `POST /api/v1/admin/users/{userId}/password-reset`
- `DELETE /api/v1/admin/users/{userId}/sessions`
- `GET /api/v1/admin/sessions`
- `DELETE /api/v1/admin/sessions/{sessionId}`
- `GET /api/v1/admin/email-outbox`
- `GET /api/v1/admin/audit-logs`
- `GET /api/v1/admin/assets/storage`
- `POST /api/v1/admin/assets/migrate`
- `POST /api/v1/admin/assets/cleanup`
- `GET /api/v1/openapi.json`
- `GET|POST /api/v1/campaigns`
- `GET|PATCH|DELETE /api/v1/campaigns/{campaignId}`
- `GET /api/v1/campaigns/{campaignId}/members`
- `GET|POST /api/v1/campaigns/{campaignId}/invites`
- `POST /api/v1/invites/accept`
- `POST /api/v1/invites/{inviteId}/revoke`
- `GET|POST /api/v1/campaigns/{campaignId}/scenes`
- `GET|POST /api/v1/campaigns/{campaignId}/assets`
- `GET /api/v1/campaigns/{campaignId}/assets/storage`
- `POST /api/v1/campaigns/{campaignId}/assets/upload`
- `GET /api/v1/assets/{assetId}/blob`
- `POST /api/v1/assets/{assetId}/delivery-url`
- `PATCH /api/v1/assets/{assetId}/lifecycle`
- `GET|PATCH|DELETE /api/v1/scenes/{sceneId}`
- `GET /api/v1/scenes/{sceneId}/vision`
- `POST /api/v1/scenes/{sceneId}/fog`
- `DELETE /api/v1/scenes/{sceneId}/fog/{fogId}`
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
- `POST /api/v1/campaigns/{campaignId}/ai/memory/extract`
- `GET /api/v1/campaigns/{campaignId}/ai/tool-calls`
- `POST /api/v1/ai/memory/{factId}/approve`
- `GET|POST /api/v1/plugins`
- `GET /api/v1/campaigns/{campaignId}/plugins`
- `POST /api/v1/campaigns/{campaignId}/plugins/{pluginId}/install`
- `POST /api/v1/campaigns/{campaignId}/plugins/{pluginId}/chat-command`
- `GET|POST /api/v1/systems`
- `GET /api/v1/campaigns/{campaignId}/systems`
- `POST /api/v1/campaigns/{campaignId}/systems/{systemId}/install`
- `GET /api/v1/campaigns/{campaignId}/systems/{systemId}/compendium`
- `POST /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/compendium`
- `POST /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/conditions`
- `DELETE /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/conditions/{conditionId}`
- `GET /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/sheet`
- `POST /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/roll`
- `GET /api/v1/campaigns/{campaignId}/export`
- `POST /api/v1/import/campaign`

Plugin runtime endpoints are campaign-scoped. `GET /api/v1/plugins` returns manifest-loaded local packages with source metadata, sandbox mode, and server-entrypoint checksums. `POST /api/v1/plugins` registers an additional package by `packagePath` under the configured plugin root. Installing a plugin creates or updates a `permissionGrants` record for `subjectType: "plugin"`; callers may grant all requested permissions or a subset for review. Command execution checks the human caller's permission and the plugin grant before the plugin can post chat or read token context, then runs the manifest-declared server command in the VM sandbox.

System runtime endpoints are campaign-scoped. The generic fantasy runtime exposes a small compendium of items, spells, and conditions; can add compendium entries to actors; can apply and remove actor conditions; can summarize actor sheets with inventory and spells; and can produce condition-aware quick-roll dice formulas, posting the resulting roll into chat.

AI thread requests use the configured provider from `OTTE_AI_PROVIDER`. The default `local-echo` provider is offline and deterministic; `codex-loopback` exercises the Codex App Server provider path against a local loopback transport; `openai-responses` uses the OpenAI Responses API with `OPENAI_API_KEY`, optional `OPENAI_MODEL`, `OPENAI_BASE_URL`, `OPENAI_ORGANIZATION`, and `OPENAI_PROJECT`. Provider requests receive campaign context filtered through the caller's actual permissions, including visible journals, memory, actors, scenes, and encounters. Assistant responses are persisted into chat as `public` for player-visible context or `gm_only` when the caller can read GM AI memory. Chat reads filter `gm_only` and `whisper` messages per viewer. Providers receive typed tool schemas for `create_proposal`, `draft_encounter`, `create_memory`, `roll_dice`, and `read_compendium`. The API enforces each tool's human-caller permission before execution, records started/completed tool lifecycle events, queues proposal and memory mutations for GM review, and exposes GM-facing tool-call observability through `GET /api/v1/campaigns/{campaignId}/ai/tool-calls`. `POST /api/v1/campaigns/{campaignId}/ai/memory/extract` runs provider-backed memory extraction from supplied or recent campaign text, requires `ai.proposeChanges`, and creates a pending memory fact for GM review.

Proposal approval is a two-step flow: `POST /api/v1/proposals/{proposalId}/approve` marks a pending proposal as approved, and `POST /api/v1/proposals/{proposalId}/apply` mutates campaign state only after approval. Applying a pending proposal returns `409`. `POST /api/v1/ai/memory/{factId}/approve` marks queued AI memory as approved.

Scene vision requests return the same permission-filtered polygons used by token visibility checks. Players receive revealed fog polygons, owned-token vision polygons, hide/erase fog polygons, and wall-clipped colored light polygons when fog is active; GM-capable users receive unmasked lighting polygons with `fogActive: false`. Fog authoring accepts circle regions or `shape: "polygon"` with `points`, plus `mode: "reveal" | "hide"` for reveal and erase brushes. Wall authoring accepts `kind: "wall" | "terrain"` and optional `blocksMovement`; light authoring accepts `color` and `intensity`.

Create a session token:

```bash
curl -X POST \
  -H "content-type: application/json" \
  --data '{"userId":"usr_demo_gm"}' \
  "http://localhost:4000/api/v1/auth/login"
```

Register a password user:

```bash
curl -X POST \
  -H "content-type: application/json" \
  --data '{"email":"player@example.com","displayName":"New Player","password":"replace-this-password"}' \
  "http://localhost:4000/api/v1/auth/register"
```

Request and confirm a password reset. The request response is always `{ "ok": true }` so callers cannot enumerate accounts by email. When `OTTE_EMAIL_WEBHOOK_URL` is set, the API posts the queued email payload to that webhook; otherwise the message stays in the admin outbox as `pending`.

```bash
curl -X POST \
  -H "content-type: application/json" \
  --data '{"email":"player@example.com"}' \
  "http://localhost:4000/api/v1/auth/password-reset/request"

curl -X POST \
  -H "content-type: application/json" \
  --data '{"token":"opr_...","password":"replace-this-password"}' \
  "http://localhost:4000/api/v1/auth/password-reset/confirm"
```

Change the current user's password and manage their active sessions:

```bash
curl -X POST \
  -H "Authorization: Bearer $OTTE_SESSION_TOKEN" \
  -H "content-type: application/json" \
  --data '{"currentPassword":"old-password","newPassword":"new-password"}' \
  "http://localhost:4000/api/v1/auth/password/change"

curl -H "Authorization: Bearer $OTTE_SESSION_TOKEN" \
  "http://localhost:4000/api/v1/auth/sessions"

curl -X DELETE \
  -H "Authorization: Bearer $OTTE_SESSION_TOKEN" \
  "http://localhost:4000/api/v1/auth/sessions/sess_..."
```

Server administrators are the user ids listed in `OTTE_ADMIN_USER_IDS`. Admin endpoints can list/update users, require password resets, disable accounts, revoke sessions, inspect the email outbox, and export redacted audit logs for account/session operations:

```bash
curl -H "Authorization: Bearer $OTTE_ADMIN_SESSION_TOKEN" \
  "http://localhost:4000/api/v1/admin/users"

curl -X PATCH \
  -H "Authorization: Bearer $OTTE_ADMIN_SESSION_TOKEN" \
  -H "content-type: application/json" \
  --data '{"disabled":true,"disabledReason":"left the table"}' \
  "http://localhost:4000/api/v1/admin/users/usr_demo_player"

curl -X POST \
  -H "Authorization: Bearer $OTTE_ADMIN_SESSION_TOKEN" \
  "http://localhost:4000/api/v1/admin/users/usr_demo_player/password-reset"

curl -X DELETE \
  -H "Authorization: Bearer $OTTE_ADMIN_SESSION_TOKEN" \
  "http://localhost:4000/api/v1/admin/users/usr_demo_player/sessions"

curl -H "Authorization: Bearer $OTTE_ADMIN_SESSION_TOKEN" \
  "http://localhost:4000/api/v1/admin/audit-logs?action=admin.user.update&format=json"

curl -H "Authorization: Bearer $OTTE_ADMIN_SESSION_TOKEN" \
  "http://localhost:4000/api/v1/admin/audit-logs?format=ndjson&actorUserId=usr_demo_gm" \
  -o opentabletop-audit.ndjson
```

Invite a player and accept the invite:

```bash
curl -X POST \
  -H "Authorization: Bearer $OTTE_SESSION_TOKEN" \
  -H "content-type: application/json" \
  --data '{"email":"player@example.com","role":"player","expiresInDays":14}' \
  "http://localhost:4000/api/v1/campaigns/camp_demo/invites"

curl -X POST \
  -H "content-type: application/json" \
  --data '{"token":"oti_...","email":"player@example.com","displayName":"New Player","password":"replace-this-password"}' \
  "http://localhost:4000/api/v1/invites/accept"
```

Invite and password-reset tokens are returned only once and are stored hashed in engine state. Listing invites returns metadata and status without the token hash. Admin audit exports accept `campaignId`, `actorUserId`, `actorType`, `action`, `targetType`, `targetId`, `since`, `until`, `limit`, and `format=json|ndjson` query filters. Campaign exports omit operational sessions, OIDC identities, OAuth login states, invite records, password reset records, email outbox records, and user password hashes.

Password reset and admin environment variables:

| Variable | Required | Purpose |
| --- | --- | --- |
| `OTTE_ADMIN_USER_IDS` | no | Comma-separated user ids allowed to call `/api/v1/admin/*`. |
| `OTTE_PASSWORD_RESET_URL` | no | Reset form URL. The API appends `token=<opr_token>`. Falls back to `${OTTE_WEB_ORIGIN}/reset-password` when set. |
| `OTTE_PASSWORD_RESET_TTL_MINUTES` | no | Reset token lifetime, clamped from 5 minutes to 24 hours. Defaults to 60 minutes. |
| `OTTE_EMAIL_WEBHOOK_URL` | no | HTTP endpoint that receives queued email payloads as JSON. Without it, messages stay pending in the outbox. |
| `OTTE_EMAIL_WEBHOOK_TOKEN` | no | Bearer token sent to the email webhook. |
| `OTTE_EMAIL_WEBHOOK_TIMEOUT_MS` | no | Email webhook timeout, clamped from 500 ms to 30000 ms. Defaults to 5000 ms. |
| `OTTE_ALLOW_LEGACY_USER_HEADER` | no | Set to `true` only for compatibility tooling that still needs `x-user-id` outside tests. |

Start an OIDC SSO login:

```bash
curl -X POST \
  -H "content-type: application/json" \
  --data '{"returnTo":"http://localhost:5173/"}' \
  "http://localhost:4000/api/v1/auth/oidc/start"
```

The response contains an `authorizationUrl` for the browser redirect. `GET /api/v1/auth/oidc/start?returnTo=...` performs the redirect directly. The provider callback lands on `GET /api/v1/auth/oidc/callback`; when the original login included a `returnTo`, the API redirects back with `#ssoToken=<ots_token>&ssoUserId=<user_id>`, and the web client stores that bearer session.

OIDC environment variables:

| Variable | Required | Purpose |
| --- | --- | --- |
| `OTTE_OIDC_ISSUER` | yes | HTTPS issuer URL. Localhost HTTP is allowed for development; other HTTP issuers require `OTTE_OIDC_ALLOW_INSECURE=true`. |
| `OTTE_OIDC_CLIENT_ID` | yes | OAuth/OIDC client id. |
| `OTTE_OIDC_CLIENT_SECRET` | no | Client secret for confidential clients. |
| `OTTE_OIDC_REDIRECT_URI` | no | Callback URL. Defaults to the request base URL plus `/api/v1/auth/oidc/callback`. |
| `OTTE_OIDC_SCOPE` | no | Defaults to `openid email profile`. |
| `OTTE_OIDC_DISPLAY_NAME` | no | Human label returned by the config endpoint and shown in clients. |
| `OTTE_OIDC_TOKEN_AUTH` | no | `client_secret_basic`, `client_secret_post`, or `none`; defaults to `client_secret_basic` when a secret is present, otherwise `none`. |
| `OTTE_WEB_ORIGIN` | no | Primary allowed browser return origin. |
| `OTTE_OIDC_ALLOWED_RETURN_ORIGINS` | no | Comma-separated extra allowed return origins. |

Map upload accepts raw image bytes with an authenticated bearer token:

```bash
curl -X POST \
  -H "Authorization: Bearer $OTTE_SESSION_TOKEN" \
  -H "content-type: image/png" \
  -H "x-asset-name: vault.png" \
  --data-binary @vault.png \
  "http://localhost:4000/api/v1/campaigns/camp_demo/assets/upload?sceneId=scn_vault_entry&setAsBackground=true"
```

Uploaded assets are scanned by `builtin-asset-scanner` before storage writes. EICAR test signatures, active SVG content, executable/script uploads, and HTML uploads return `422 asset_security_blocked` with scanner findings and do not create an asset record. Clean uploads store scan metadata on `MapAsset.security`, are checksummed as `sha256`, recorded as `MapAsset` rows with a `storage.provider` of `local` or `s3`, and served through `GET /api/v1/assets/{assetId}/blob?sessionToken=<token>`. Local development stores bytes under `OTTE_UPLOAD_DIR`; Docker Compose stores them in the configured MinIO/S3 bucket by default. `OTTE_ASSET_QUOTA_BYTES` enforces a per-campaign byte quota for active or archived assets.

For CDN or browser contexts that should not carry a bearer token, request a signed delivery URL. The signed URL targets the same blob route, expires automatically, and uses `OTTE_ASSET_CDN_BASE_URL` when configured:

```bash
curl -X POST \
  -H "Authorization: Bearer $OTTE_SESSION_TOKEN" \
  -H "content-type: application/json" \
  --data '{"expiresInSeconds":300,"disposition":"inline"}' \
  "http://localhost:4000/api/v1/assets/asset_.../delivery-url"
```

Inspect campaign storage usage and update asset lifecycle state:

```bash
curl -H "Authorization: Bearer $OTTE_SESSION_TOKEN" \
  "http://localhost:4000/api/v1/campaigns/camp_demo/assets/storage"

curl -X PATCH \
  -H "Authorization: Bearer $OTTE_SESSION_TOKEN" \
  -H "content-type: application/json" \
  --data '{"status":"deleted","reason":"cleanup"}' \
  "http://localhost:4000/api/v1/assets/asset_.../lifecycle"
```

Lifecycle status is `active`, `archived`, or `deleted`. Deleted and expired assets return `410` from blob delivery but remain represented in storage stats and archives for operational audit. Server admins can inspect global asset storage with `GET /api/v1/admin/assets/storage`.

Server admins can also run storage migration and object cleanup operations. Migration reads existing asset bytes, verifies size/checksum, and writes the object through the currently configured asset storage provider. Cleanup physically deletes stored bytes for deleted or expired assets after the configured grace period while preserving the metadata row:

```bash
curl -X POST \
  -H "Authorization: Bearer $OTTE_ADMIN_SESSION_TOKEN" \
  -H "content-type: application/json" \
  --data '{"campaignId":"camp_demo","dryRun":true}' \
  "http://localhost:4000/api/v1/admin/assets/migrate"

curl -X POST \
  -H "Authorization: Bearer $OTTE_ADMIN_SESSION_TOKEN" \
  -H "content-type: application/json" \
  --data '{"campaignId":"camp_demo","includeExpired":true,"graceDays":7}' \
  "http://localhost:4000/api/v1/admin/assets/cleanup"
```

Asset delivery environment variables:

| Variable | Required | Purpose |
| --- | --- | --- |
| `OTTE_ASSET_QUOTA_BYTES` | no | Per-campaign quota for active and archived asset bytes. |
| `OTTE_ASSET_RETENTION_DAYS` | no | Optional default expiry assigned to newly created assets. |
| `OTTE_ASSET_CDN_BASE_URL` | no | Base URL used when generating signed asset delivery URLs, usually the CDN origin. |
| `OTTE_ASSET_URL_SIGNING_SECRET` | production | HMAC secret for signed asset URLs. Required when `NODE_ENV=production`. |
| `OTTE_ASSET_URL_TTL_SECONDS` | no | Default signed URL lifetime. Defaults to 300 seconds. |
| `OTTE_ASSET_URL_MAX_TTL_SECONDS` | no | Maximum caller-requested signed URL lifetime. Defaults to 3600 seconds. |
| `OTTE_ASSET_CLEANUP_GRACE_DAYS` | no | Default grace period before admin cleanup jobs physically remove deleted or expired asset bytes. Defaults to 0 for API calls and 7 in Docker Compose. |

Scene layer authoring is split into focused endpoints. Fog reveal uses `token.reveal`; wall and light creation use `scene.update` and return the updated scene for realtime rebroadcast.

`POST /api/v1/import/campaign` accepts either a raw `.ottx` archive or:

```json
{
  "archive": {},
  "mode": "upsert"
}
```

The default `upsert` mode replaces records with matching ids and inserts missing records, which supports round-tripping a campaign into a fresh instance or refreshing an existing imported campaign. Use `reject_conflicts` to return `409` when imported ids already exist.

Archives include uploaded asset files in a top-level `files` array, regardless of whether the active backend is local disk or S3-compatible object storage. Each entry stores base64 data plus size and `sha256` checksum metadata. Import validates the asset id, size, and checksum before restoring the file through the configured asset storage provider, so uploaded map backgrounds can round-trip into a fresh instance.

Realtime clients connect to:

```text
ws://localhost:4000/api/v1/realtime?campaignId=camp_demo&sessionToken=<token>
```
