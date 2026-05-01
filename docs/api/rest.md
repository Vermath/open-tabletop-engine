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
- `GET /api/v1/scim/v2/ServiceProviderConfig`
- `GET|POST /api/v1/scim/v2/Users`
- `GET|PUT|PATCH|DELETE /api/v1/scim/v2/Users/{userId}`
- `GET|POST /api/v1/scim/v2/Groups`
- `GET|PUT|PATCH|DELETE /api/v1/scim/v2/Groups/{groupId}`
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
- `GET|POST /api/v1/campaigns/{campaignId}/fog-presets`
- `DELETE /api/v1/campaigns/{campaignId}/fog-presets/{presetId}`
- `GET|PATCH|DELETE /api/v1/scenes/{sceneId}`
- `GET /api/v1/scenes/{sceneId}/vision`
- `POST /api/v1/scenes/{sceneId}/fog`
- `GET /api/v1/scenes/{sceneId}/fog/history`
- `POST /api/v1/scenes/{sceneId}/fog/undo`
- `POST /api/v1/scenes/{sceneId}/fog/apply-preset`
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
- `GET|POST /api/v1/campaigns/{campaignId}/ai/threads`
- `GET /api/v1/campaigns/{campaignId}/ai/usage`
- `POST /api/v1/campaigns/{campaignId}/ai/encounter-design`
- `POST /api/v1/campaigns/{campaignId}/ai/session-recap`
- `GET|POST /api/v1/campaigns/{campaignId}/ai/memory`
- `POST /api/v1/campaigns/{campaignId}/ai/memory/extract`
- `GET /api/v1/campaigns/{campaignId}/ai/tool-calls`
- `POST /api/v1/ai/memory/{factId}/approve`
- `GET /api/v1/admin/plugins/reviews`
- `PATCH /api/v1/admin/plugins/reviews/{reviewKey}`
- `GET|POST /api/v1/plugins`
- `POST /api/v1/plugins/registry/sync`
- `GET /api/v1/campaigns/{campaignId}/plugins`
- `POST /api/v1/campaigns/{campaignId}/plugins/{pluginId}/install`
- `GET /api/v1/campaigns/{campaignId}/plugins/{pluginId}/storage`
- `GET|PUT|DELETE /api/v1/campaigns/{campaignId}/plugins/{pluginId}/storage/{key}`
- `POST /api/v1/campaigns/{campaignId}/plugins/{pluginId}/chat-command`
- `GET|POST /api/v1/systems`
- `GET /api/v1/campaigns/{campaignId}/systems`
- `POST /api/v1/campaigns/{campaignId}/systems/{systemId}/install`
- `GET /api/v1/campaigns/{campaignId}/systems/{systemId}/character-templates`
- `POST /api/v1/campaigns/{campaignId}/systems/{systemId}/characters`
- `POST /api/v1/campaigns/{campaignId}/systems/{systemId}/characters/import`
- `GET /api/v1/campaigns/{campaignId}/systems/{systemId}/encounter-threats`
- `POST /api/v1/campaigns/{campaignId}/systems/{systemId}/encounter-plan`
- `GET /api/v1/campaigns/{campaignId}/systems/{systemId}/compendium`
- `POST /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/compendium`
- `POST /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/conditions`
- `DELETE /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/conditions/{conditionId}`
- `GET /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/advancement`
- `POST /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/advance`
- `GET /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/sheet`
- `POST /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/roll`
- `GET /api/v1/campaigns/{campaignId}/export`
- `POST /api/v1/import/campaign`

Plugin runtime endpoints are campaign-scoped. `GET /api/v1/plugins` returns manifest-loaded local and registry-synced packages with source metadata, sandbox mode, manifest/server-entrypoint checksums, version distribution metadata, and trust status. `POST /api/v1/plugins` registers an additional package by `packagePath` under the configured plugin root. `POST /api/v1/plugins/registry/sync` fetches one configured remote registry from `OTTE_PLUGIN_REGISTRY_URLS`, or every configured registry when no `registryUrl` is supplied, and mirrors JSON plugin package files into the configured plugin root before loading them through the same manifest, sandbox, versioning, and trust checks as local packages. Registry sync refuses to overwrite existing local package directories that do not already carry matching registry provenance. Registry catalog entries use `packageId`, `packageUrl` or `downloadUrl`, and optional `sha256:` `checksum`; downloaded package documents contain a `files` object with `plugin.manifest.json`, server/client entrypoints, and optional `plugin.signature.json`. Server admins can review every package version/checksum through `GET /api/v1/admin/plugins/reviews` and set `pending`, `approved`, or `rejected` with `PATCH /api/v1/admin/plugins/reviews/{reviewKey}`; rejected packages are blocked, and `OTTE_PLUGIN_REVIEW_POLICY=require_approved` blocks install and execution until the matching package review is approved. Installing a plugin creates or updates a `permissionGrants` record for `subjectType: "plugin"`; callers may grant all requested permissions or a subset for review, and may request a specific package `version`. Campaign plugin storage is a JSON key/value API under `/api/v1/campaigns/{campaignId}/plugins/{pluginId}/storage`; human callers need `plugin.configure`, and the installed plugin grant must include `plugin.configure`. Storage keys are bounded to 80 URL-safe characters, values are JSON-serializable and capped at 16 KiB, storage entries persist in campaign archives/SQLite, and writes/deletes are audited. VM command handlers receive a snapshot of their plugin storage when granted `plugin.configure` and can return bounded storage mutations alongside the chat result. When `OTTE_PLUGIN_TRUST_POLICY=require_trusted`, unsigned or tampered plugin packages are visible for review but blocked from installation and command execution unless their `plugin.signature.json` verifies against `OTTE_PLUGIN_TRUST_KEYS`. Command execution checks the human caller's permission, the current trust policy, marketplace review state, and the plugin grant before the plugin can post chat, read token context, or mutate plugin storage, then runs the manifest-declared server command in the VM sandbox.

System runtime endpoints are campaign-scoped. The runtime catalog currently includes `generic-fantasy`, `stellar-frontiers`, and `mystic-noir`. Generic Fantasy exposes character templates, level advancement, fantasy character import normalization, fantasy encounter threats, items, spells, and conditions with ability quick rolls; Stellar Frontiers exposes character templates, rank advancement, sci-fi character import normalization, sci-fi encounter threats, gear, talents, strain-aware actor sheets, aptitude quick rolls, and conditions; Mystic Noir exposes character templates, case-breakthrough advancement, investigation character import normalization, case threat budgets, clue/ritual compendium entries, composure-aware actor sheets, skill quick rolls, and conditions. All built-in systems can create actors from templates with starting items, import normalized character data with compendium-backed item and condition mapping, add compendium entries to actors, apply and remove actor conditions, advance actors through guided progression, calculate encounter difficulty from party and threat budgets, optionally persist planned encounters, summarize actor sheets with system-specific inventory/spell/talent/clue/ritual surfaces, and produce quick-roll dice formulas that can be posted into chat. Quick rolls include condition-aware ability/aptitude/skill checks and compendium-backed action formulas such as Longsword damage, Healing Word healing, Laser Carbine damage, Med Patch healing, Overclock boosts, Case Notebook insights, and Warding Rite wards.

AI thread requests use the configured provider from `OTTE_AI_PROVIDER`. The default `local-echo` provider is offline and deterministic; `codex-loopback` exercises the Codex App Server provider path against a local loopback transport; `openai-responses` uses the OpenAI Responses API with `OPENAI_API_KEY`, optional `OPENAI_MODEL`, `OPENAI_BASE_URL`, `OPENAI_ORGANIZATION`, and `OPENAI_PROJECT`. Provider requests receive campaign context filtered through the caller's actual permissions, including visible journals, memory, actors, scenes, and encounters. Assistant responses are persisted into chat as `public` for player-visible context or `gm_only` when the caller can read GM AI memory. Chat reads filter `gm_only` and `whisper` messages per viewer. Providers receive typed tool schemas for `create_proposal`, `draft_encounter`, `draft_journal_entry`, `draft_scene`, `draft_token_update`, `draft_actor_update`, `create_memory`, `roll_dice`, and `read_compendium`. The API enforces each tool's human-caller permission before execution, records started/completed tool lifecycle events with per-tool durations, queues proposal and memory mutations for GM review, and exposes GM-facing tool-call observability through `GET /api/v1/campaigns/{campaignId}/ai/tool-calls`. AI thread records include `status`, start/completion/failure timestamps, `durationMs`, retry count, event count, tool-call count, provider usage when reported, character counts, optional estimated cost, and provider error text when applicable. `GET /api/v1/campaigns/{campaignId}/ai/threads` requires `ai.proposeChanges` and returns the campaign's thread status history for operators. `GET /api/v1/campaigns/{campaignId}/ai/usage` requires `ai.proposeChanges` and aggregates thread counts, retries, durations, token usage, character counts, and estimated cost by campaign and provider. Server admins can inspect redacted provider runtime settings, aggregate usage, recent threads, and recent tool calls across campaigns through `GET /api/v1/admin/ai/operations`; the browser Admin tab shows the same AI operations summary. Provider calls retry once before any event is emitted by default; set `OTTE_AI_PROVIDER_RETRY_ATTEMPTS` from `0` to `3` to adjust that pre-event retry budget. OpenAI Responses requests time out after `OTTE_AI_PROVIDER_TIMEOUT_MS` milliseconds, defaulting to `30000`; set it to `0` only to disable the timeout for local debugging. Set `OTTE_AI_INPUT_TOKEN_COST_USD_PER_1K` and `OTTE_AI_OUTPUT_TOKEN_COST_USD_PER_1K` to calculate estimated thread and aggregate costs from provider-reported token usage. `POST /api/v1/campaigns/{campaignId}/ai/memory/extract` runs provider-backed memory extraction from supplied or recent campaign text, requires `ai.proposeChanges`, and creates a pending memory fact for GM review.

Proposal approval is a two-step flow: `POST /api/v1/proposals/{proposalId}/approve` marks a pending proposal as approved, and `POST /api/v1/proposals/{proposalId}/apply` mutates campaign state only after approval. Applying a pending proposal returns `409`. `POST /api/v1/ai/memory/{factId}/approve` marks queued AI memory as approved.

Scene vision requests return the same permission-filtered polygons used by token visibility checks. Players receive revealed fog polygons, owned-token vision polygons, hide/erase fog polygons, and wall-clipped colored light polygons when fog is active; GM-capable users receive unmasked lighting polygons with `fogActive: false`. Fog authoring accepts circle regions, `shape: "polygon"` with `points`, or `shape: "brush"` with raw freehand `points` and optional `brushRadius`; brush strokes are smoothed and compacted into persisted polygon fog. Use `mode: "reveal" | "hide"` for reveal and erase brushes. Fog create/delete operations append scene-local history entries, `GET /fog/history` exposes the GM-only history log, and `POST /fog/undo` reverses the latest still-applicable create/delete entry. Campaign fog presets save the current fog regions from a source scene, persist in SQLite/archive state, and can be applied to any same-campaign scene through `POST /fog/apply-preset` with `mode: "append" | "replace"`. Wall authoring accepts `kind: "wall" | "terrain"` and optional `blocksMovement`; light authoring accepts `color` and `intensity`.

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

Request and confirm a password reset. The request response is always `{ "ok": true }` so callers cannot enumerate accounts by email. When `OTTE_EMAIL_WEBHOOK_URL` is set, the API posts the queued email payload to that webhook; otherwise the message stays in the admin outbox as `pending`. The browser client includes the matching reset screen at `/reset-password?token=opr_...`.

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

Local password users can enroll TOTP MFA. Enrollment returns the `secret` and `otpauthUrl` once; confirmation enables MFA and returns one-time recovery codes. Later password logins for that account must include either `mfaCode` or `recoveryCode`.

```bash
curl -X POST \
  -H "Authorization: Bearer $OTTE_SESSION_TOKEN" \
  -H "content-type: application/json" \
  --data '{"currentPassword":"replace-this-password"}' \
  "http://localhost:4000/api/v1/auth/mfa/totp/enroll"

curl -X POST \
  -H "Authorization: Bearer $OTTE_SESSION_TOKEN" \
  -H "content-type: application/json" \
  --data '{"code":"123456"}' \
  "http://localhost:4000/api/v1/auth/mfa/totp/confirm"

curl -X POST \
  -H "content-type: application/json" \
  --data '{"email":"player@example.com","password":"replace-this-password","mfaCode":"123456"}' \
  "http://localhost:4000/api/v1/auth/login"
```

SCIM v2 provisioning is enabled when `OTTE_SCIM_BEARER_TOKEN` is set. SCIM endpoints require `Authorization: Bearer <token>` and support ServiceProviderConfig, user list/create/get/replace/patch/deactivate, and group list/create/get/replace/patch/delete. SCIM-created users are marked `passwordResetRequired` by default so provisioning an email identity never creates a passwordless login path.

```bash
curl -H "Authorization: Bearer $OTTE_SCIM_BEARER_TOKEN" \
  "http://localhost:4000/api/v1/scim/v2/ServiceProviderConfig"

curl -X POST \
  -H "Authorization: Bearer $OTTE_SCIM_BEARER_TOKEN" \
  -H "content-type: application/json" \
  --data '{"userName":"player@example.com","name":{"formatted":"Provisioned Player"},"emails":[{"value":"player@example.com","primary":true}],"active":true}' \
  "http://localhost:4000/api/v1/scim/v2/Users"

curl -X PATCH \
  -H "Authorization: Bearer $OTTE_SCIM_BEARER_TOKEN" \
  -H "content-type: application/json" \
  --data '{"Operations":[{"op":"replace","path":"active","value":false}]}' \
  "http://localhost:4000/api/v1/scim/v2/Users/usr_..."

curl -X POST \
  -H "Authorization: Bearer $OTTE_SCIM_BEARER_TOKEN" \
  -H "content-type: application/json" \
  --data '{"displayName":"Campaign Staff","members":[{"value":"usr_..."}]}' \
  "http://localhost:4000/api/v1/scim/v2/Groups"
```

Server administrators can map SCIM groups into campaign roles. A mapping targets exactly one group identifier: `groupId`, `groupExternalId`, or `groupDisplayName`; supported campaign roles are `gm`, `assistant_gm`, `player`, and `observer`. Creating or changing a matching SCIM group syncs membership into the campaign, removing only memberships that were created by that mapping and preserving manually managed campaign members.

```bash
curl -X POST \
  -H "Authorization: Bearer $OTTE_ADMIN_SESSION_TOKEN" \
  -H "content-type: application/json" \
  --data '{"groupExternalId":"campaign-staff","campaignId":"camp_demo","role":"assistant_gm"}' \
  "http://localhost:4000/api/v1/admin/scim/group-role-mappings"

curl -H "Authorization: Bearer $OTTE_ADMIN_SESSION_TOKEN" \
  "http://localhost:4000/api/v1/admin/scim/group-role-mappings"

curl -X DELETE \
  -H "Authorization: Bearer $OTTE_ADMIN_SESSION_TOKEN" \
  "http://localhost:4000/api/v1/admin/scim/group-role-mappings/scimmap_..."
```

Server administrators are the user ids listed in `OTTE_ADMIN_USER_IDS`. `GET /api/v1/auth/session` returns `serverAdmin: true` for those users, and the browser app exposes an Admin tab for the same account, session, email outbox, SCIM group role mapping, AI operations, and audit operations. Admin endpoints can list/update users, require password resets, disable accounts, revoke sessions, inspect the email outbox, inspect redacted AI/Codex operations, manage SCIM group role mappings, and export redacted audit logs for account/session operations:

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

Invite and password-reset tokens are returned only once and are stored hashed in engine state. Listing invites returns metadata and status without the token hash. TOTP MFA secrets, recovery-code hashes, and SCIM profiles are redacted from public/admin user responses and campaign archives. Admin audit exports accept `campaignId`, `actorUserId`, `actorType`, `action`, `targetType`, `targetId`, `since`, `until`, `limit`, and `format=json|ndjson` query filters. Campaign exports omit operational sessions, OIDC identities, OAuth login states, invite records, password reset records, email outbox records, SCIM groups, SCIM group role mappings, SCIM membership source metadata, user password hashes, MFA secrets, and SCIM profiles.

Password reset and admin environment variables:

| Variable | Required | Purpose |
| --- | --- | --- |
| `OTTE_ADMIN_USER_IDS` | no | Comma-separated user ids allowed to call `/api/v1/admin/*`. |
| `OTTE_SCIM_BEARER_TOKEN` | no | Enables `/api/v1/scim/v2/*` provisioning when set; callers must send it as a bearer token. |
| `OTTE_PASSWORD_RESET_URL` | no | Browser reset form URL, usually `https://your-web-origin/reset-password`. The API appends `token=<opr_token>`. Falls back to `${OTTE_WEB_ORIGIN}/reset-password` when set. |
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

Uploaded assets are scanned by `builtin-asset-scanner` before storage writes. EICAR test signatures, active SVG content, executable/script uploads, and HTML uploads return `422 asset_security_blocked` with scanner findings and do not create an asset record. When `OTTE_ASSET_TRUST_WEBHOOK_URL` is configured, clean built-in results are also sent to an external AV/trust scanner before quota checks, asset record creation, or local/S3 object writes. The webhook receives JSON with `name`, `mimeType`, `sizeBytes`, `checksum`, and `contentBase64`; optional `OTTE_ASSET_TRUST_WEBHOOK_TOKEN` is sent as a bearer token. Responses use `status: "clean"` or `status: "blocked"` with optional `scanner` and `findings`. Blocked responses, high-severity findings, invalid responses, HTTP failures, or timeouts fail closed by default and return `422 asset_security_blocked`; set `OTTE_ASSET_TRUST_FAIL_CLOSED=false` only when fail-open behavior is intentional. Clean uploads store scan metadata on `MapAsset.security`, are checksummed as `sha256`, recorded as `MapAsset` rows with a `storage.provider` of `local` or `s3`, and served through `GET /api/v1/assets/{assetId}/blob?sessionToken=<token>`. Local development stores bytes under `OTTE_UPLOAD_DIR`; Docker Compose stores them in the configured MinIO/S3 bucket by default. `OTTE_ASSET_QUOTA_BYTES` enforces a per-campaign byte quota for active or archived assets.

For CDN or browser contexts that should not carry a bearer token, request a signed delivery URL. The signed URL targets the same blob route, expires automatically, and uses `OTTE_ASSET_CDN_BASE_URL` when configured. `apps/asset-edge` contains a Cloudflare Worker that validates those signatures at the edge, strips browser credentials before origin fetch, and bounds edge cache TTL by the signed URL expiry:

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

Lifecycle status is `active`, `archived`, or `deleted`. Deleted and expired assets return `410` from blob delivery but remain represented in storage stats and archives for operational audit. Server admins can inspect global asset storage with `GET /api/v1/admin/assets/storage`; the response includes configured cleanup scheduler status and the latest scheduled run summary when recurring cleanup is enabled.

Server admins can also run storage migration and object cleanup operations. Migration reads existing asset bytes, verifies size/checksum, and writes the object through the currently configured asset storage provider. Cleanup physically deletes stored bytes for deleted or expired assets after the configured grace period while preserving the metadata row. The same cleanup operation can run on API startup and/or a recurring interval through environment configuration:

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
| `OTTE_ASSET_TRUST_WEBHOOK_URL` | no | Optional external AV/trust scanner webhook called before storage writes. |
| `OTTE_ASSET_TRUST_WEBHOOK_TOKEN` | no | Optional bearer token sent to the external asset scanner webhook. |
| `OTTE_ASSET_TRUST_TIMEOUT_MS` | no | External scanner timeout in milliseconds. Defaults to 5000 and caps at 30000. |
| `OTTE_ASSET_TRUST_FAIL_CLOSED` | no | Controls scanner outage behavior. Defaults to `true`, which blocks uploads if the scanner fails. |
| `OTTE_ASSET_TRUST_SCANNER_NAME` | no | Fallback scanner label used when the webhook response does not provide one. |
| `OTTE_ASSET_CLEANUP_GRACE_DAYS` | no | Default grace period before admin cleanup jobs physically remove deleted or expired asset bytes. Defaults to 0 for API calls and 7 in Docker Compose. |
| `OTTE_ASSET_CLEANUP_INTERVAL_SECONDS` | no | Enables recurring API-hosted cleanup when set to a positive number. Unset or `0` disables interval cleanup. |
| `OTTE_ASSET_CLEANUP_RUN_ON_START` | no | Runs one cleanup pass when the API process starts. Defaults to `false`. |
| `OTTE_ASSET_CLEANUP_DRY_RUN` | no | Makes scheduled cleanup report planned deletions without removing bytes. Defaults to `false`. |
| `OTTE_ASSET_CLEANUP_INCLUDE_DELETED` | no | Includes deleted assets in scheduled cleanup. Defaults to `true`. |
| `OTTE_ASSET_CLEANUP_INCLUDE_EXPIRED` | no | Includes expired assets in scheduled cleanup. Defaults to `true`. |
| `OTTE_ASSET_CLEANUP_CAMPAIGN_ID` | no | Optional campaign scope for scheduled cleanup. |
| `OTTE_ASSET_CLEANUP_USER_ID` | no | User id recorded on scheduled cleanup lifecycle updates. Defaults to `system_asset_cleanup`. |

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
