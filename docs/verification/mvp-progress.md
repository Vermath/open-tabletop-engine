# MVP Progress Evidence

This document tracks verified MVP progress without treating the whole PRD as complete.

## Verified Milestones

### Durable Storage And Permissions

- Commit: `c7c3fb7 feat: add durable sqlite store and session permissions`
- Evidence:
  - `pnpm check` passed.
  - API test covers unauthenticated `401`, observer mutation `403`, GM-only journal filtering, and SQLite restart persistence.
  - Manual API check created a campaign through the running API and verified the SQLite file persisted state.

### Campaign Archive Round Trip

- Commit: `6d9e56c feat: round trip campaign archives`
- Evidence:
  - `pnpm check` passed.
  - API test exports `camp_demo`, imports it into a fresh store, and verifies scenes, tokens, actors, journals, assets, encounters, and permission grants.

### Plugin And System Runtime Slice

- Commit: `3a3e81a feat: add plugin and system runtimes`
- Evidence:
  - `pnpm check` passed.
  - API test verifies:
    - Observer cannot install a plugin.
    - GM can install `example-macro-plugin`, creating a plugin permission grant.
    - Plugin command execution is blocked when the plugin grant lacks `chat.write`.
    - `/spark` posts plugin chat after the plugin has `chat.write` and `token.read`.
    - Generic Fantasy actor sheet summary exposes `ability-charisma` as `1d20+2`.
    - Observer cannot run the system dice roll.
    - GM system roll posts a chat roll.
  - Manual browser evidence on local dev servers:
    - API: `http://127.0.0.1:4410`
    - Web: `http://localhost:5174`
    - SDK panel loaded `Example Macro Plugin` as available.
    - Clicking `Install` changed the panel to `installed plugin`.
    - Clicking `/spark` posted chat: `Spark macro: from the browser tabletop near Valen Ash.`
    - Clicking `Charisma Check` posted chat similar to: `Valen Ash Charisma Check: 1d20+2 = 21`.
    - A second browser tab observed realtime token movement after a token update broadcast; the observed token bounding box changed from approximately `(417, 593)` to `(646, 668)`.

### Uploaded Map Asset Slice

- Commit: `455b07f feat: add uploaded map assets`
- Evidence:
  - `pnpm check` passed.
  - API test verifies raw image upload, asset metadata, checksum, stored file, scene background assignment, unauthenticated blob `401`, and authenticated blob byte serving.
  - Manual browser evidence on local dev servers:
    - Uploaded `storage/manual-map.svg` through the `Map` button.
    - Upload request returned `200`.
    - Scene rendered one `.scene-map` image with `naturalWidth: 1200`.
    - Rendered image source was `http://127.0.0.1:4410/api/v1/assets/asset_momctectfpiqquoo/blob?userId=usr_demo_gm`.
    - Direct blob request without a session returned `401`.
    - Direct blob request with `userId=usr_demo_gm` returned `200`, `image/svg+xml`, and contained `Manual Acceptance Map`.

### AI Provider And Chat Permission Slice

- Commit: `e37b252 feat: permission ai provider threads`
- Evidence:
  - `pnpm --filter @open-tabletop/api test` passed with `9 passed`.
  - `pnpm check` passed across lint, typecheck, tests, and build.
  - API test verifies:
    - Player AI provider context includes public journal context and excludes `Session Hook`.
    - Player AI provider context has no GM secrets.
    - GM AI provider context includes the seeded founder oath secret.
    - AI responses persist to chat as `public` for player-visible context and `gm_only` for GM context.
    - Player chat reads include the public AI answer and exclude the GM-only AI answer.
    - `OTTE_AI_PROVIDER=codex-loopback` selects the Codex App Server provider and returns a `message.completed` event.
  - Manual API evidence on local dev server `http://127.0.0.1:4420` with `OTTE_AI_PROVIDER=codex-loopback`:
    - Imported `usr_manual_player` as a player member of `camp_demo`.
    - GM AI thread returned provider `codex-app-server`, event `message.completed`, and persisted chat visibility `gm_only`.
    - Player AI thread returned provider `codex-app-server` and persisted chat visibility `public`.
    - Player chat feed showed the player's own AI message and did not show the GM-only AI message.

### AI Approval Queue Slice

- Commit: `df807e8 feat: verify ai approval queue`
- Evidence:
  - `pnpm --filter @open-tabletop/api test` passed with `10 passed`.
  - `pnpm check` passed across lint, typecheck, tests, and build.
  - API test verifies:
    - Player cannot apply an AI proposal.
    - Applying a pending proposal as GM returns `409` instead of mutating state.
    - GM can approve and apply an encounter proposal, creating an `AI Draft Encounter`.
    - Player cannot approve queued AI memory.
    - GM can approve queued AI memory and the approved fact is returned from the memory endpoint.
  - Manual browser evidence on local dev servers:
    - API: `http://127.0.0.1:4422`
    - Web: `http://localhost:5175`
    - `Draft Encounter` created a pending `Encounter Designer Draft` proposal.
    - `Approve and apply` changed that proposal to `applied`.
    - `Recap Session` created a pending memory card and a pending `Session Recap` proposal.
    - `Approve memory` changed the memory card to `approved memory`.
    - `Approve and apply` changed the `Session Recap` proposal to `applied`.
    - Live API check returned applied proposal titles `Encounter Designer Draft` and `Session Recap`, encounter name `AI Draft Encounter`, approved memory count `1`, and session recap journal count `1`.

### AI Provider Proposal Tool Slice

- Commit: `d86ed8b feat: execute ai proposal tools`
- Evidence:
  - `pnpm --filter @open-tabletop/codex-app-server-provider build` passed.
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `16 passed`.
  - `pnpm check` passed across lint, typecheck, tests, and build.
  - API test verifies:
    - AI providers receive a `create_proposal` tool definition on thread requests.
    - A GM-owned provider tool request creates a pending AI proposal.
    - Provider-created `journal.create` changes are normalized with ids and timestamps before approval/application.
    - AI tool lifecycle records include started and completed statuses.
    - A player-owned provider tool request returns `missing_permission` for `ai.proposeChanges` and creates no proposal.
    - The `codex-loopback` provider can request the proposal tool from a prompt and creates a pending `Codex Loopback Proposal`.
  - Manual API evidence on local dev server:
    - API: `http://127.0.0.1:4431`
    - `OTTE_AI_PROVIDER=codex-loopback`
    - Fresh SQLite state file: `storage/manual-ai-tool-20260501.sqlite`
    - GM AI thread returned provider `codex-app-server` and event types `tool.started,tool.completed,proposal.created,message.completed`.
    - GM tool names were `create_proposal,create_proposal`.
    - Created proposal `prop_momfbifyl3ixdrar` titled `Codex Loopback Proposal` in `pending` status.
    - Provider-created journal change had a generated `jnl_` id.
    - Applying the pending proposal before approval returned `409`.
    - Approval changed status to `approved`; applying after approval changed status to `applied`.
    - Applied proposal created the `Codex Loopback Prep` journal entry.
    - Player AI thread returned provider `codex-app-server`, tool error `missing_permission`, and permission `ai.proposeChanges`.
    - Final `Codex Loopback Proposal` count remained `1`, proving the player tool request did not create a second proposal.

### AI Provider Memory Extraction Slice

- Commit: `5eb9aae feat: extract ai memory through provider`
- Evidence:
  - `pnpm --filter @open-tabletop/codex-app-server-provider build` passed.
  - `pnpm --filter @open-tabletop/api-contracts build` passed.
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `16 passed`.
  - `pnpm --filter @open-tabletop/web typecheck` passed.
  - `pnpm check` passed across lint, typecheck, tests, and build.
  - API test verifies:
    - `codex-loopback` provider memory extraction returns provider `codex-app-server`.
    - Extracted memory text includes the supplied source text.
    - Created memory source ids include the AI thread id.
    - Created memory is persisted into campaign state.
    - Player-owned extraction is blocked with `403`.
  - Manual API evidence on local dev server:
    - API: `http://127.0.0.1:4432`
    - `OTTE_AI_PROVIDER=codex-loopback`
    - Fresh SQLite state file: `storage/manual-ai-memory-extract-20260501.sqlite`
    - GM login returned an `ots_` bearer token with length `47`.
    - GM extraction returned provider `codex-app-server` and event type `message.completed`.
    - Created memory `mem_momfi5jxuqab18kr` contained `silver door opens at moonrise`.
    - Created memory source ids included the extraction thread id.
    - Memory was visible to the GM before approval but had no `approvedByUserId`.
    - Player extraction returned `403`.
    - GM approval set `approvedByUserId` to `usr_demo_gm`.
  - Manual browser evidence on local dev servers:
    - API: `http://127.0.0.1:4432`
    - Web: `http://localhost:5175`
    - Opened the `AI` panel as Demo GM and saw the `Extract Memory` control.
    - Entered `The obsidian key is hidden under the fountain.` and clicked `Extract Memory`.
    - Browser rendered a pending memory card containing that extracted text.
    - Clicking `Approve memory` changed that memory card to `approved memory`.
    - Browser console had only a missing `favicon.ico` error, unrelated to this workflow.

### Fog Walls And Lighting Authoring Slice

- Commit: `d2c8e6f feat: add wall and light authoring`
- Evidence:
  - `pnpm check` passed across lint, typecheck, tests, and build.
  - API test passed with `11 passed`.
  - API test verifies:
    - Observer role cannot create scene walls.
    - GM can add a wall through `POST /api/v1/scenes/{sceneId}/walls`.
    - GM can add a light through `POST /api/v1/scenes/{sceneId}/lights`.
    - The updated scene returns the seeded wall/light plus the newly authored wall/light.
  - Manual browser/API evidence on local dev servers:
    - API: `http://127.0.0.1:4423`
    - Web: `http://localhost:5175`
    - Fresh SQLite state file: `storage/manual-vision-20260501.sqlite`
    - Browser loaded `The Ember Vault` and exposed toolbar buttons `Add wall` and `Add light`.
    - Clicking `Add wall` rendered a second wall line in the scene.
    - Clicking `Add light` persisted a second light centered on the selected Valen Ash token.
    - Screenshot inspection showed two wall lines and the lit token area in the active scene.
    - Live API check returned `WallCount: 2`, `LightCount: 2`, last wall coordinates `x1: 300`, `y1: 224`, `x2: 900`, `y2: 224`, `blocksVision: true`, and last light coordinates `x: 325`, `y: 375`, `radius: 210`, `color: #facc15`.

### GM Player Session Slice

- Commit: `3db3da6 feat: add demo player session switching`
- Evidence:
  - `pnpm check` passed across lint, typecheck, tests, and build.
  - API test passed with `12 passed`.
  - API test verifies:
    - Seeded `usr_demo_player` has a `player` membership in `camp_demo`.
    - Player can list the campaign and campaign members.
    - Member permission payload includes `token.move` and excludes `scene.update`.
    - Player can move `tok_valen`.
    - Player can update owned actor HP for `act_valen`.
    - Player cannot create scene walls.
    - Player cannot read the seeded GM-only journal hook.
  - Manual browser/API evidence on local dev servers:
    - API: `http://127.0.0.1:4424`
    - Web: `http://localhost:5177`
    - Fresh SQLite state file: `storage/manual-session-20260501.sqlite`
    - Browser session switcher showed `Demo GM - owner` and `Demo Player - player`.
    - Switching to `Demo Player - player` disabled GM-only scene, map, token-create, combat, fog, wall, and light controls.
    - Player browser dragged Valen Ash; live API check returned `TokenX: 590`, `TokenY: 541`.
    - Player member API check returned role `player`, `PlayerCanMoveToken: true`, and `PlayerCanUpdateScene: false`.
    - A separate GM browser session loaded as `Demo GM - owner` and reflected the moved Valen token; screenshot inspection showed the token at the new lower-center scene position.
    - GM session token bounding box after the player move was approximately `x: 576.75`, `y: 496.27`, showing the second client received the updated scene state.

### Hidden Token Visibility Slice

- Commit: `5e3a8f5 feat: filter hidden token visibility`
- Evidence:
  - `pnpm check` passed across lint, typecheck, tests, and build.
  - API test passed with `13 passed`.
  - API test verifies:
    - Player token reads filter out a hidden `tok_hidden_sentinel`.
    - GM token reads still include the hidden token.
    - Player attempts to patch the hidden token return `404`.
    - GM can patch the hidden token and it remains hidden.
  - Manual browser/API evidence on local dev servers:
    - API: `http://127.0.0.1:4425`
    - Web: `http://localhost:5178`
    - Fresh SQLite state file: `storage/manual-hidden-20260501.sqlite`
    - Created hidden GM token `tok_momeaw2udn5j7m6i` named `Hidden Sentinel` while player and GM browsers were connected.
    - Player browser loaded as `Demo Player - player` and continued to show only the visible `VA` token in the scene.
    - GM browser loaded as `Demo GM - owner` and showed both the visible `VA` token and the hidden-token `HI` marker.
    - Live API check returned GM token IDs `tok_valen,tok_momeaw2udn5j7m6i`, player token IDs `tok_valen`, `PlayerHiddenTokenCount: 0`, and `PlayerPatchStatus: 404`.
    - GM patch of the hidden token returned `200` with `GmHiddenTokenX: 760`, `GmHiddenTokenY: 300`, and `GmHiddenTokenHidden: true`.

### Fog Vision Visibility Slice

- Commit: `0ef6736 feat: filter player token vision`
- Evidence:
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `14 passed`.
  - `pnpm check` passed across lint, typecheck, tests, and build.
  - API test verifies:
    - Player token reads include the owned `tok_valen`.
    - Player token reads include an unowned token visible through owned token vision.
    - Player token reads include an unowned token inside a revealed fog region.
    - Player token reads exclude an unowned token blocked by a vision-blocking wall.
    - GM token reads still include the wall-blocked token.
    - Player attempts to patch the wall-blocked token return `404`.
  - Manual browser/API evidence on local dev servers:
    - API: `http://127.0.0.1:4426`
    - Web: `http://localhost:5179`
    - Fresh SQLite state file: `storage/manual-fog-vision-20260501.sqlite`
    - Configured `scn_vault_entry` with one revealed fog circle, one `blocksVision` wall, and Valen Ash vision radius `220`.
    - Created `Visible Guard`, `Blocked Guard`, and `Fog Scout` tokens while player and GM browsers were connected.
    - Player browser loaded as `Demo Player - player` and showed scene markers `VA`, `VI`, and `FO`; it did not show the wall-blocked `BL` marker.
    - GM browser loaded as `Demo GM - owner` and showed `VA`, `VI`, `BL`, and `FO`.
    - Live API check returned GM token names `Valen Ash,Visible Guard,Blocked Guard,Fog Scout`, player token names `Valen Ash,Visible Guard,Fog Scout`, `PlayerSeesBlocked: 0`, and `PlayerBlockedPatchStatus: 404`.

### Token Movement Ownership Slice

- Commit: `d42bc71 feat: restrict player token movement`
- Evidence:
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `14 passed`.
  - `pnpm check` passed across lint, typecheck, tests, and build.
  - API test verifies:
    - Player can still move owned `tok_valen`.
    - Player can read a visible unowned token but receives `403` when attempting to move it.
    - Player still receives `404` for a token not visible through fog/vision.
  - Manual API evidence on local dev server:
    - API: `http://127.0.0.1:4427`
    - Fresh SQLite state file: `storage/manual-token-ownership-20260501.sqlite`
    - Created visible unowned token `tok_momek6b27ngow8fy` named `Visible Stranger`.
    - Player token read returned names `Valen Ash,Visible Stranger` and `PlayerSeesVisibleStranger: 1`.
    - Player move of `Visible Stranger` returned `403`.
    - Player move of owned `tok_valen` returned `200` with `PlayerOwnedTokenX: 420` and `PlayerOwnedTokenY: 380`.
    - GM move of `Visible Stranger` returned `200` with `GmMovedTokenX: 520` and `GmMovedTokenY: 360`.

### Durable Session Token Slice

- Commit: `3ce9a8d feat: add durable bearer sessions`
- Evidence:
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/web typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `15 passed`.
  - `pnpm check` passed across lint, typecheck, tests, and build.
  - API test verifies:
    - `POST /api/v1/auth/login` issues an opaque `ots_` bearer token for a seeded user.
    - Bearer `GET /api/v1/campaigns` resolves the session and returns `camp_demo`.
    - The same bearer token still resolves after closing and reopening the SQLite store.
    - `POST /api/v1/auth/logout` removes the session.
    - Reusing the logged-out token returns `401`.
  - Manual browser/API evidence on local dev servers:
    - API: `http://127.0.0.1:4428`
    - Web: `http://localhost:5180`
    - Fresh SQLite state file: `storage/manual-session-token-20260501.sqlite`
    - Browser loaded as `Demo GM - owner`, showed `Realtime connected`, and stored an `ots_` token of length `47` for `usr_demo_gm`.
    - Switching to `Demo Player - player` stored an `ots_` token of length `47` for `usr_demo_player` and disabled GM-only scene, map, token-create, combat, fog, wall, and light controls.
    - Direct API login for `usr_demo_player` returned an `ots_` token of length `47`; bearer `GET /api/v1/auth/session` resolved `usr_demo_player`; bearer `GET /api/v1/campaigns` returned `camp_demo`; no-token `GET /api/v1/campaigns` returned `401`.
    - Asset upload with a GM bearer token created `asset_momewntpyovw4hl4`.
    - Blob request without a token returned `401`.
    - Blob request with `sessionToken=<token>` returned `200`, `image/svg+xml`, and contained `Session Asset`.

### Uploaded Asset Archive Round Trip Slice

- Commit: `7b73c10 feat: archive uploaded asset files`
- Evidence:
  - `pnpm --filter @open-tabletop/core build` passed.
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `15 passed`.
  - `pnpm check` passed across lint, typecheck, tests, and build.
  - API test verifies:
    - Export embeds an uploaded map asset as one base64 archive file.
    - Archive file metadata includes the uploaded asset id, mime type, size, and checksum.
    - Import into a fresh store and fresh upload directory restores the asset file.
    - Imported scene background points at the restored asset id.
    - Imported blob serving returns the original uploaded bytes.
    - Existing archive collection checks still cover scenes, tokens, actors, journals, encounters, and permission grants.
  - Manual API evidence across two fresh API instances:
    - Source API: `http://127.0.0.1:4429`
    - Target API: `http://127.0.0.1:4430`
    - Source SQLite file: `apps/api/storage/manual-archive-source-20260501.sqlite`
    - Target SQLite file: `apps/api/storage/manual-archive-target-20260501.sqlite`
    - Uploaded source asset `asset_momf20w7s3tv41hg` with bearer auth.
    - Export returned `assetCount: 1`, `assetFileCount: 1`, one `base64` file, and decoded file data containing `Archive Roundtrip Asset`.
    - Target import returned `ImportCampaignIds: camp_demo` and `ImportAssetFiles: 1`.
    - Target blob request without a token returned `401`.
    - Target blob request with `sessionToken=<token>` returned `200`, `image/svg+xml`, and contained `Archive Roundtrip Asset`.
    - Source and target restored files both existed at `apps/api/uploads/manual-archive-*/camp_demo/asset_momf20w7s3tv41hg.svg`.

### Clean Checkout And Compose Runbook Slice

- Commit: `0babc83 fix: make compose stack runnable`
- Evidence:
  - Fresh clone of `https://github.com/Vermath/open-tabletop-engine.git` into `D:\otte-clean-check-20260501` landed on `5587210 docs: add ai memory extraction evidence`.
  - `pnpm install --frozen-lockfile` passed in the fresh clone.
  - `pnpm check` passed in the fresh clone across lint, typecheck, tests, and build; API tests reported `16 passed`.
  - Local dev clean-run API `http://127.0.0.1:4433` and web `http://127.0.0.1:5182` started from the fresh clone.
  - Clean-run API smoke returned an `ots_` bearer token length `47`, campaign `camp_demo`, one scene, token `Valen Ash`, dice formula `1d20+5`, chat `Clean checkout smoke chat`, AI provider `codex-app-server`, extracted memory containing `Clean checkout memory extraction works`, and confirmed the SQLite file existed.
  - Clean-run browser smoke showed `Realtime connected`, `The Ember Vault`, token marker `VA`, actor sheet `Valen Ash`, and the API-created dice/chat entries.
  - `docker compose -p otte_clean_20260501 config --quiet` passed with alternate host ports.
  - The first compose run exposed a broken MinIO tag and missing `apps/api/node_modules` runtime copy; both were fixed before acceptance.
  - Final `docker compose -p otte_clean_20260501 up --build -d` built API and web images and started Postgres, Redis, MinIO, API, and web containers.
  - Compose `GET http://127.0.0.1:4480/api/v1/health` returned `{ "ok": true, "version": "0.1.0", "service": "open-tabletop-api" }`.
  - Compose API smoke returned an `ots_` bearer token length `47`, campaign `camp_demo`, dice formula `1d20+5`, chat `Compose stack smoke chat`, AI provider `codex-app-server`, and extracted memory containing `Compose memory extraction works`.
  - Compose browser smoke on `http://127.0.0.1:5183` showed `Realtime connected`, the scene/token UI, and the compose-created dice/chat entries.
  - Browser console had only a missing `favicon.ico` error, unrelated to the MVP workflow.
  - Added `docs/verification/mvp-acceptance-audit.md` to map every explicit MVP goal to concrete evidence.

### S3/MinIO Asset Storage Slice

- Implementation:
  - Added an API asset storage abstraction with local disk and S3-compatible providers.
  - Docker Compose now defaults uploaded assets to the MinIO-backed `opentabletop-assets` bucket while non-Docker API development can keep local `OTTE_UPLOAD_DIR` storage.
  - Campaign archive export reads uploaded asset bytes through the active storage provider.
  - Campaign archive import validates embedded file size and `sha256`, then restores files through the active storage provider and refreshes the asset storage ref.
- Automated evidence:
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `17 passed`, including S3-compatible upload/blob/export/import coverage and local storage coverage.
  - `pnpm check` passed across lint, typecheck, tests, and production builds after the final import-key edge fix.
- Manual Compose acceptance:
  - `docker compose -p otte_s3_assets_20260501 config --quiet` passed with alternate ports.
  - `docker compose -p otte_s3_assets_20260501 up --build -d` rebuilt API and web images and started Postgres, Redis, MinIO, API, and web containers.
  - Compose API health on `http://127.0.0.1:4481` returned `healthOk: true`.
  - Login returned an `ots_` bearer token length `47`.
  - Uploading `Manual-MinIO-Smoke.svg` returned asset `asset_momx3zeogeo262c8` with `storage.provider: s3`, bucket `opentabletop-assets`, and key `camp_demo/asset_momx3zeogeo262c8.svg`.
  - Authenticated blob fetch returned `200` and contained `Manual MinIO asset smoke`.
  - Export returned `assetFileCount: 1`, `encoding: base64`, and file data matching the uploaded SVG bytes.
  - Import restored the embedded asset as `asset_manual_s3_import` with `storage.provider: s3`, bucket `opentabletop-assets`, and key `camp_demo/asset_manual_s3_import.svg`.
  - Imported blob fetch returned `200` and contained `Manual MinIO asset smoke`.
  - MinIO container listing under `/data/opentabletop-assets` mentioned both the uploaded and imported object ids.
  - The isolated Compose project was torn down with volumes after acceptance.

### Clean Checkout Role Switching And Ownership Slice

- Audit head: `c14f83c docs: refresh asset storage audit`
- Clean clone path: `D:\otte-clean-role-20260501`
- Automated evidence:
  - `pnpm install --frozen-lockfile` passed in the fresh clone.
  - `pnpm check` passed in the fresh clone across lint, typecheck, tests, and build; API tests reported `17 passed`.
- Manual browser/API evidence on clean-clone local dev servers:
  - API: `http://127.0.0.1:4434`
  - Web: `http://127.0.0.1:5185`
  - SQLite file: `D:\otte-clean-role-20260501\storage\role-clean-20260501.sqlite`
  - GM browser session loaded as `Demo GM - owner`, showed `Realtime connected`, rendered token marker `VA`, and had GM controls enabled, including scene editing and add-token controls.
  - Player browser session switched to `Demo Player - player`, showed `Synced`, kept token marker `VA` visible, and disabled GM-only controls: `Scene`, `Map`, `Token`, `Add token`, `Start combat`, `Reveal fog`, `Add wall`, and `Add light`.
  - Player-owned token movement worked in the player browser: token `VA` moved from bounding box `{ x: 644.46875, y: 417.640625, width: 26.25, height: 27 }` to `{ x: 669.671875, y: 434.421875, width: 26.25, height: 27 }`.
  - GM browser observed the realtime update for the same token at `{ x: 669.671875, y: 434.421875, width: 26.25, height: 27 }`.
  - API state agreed after the browser drag: `tok_valen` had `x: 767` and `y: 423`.
  - Ownership boundary check created GM token `tok_momxh08h2s67kkt8`; a player `PATCH /api/v1/tokens/tok_momxh08h2s67kkt8` returned `403`.
  - Manual evidence screenshots were saved in the clean clone at `output/playwright/role-clean-gm.png` and `output/playwright/role-clean-player.png`.

### OpenAI Responses Provider Adapter Slice

- Implementation:
  - Added `OpenAiResponsesProvider` to `packages/ai-core`.
  - The provider posts permission-filtered campaign context to the OpenAI Responses API, maps OpenTabletop AI tools to function tools, maps returned function calls to OpenTabletop tool events, supports `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL`, `OPENAI_ORGANIZATION`, and `OPENAI_PROJECT`, and returns a clear configuration message when selected without an API key.
  - The API now supports `OTTE_AI_PROVIDER=openai` and `OTTE_AI_PROVIDER=openai-responses`.
  - The AI gateway provider registry now exposes the real OpenAI Responses adapter instead of the previous placeholder.
- Automated evidence:
  - `pnpm --filter @open-tabletop/ai-core test` passed with `3 passed`.
  - `pnpm --filter @open-tabletop/ai-core typecheck` passed.
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `18 passed`, including API provider-selection coverage for `openai-responses`.
- Manual API evidence with a local OpenAI-compatible `/v1/responses` endpoint:
  - Fake OpenAI-compatible endpoint: `http://127.0.0.1:4711/v1/responses`
  - API: `http://127.0.0.1:4436`
  - SQLite file: `storage/openai-responses-smoke-20260501.sqlite`
  - Environment: `OTTE_AI_PROVIDER=openai-responses`, `OPENAI_API_KEY=sk-local-smoke`, `OPENAI_BASE_URL=http://127.0.0.1:4711/v1`, `OPENAI_MODEL=gpt-local-smoke`.
  - Fake endpoint logged `POST /v1/responses` with `Authorization: Bearer sk-local-smoke` and request body model `gpt-local-smoke`.
  - AI thread smoke returned provider `openai-responses`, assistant message `OpenAI-compatible smoke completed.`, and event sequence `tool.started,tool.completed,proposal.created,message.completed`.
  - The provider-returned `create_proposal` function call executed through the API permission boundary and created pending proposal `Fake OpenAI Prep`.
  - Proposal change payload targeted journal `Fake OpenAI Prep Note`.

### Worker App Job Runner Slice

- Implementation:
  - Replaced the worker placeholder with a real HTTP-backed worker runner and CLI entrypoint.
  - Supported job types: `campaign.export`, `campaign.import`, `ai.memory.extract`, and `ai.session.recap`.
  - Worker jobs authenticate to the API with `OTTE_SESSION_TOKEN` bearer auth or `OTTE_USER_ID` local compatibility auth.
  - Worker CLI reads one JSON job from stdin and writes a JSON job result to stdout.
- Automated evidence:
  - `pnpm --filter @open-tabletop/worker test` passed with `3 passed`.
  - `pnpm --filter @open-tabletop/worker typecheck` passed.
- Manual API evidence:
  - API: `http://127.0.0.1:4438`
  - SQLite file: `storage/worker-smoke-20260501.sqlite`
  - Environment: `OTTE_AI_PROVIDER=codex-loopback`, worker `OTTE_API_URL=http://127.0.0.1:4438`, worker `OTTE_USER_ID=usr_demo_gm`.
  - Worker job `job_worker_memory_smoke` of type `ai.memory.extract` succeeded and returned provider `codex-app-server`, memory text `Extracted memory: Worker smoke memory: the sapphire lens opens the vault.`, and event `message.completed`.
  - Worker job `job_worker_export_smoke` of type `campaign.export` succeeded and returned archive format `ottx`, `campaignCount: 1`, `tokenCount: 1`, and `memoryCount: 1`.

### Password Accounts And Campaign Invites Slice

- Implementation:
  - Added password-backed user registration and email/password login while preserving seeded passwordless users and `x-user-id` local compatibility.
  - Added campaign invite records with hashed one-time `oti_` tokens, email restrictions, expiration, accepted/revoked status, and role assignment for `gm`, `assistant_gm`, `player`, and `observer`.
  - Added invite create/list/revoke/accept REST endpoints and browser sidebar controls for GM invite creation plus invite acceptance into a campaign.
  - Campaign archives omit active invite tokens and user password hashes.
- Automated evidence:
  - `pnpm --filter @open-tabletop/core build` passed.
  - `pnpm --filter @open-tabletop/core test` passed with `2 passed`.
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/web typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `20 passed`.
  - `pnpm check` passed across lint, typecheck, tests, and build.
- Manual API evidence:
  - API: `http://127.0.0.1:4436`
  - SQLite file: `storage/manual-auth-invite-20260501.sqlite`
  - Password registration returned an `ots_` owner session and did not return `passwordHash`.
  - Created campaign `camp_momya2lyogjbhwn2` and an invite whose token started with `oti_`; the invite response and list response did not return `tokenHash`.
  - Invite list showed status `pending`; accepting the invite created user `usr_momya2nnetjt81gi`, returned status `accepted`, and gave the joiner access only to `camp_momya2lyogjbhwn2`.
  - The accepted member role was `player`; permissions included `token.move` and did not include `scene.update`.
  - Bad email/password login returned `401`; good email/password login returned an `ots_` token.
  - Reusing the accepted invite returned `409`.
  - Revoking a second invite returned status `revoked`; accepting the revoked token returned `403`.
- Manual browser evidence:
  - Web: `http://127.0.0.1:5186`
  - Playwright snapshot verified the GM sidebar showed the `Invites` form, created an invite for `browser.joiner@example.test`, showed status `Invite created`, and displayed a one-time `oti_` token.
  - Accepting the token through the browser Join form switched the session selector to `Browser Joiner - player`, showed status `Synced`, and disabled GM-only scene, map, token, combat, fog, wall, and light controls.
  - Screenshot saved at `output/playwright/auth-invite-joiner.png`.
  - Browser console had only the existing missing `favicon.ico` error plus React/devtools and autocomplete advisory messages.

### OIDC SSO Slice

- Implementation:
  - Added provider-neutral OIDC authorization-code SSO with discovery, PKCE, state, nonce, one-time callback state, and bearer session issuance.
  - Added durable `identities` records for provider/issuer/subject links and short-lived `oauthStates` records for login handshakes.
  - SSO users link to an existing account by normalized email when possible; otherwise the callback creates a passwordless account from OIDC userinfo.
  - Added `GET /api/v1/auth/oidc/config`, `GET|POST /api/v1/auth/oidc/start`, and `GET /api/v1/auth/oidc/callback`.
  - Added browser SSO startup plus callback hash consumption for `#ssoToken=<ots_token>&ssoUserId=<user_id>`.
  - Campaign archives omit operational identity, OAuth state, invite, and session records.
- Automated evidence:
  - `pnpm --filter @open-tabletop/core build` passed.
  - `pnpm --filter @open-tabletop/api-contracts build` passed.
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/web typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `21 passed`.
  - `pnpm check` passed across lint, typecheck, tests, and build.
  - API test verifies OIDC config/start/callback, PKCE `S256`, Basic token endpoint auth, bearer userinfo auth, identity persistence, email-based user linking/creation, returned `ots_` session authentication, OAuth state cleanup, and rejected state reuse.
- Manual API evidence:
  - API: `http://127.0.0.1:4437`
  - Web: `http://127.0.0.1:5187`
  - Local OIDC provider: `http://127.0.0.1:4712`
  - SQLite file: `storage/manual-oidc-sso-20260501.sqlite`
  - Provider `/authorize` received `client_id=manual-client`, `code_challenge_method=S256`, and an `oss_` state.
  - Provider `/token` received HTTP Basic client auth and an authorization-code body including `code=manual-code`, the configured callback URL, `client_id=manual-client`, and a PKCE `code_verifier`.
  - Provider `/userinfo` received `Bearer manual-access-token` and returned subject `manual-sso-gm`, email `gm@example.test`, and display name `Manual SSO GM`.
  - The API linked the identity to existing seeded user `usr_demo_gm` by email and stored identity `provider: oidc`, issuer `http://127.0.0.1:4712`, subject `manual-sso-gm`, email `gm@example.test`.
  - Browser localStorage held an `ots_` session token and `otte:sessionTokenUser=usr_demo_gm`; bearer `GET /api/v1/auth/session` returned user `usr_demo_gm` with owner membership in `camp_demo`.
  - SQLite inspection showed one stored OIDC identity, hashed session tokens, and no remaining `oauthStates`.
- Manual browser evidence:
  - Playwright verified `GET /api/v1/auth/oidc/config` returned `200` and the sidebar exposed the `SSO` button only with OIDC configured.
  - Playwright clicked the sidebar `SSO` button, completed the fake provider redirect, returned to `http://127.0.0.1:5187/`, and the app showed the linked GM session with status `Synced`.
  - After callback, campaign data reloaded through bearer-authenticated API requests, including `/api/v1/auth/oidc/config`, `/api/v1/auth/session`, `/api/v1/campaigns`, scene, members, assets, tokens, actors, journal, chat, encounters, combats, proposals, AI memory, plugins, and systems.
  - Screenshot saved at `output/playwright/oidc-sso-gm.png`.
  - Browser console had no errors; it showed the React devtools message, an autocomplete advisory, and one expected transient websocket warning from switching sessions during the login redirect.

### Production Auth Operations Slice

- Implementation:
  - Added password reset request/confirm endpoints with opaque `opr_` tokens stored only as `sha256` hashes.
  - Added email outbox records and optional webhook delivery through `OTTE_EMAIL_WEBHOOK_URL` and `OTTE_EMAIL_WEBHOOK_TOKEN`.
  - Added user password change and self-service session listing/revocation endpoints.
  - Added server-admin user/session/outbox endpoints gated by `OTTE_ADMIN_USER_IDS`.
  - Added account disable, password-reset-required flags, admin-triggered resets, all-session revocation, and disabled-user login blocking.
  - Disabled legacy `x-user-id` authentication outside tests unless `OTTE_ALLOW_LEGACY_USER_HEADER=true` is explicitly set.
  - Excluded password reset tokens and email outbox records from campaign archives.
  - Added Docker Compose and `.env.example` passthrough for admin/reset/email/legacy-auth settings.
- Automated validation:
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `25 passed`.
  - `pnpm check` passed across lint, typecheck, tests, and build.
  - API tests cover password reset email delivery and confirmation, no account enumeration for unknown reset requests, hashed reset token storage, rejected token reuse, password change with stale-session revocation, self session deletion, admin user listing, admin-triggered reset without a JSON body, admin session listing/revocation, all-session revocation for a user, disabled-user login/OIDC blocking, password-reset-required login blocking, admin outbox reads, and the production legacy-header hard fence.
- Manual API evidence:
  - API: `http://127.0.0.1:4439`
  - Email webhook: `http://127.0.0.1:4713/email`
  - SQLite file: `storage/manual-production-auth-20260501.sqlite`
  - Runtime env included `NODE_ENV=production`, `OTTE_ADMIN_USER_IDS=usr_demo_gm`, `OTTE_EMAIL_WEBHOOK_URL=http://127.0.0.1:4713/email`, `OTTE_EMAIL_WEBHOOK_TOKEN=manual-email-secret`, and `OTTE_PASSWORD_RESET_URL=http://127.0.0.1:5186/reset-password`.
  - `GET /api/v1/campaigns` with only `x-user-id: usr_demo_gm` returned `401`.
  - GM password reset request returned `200`; unknown email reset request also returned `200` and created zero webhook events.
  - The webhook received the GM reset email for `gm@example.test` with `Authorization: Bearer manual-email-secret`, provider `webhook`, and an `opr_` token in the reset URL.
  - `POST /api/v1/auth/password-reset/confirm` returned `200` with an `ots_` session token, and login with the new GM password returned `200`.
  - `GET /api/v1/auth/sessions` showed two GM sessions; deleting the reset-created session returned `200` and left one session.
  - Admin-triggered player reset returned `200`, did not expose `tokenHash`, and delivered a second webhook email for `player@example.test`.
  - Admin all-session revocation for `usr_demo_player` returned `{ "revoked": 1 }`; the revoked player bearer then returned `401`.
  - Admin disabled `usr_demo_player`; passwordless login for that user then returned `403`.
  - Admin email outbox returned two delivered webhook messages, one for GM and one for player.
  - SQLite inspection showed reset tokens and session tokens stored as `sha256:` hashes, no raw reset token field on reset records, two email outbox rows, and the GM password stored as a `scrypt:` hash.

### Production Auth Audit Export Slice

- Implementation:
  - Added redacted server audit records for admin user listing, account updates, admin-triggered password resets, session listing, single-session revocation, all-session revocation, email outbox reads, and audit export requests.
  - Added `GET /api/v1/admin/audit-logs`, gated by `OTTE_ADMIN_USER_IDS`, with filters for campaign, actor, action, target, ISO date range, and result limit.
  - Added JSON export metadata and NDJSON attachment export for operational handoff or archival.
  - Kept account snapshots in audit records on public user/session shapes so password hashes and reset token hashes are not exported.
- Automated validation:
  - `pnpm --filter @open-tabletop/core build` passed.
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `34 passed`.
  - `pnpm check` passed across lint, typecheck, tests, and build.
  - API tests verify non-admin denial, invalid limit rejection, filtered JSON export, redacted before/after account snapshots, NDJSON response headers, and actor filtering.
- Manual API evidence:
  - API: `http://127.0.0.1:4448`
  - SQLite file: `apps/api/storage/manual-auth-audit-20260501.sqlite`
  - Runtime env included `NODE_ENV=production`, `OTTE_ADMIN_USER_IDS=usr_demo_gm`, and `OTTE_SQLITE_PATH=storage/manual-auth-audit-20260501.sqlite`.
  - GM bearer login returned an `ots_` token.
  - Player bearer `GET /api/v1/admin/audit-logs` returned `403`.
  - Admin `PATCH /api/v1/admin/users/usr_demo_player` disabled the player with reason `manual audit evidence`.
  - Filtered JSON export for `action=admin.user.update`, `targetId=usr_demo_player`, and `limit=5` returned `count: 1`, `actorUserId: usr_demo_gm`, `before.disabled: false`, and `after.disabled: true`.
  - The exported before/after account snapshots did not include `passwordHash`.
  - NDJSON export for `format=ndjson`, `targetType=user`, and `actorUserId=usr_demo_gm` returned `content-type: application/x-ndjson`, an `opentabletop-audit-...ndjson` attachment filename, one line, and action `admin.user.update`.
  - Invalid date filter `since=not-a-date` returned `400`.

### Password Reset UI Slice

- Implementation:
  - Added a browser reset screen at `/reset-password` that can request a reset email and confirm an `opr_` token with a new password.
  - The reset screen reads `token=opr_...` from the URL, pre-fills the token field, submits the confirm request, stores the returned `ots_` bearer session, clears the reset URL, and reloads the authenticated workspace.
  - Added web API helpers for password reset request and confirmation.
- Automated validation:
  - `pnpm --filter @open-tabletop/web typecheck` passed.
  - `pnpm --filter @open-tabletop/web build` passed.
  - `pnpm check` passed across lint, typecheck, tests, and build.
- Manual browser evidence:
  - API: `http://127.0.0.1:4450`
  - Web: `http://127.0.0.1:5175/reset-password`
  - SQLite file: `apps/api/storage/manual-reset-ui-20260501b.sqlite`
  - Runtime env included `NODE_ENV=production`, `OTTE_ADMIN_USER_IDS=usr_demo_gm`, `OTTE_SQLITE_PATH=storage/manual-reset-ui-20260501b.sqlite`, and `OTTE_PASSWORD_RESET_URL=http://127.0.0.1:5175/reset-password`.
  - Playwright opened the reset screen, submitted `gm@example.test`, and the page showed `Reset email queued`.
  - Admin outbox returned a pending reset email to `gm@example.test` with a reset link at `http://127.0.0.1:5175/reset-password?token=opr_...`.
  - Opening the reset link pre-filled the `opr_` token, submitting a matching new password returned to `/`, loaded the authenticated workspace, and showed the synced GM campaign view.
  - Browser localStorage held an `ots_` session token and `otte:sessionTokenUser=usr_demo_gm`.
  - Screenshot saved at `output/playwright/reset-password-ui.png`.
  - Browser console had no errors or warnings after the password-field autocomplete fix.

### Server Admin Console Slice

- Implementation:
  - `GET /api/v1/auth/session` now returns `serverAdmin: true` for users listed in `OTTE_ADMIN_USER_IDS`.
  - Added a browser Admin tab gated by that session flag.
  - The Admin tab lists users, active sessions, email outbox messages, and recent audit records.
  - Admins can issue password reset emails, require password reset on next login, disable or enable accounts, revoke all sessions for a user, and revoke individual sessions from the browser.
  - Added typed web API helpers for admin snapshots and DELETE requests.
- Automated validation:
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/web typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `47 passed`.
  - `pnpm --filter @open-tabletop/web build` passed.
  - `pnpm check` passed across lint, typecheck, tests, and build.
- Manual browser evidence:
  - API: `http://127.0.0.1:4464`
  - Web: `http://localhost:5175/`
  - SQLite file: `apps/api/storage/manual-admin-console-20260501.sqlite`
  - Runtime env included `NODE_ENV=production`, `OTTE_ADMIN_USER_IDS=usr_demo_gm`, `OTTE_SQLITE_PATH=apps/api/storage/manual-admin-console-20260501.sqlite`, and `VITE_API_URL=http://127.0.0.1:4464`.
  - Playwright loaded the GM session and showed the Admin tab because `/api/v1/auth/session` returned server-admin status for `usr_demo_gm`.
  - The Admin tab loaded two users, one active GM session, an empty email outbox, and recent audit records.
  - Clicking the player Reset action queued a pending password-reset email for `player@example.test`; the outbox count changed to `1`, and the audit list showed `admin.user.passwordReset`.
  - Clicking Disable on `usr_demo_player` changed the user row to `disabled`, disabled reset/require actions, exposed Enable, and added `admin.user.update` to the audit list.
  - Clicking Enable restored the player row to active.
  - Switching to the Demo Player session removed the Admin tab while leaving the non-admin player workspace synced and GM-only controls disabled.
  - Screenshot saved at `output/playwright/admin-console.png`.
  - Browser console had no application runtime errors; the only error was a missing dev favicon.

### Production Auth MFA Slice

- Implementation:
  - Added local TOTP MFA enrollment, confirmation, status, and disable endpoints under `/api/v1/auth/mfa`.
  - Password login now returns `mfa_required` for MFA-enabled users until a valid `mfaCode` or one-time `recoveryCode` is supplied.
  - TOTP enrollment returns an `otpauth://` URL and secret once; confirmation returns one-time recovery codes and stores only hashed recovery codes.
  - Public/admin user responses and campaign archives redact TOTP secrets and recovery-code hashes.
  - API contracts and REST/self-hosting docs include the MFA endpoints and deployment behavior.
- Automated validation:
  - `pnpm --filter @open-tabletop/core build` passed.
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `35 passed`.
  - `pnpm check` passed across lint, typecheck, tests, and build.
  - API tests cover enrollment password checks, pending TOTP confirmation, public user redaction, missing-MFA login rejection, invalid-code rejection, valid TOTP login, recovery-code login, rejected recovery-code reuse, disable flow, and post-disable password login.
- Manual API evidence:
  - API: `http://127.0.0.1:4451`
  - SQLite file: `apps/api/storage/manual-mfa-20260501.sqlite`
  - Runtime env included `NODE_ENV=production`, `OTTE_ADMIN_USER_IDS=usr_demo_gm`, and `OTTE_SQLITE_PATH=storage/manual-mfa-20260501.sqlite`.
  - Registered `manual.mfa2@example.test`, then `GET /api/v1/auth/mfa` returned `totpEnabled: false`, `totpPending: false`, and `recoveryCodeCount: 0`.
  - TOTP enrollment returned `200`, a 32-character secret, and an `otpauth://totp/` URL.
  - TOTP confirmation returned `200`, `totpEnabled: true`, `totpPending: false`, and 8 one-time recovery codes.
  - Password login without MFA returned `401` with error `mfa_required`; login with invalid `mfaCode` returned `401`.
  - Login with a current TOTP code returned `200` with an `ots_` token.
  - Login with a recovery code returned `200` and reduced `recoveryCodeCount` to 7; reusing the same recovery code returned `401`.
  - Admin user listing for the MFA user did not include `totpSecret`, `recoveryCodeHashes`, or the enrollment secret.

### Production Asset Delivery Slice

- Implementation:
  - Added per-campaign asset quota enforcement through `OTTE_ASSET_QUOTA_BYTES`.
  - Added asset lifecycle metadata with `active`, `archived`, and `deleted` states, optional default retention through `OTTE_ASSET_RETENTION_DAYS`, and `410` blob responses for deleted or expired assets.
  - Added signed asset delivery URLs for bearer-free CDN/browser fetches, with configurable CDN base URL, HMAC secret, default TTL, and max TTL.
  - Added campaign storage stats and server-admin global storage stats, including used bytes, all bytes, provider counts, and lifecycle counts.
  - Added Docker Compose and `.env.example` passthrough for quota, retention, CDN base URL, signing secret, and signed URL TTL settings.
- Automated validation:
  - `pnpm --filter @open-tabletop/core build` passed.
  - `pnpm --filter @open-tabletop/api-contracts build` passed.
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `26 passed`.
  - `pnpm check` passed across lint, typecheck, tests, and build.
  - API tests cover signed CDN URL generation with path-prefix preservation, unauthenticated signed blob fetches, attachment delivery headers, invalid metadata rejection, invalid signature rejection, campaign quota rejection, lifecycle deletion, deleted-asset blob `410`, campaign storage stats, and admin global storage stats.
- Manual API evidence:
  - API: `http://127.0.0.1:4440`
  - SQLite file: `storage/manual-asset-delivery-20260501.sqlite`
  - Runtime env included `NODE_ENV=production`, `OTTE_ADMIN_USER_IDS=usr_demo_gm`, `OTTE_ASSET_CDN_BASE_URL=http://127.0.0.1:4440`, `OTTE_ASSET_URL_SIGNING_SECRET=manual-asset-secret`, `OTTE_ASSET_QUOTA_BYTES=64`, `OTTE_ASSET_RETENTION_DAYS=14`, `OTTE_ASSET_URL_TTL_SECONDS=120`, and `OTTE_ASSET_URL_MAX_TTL_SECONDS=600`.
  - GM bearer login returned `200`.
  - Asset upload created `asset_mon0yupf3nbwtmcc` with 21 bytes, lifecycle `active`, and a retention expiry.
  - Campaign storage stats returned `usedBytes: 21`, `quotaBytes: 64`, `lifecycleCounts.active: 1`, and `providerCounts.local: 1`.
  - Signed delivery URL generation returned `delivery: cdn`, host `127.0.0.1:4440`, and `ttlSeconds: 180`.
  - Fetching the signed blob without bearer auth returned `200`, body `manual-asset-delivery`, public cache headers, and attachment disposition.
  - A tampered signature returned `401`.
  - A second upload that would exceed the 64-byte quota returned `413` with `asset_quota_exceeded`.
  - Lifecycle deletion returned `200`, recorded `updatedByUserId: usr_demo_gm`, and the original signed blob URL then returned `410`.
  - Post-delete campaign and admin storage stats both returned `usedBytes: 0`, `allBytes: 21`, `lifecycleCounts.deleted: 1`, and `providerCounts.local: 1`.
  - SQLite inspection of `engine_records` showed the asset lifecycle persisted with `status: deleted` and reason `manual acceptance cleanup`.

### Production Asset Storage Ops Slice

- Implementation:
  - Added physical object deletion to the asset storage abstraction for local disk and S3-compatible storage.
  - Added server-admin asset migration at `POST /api/v1/admin/assets/migrate`; it verifies readable asset bytes against metadata before rewriting them through the active storage provider.
  - Added server-admin asset cleanup at `POST /api/v1/admin/assets/cleanup`; it removes stored bytes for deleted or expired assets after a configurable grace period while preserving metadata.
  - Added `storageDeletedAt` and `cleanupReason` lifecycle audit fields so repeated cleanup is idempotent and visible in storage records.
  - Added worker job types `asset.storage.migrate` and `asset.storage.cleanup` for running the admin operations outside request/response workflows.
  - Added Docker Compose and `.env.example` passthrough for `OTTE_ASSET_CLEANUP_GRACE_DAYS`.
- Automated validation:
  - `pnpm --filter @open-tabletop/core build` passed.
  - `pnpm --filter @open-tabletop/api-contracts build` passed.
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/worker typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `27 passed`.
  - `pnpm --filter @open-tabletop/worker test` passed with `4 passed`.
  - `pnpm check` passed across lint, typecheck, tests, and build.
  - API tests cover migration dry-run, migration from a local source object into the active storage provider, deleted-object cleanup, repeated cleanup idempotency, and expired-object cleanup.
  - Worker tests cover `asset.storage.migrate` and `asset.storage.cleanup` dispatch to the server-admin API routes with bearer auth.
- Manual API and worker evidence:
  - API: `http://127.0.0.1:4441`
  - SQLite file: `storage/manual-asset-ops-20260501.sqlite`
  - Upload directory: `storage/manual-asset-ops-uploads-20260501`
  - Runtime env included `NODE_ENV=production`, `OTTE_ASSET_STORAGE=local`, `OTTE_ADMIN_USER_IDS=usr_demo_gm`, and `OTTE_ASSET_CLEANUP_GRACE_DAYS=0`.
  - Asset upload created `asset_mon1drykg6pg6d2k` with local object `storage/manual-asset-ops-uploads-20260501/camp_demo/asset_mon1drykg6pg6d2k.bin`.
  - Worker CLI job `manual_asset_migrate_dry_run` of type `asset.storage.migrate` succeeded with `planned: 1` and `failed: 0`.
  - API migration with `overwrite: true` returned `migrated: 1` and `failed: 0`.
  - Lifecycle deletion returned `200` with reason `manual storage cleanup`.
  - Worker CLI job `manual_asset_cleanup` of type `asset.storage.cleanup` succeeded with `deleted: 1` and `failed: 0`.
  - The local object file no longer existed after cleanup.
  - Blob fetch for the deleted asset returned `410`.
  - A repeated cleanup call skipped the asset with `storage_already_deleted`.
  - SQLite inspection showed lifecycle `status: deleted`, `storageDeletedAt: 2026-05-01T14:57:12.316Z`, `updatedByUserId: usr_demo_gm`, and `cleanupReason: deleted_asset`.

### Asset Cleanup Scheduling Slice

- Implementation:
  - Added an API-hosted asset cleanup scheduler that can run cleanup on startup and/or a recurring interval from environment configuration.
  - Added non-overlapping scheduled runs with latest-run status, trigger, counts, failure text, and running state exposed through `GET /api/v1/admin/assets/storage`.
  - Added scheduler configuration for grace period, dry-run mode, deleted/expired inclusion, optional campaign scope, and lifecycle update user id.
  - Added Docker Compose and `.env.example` passthrough for the recurring cleanup settings.
- Automated validation:
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `53 passed`.
  - API tests verify scheduled cleanup status reporting, interval execution, expired-object deletion, lifecycle audit updates, and object removal from the active storage backend.
- Manual API evidence:
  - API: `http://127.0.0.1:4471`
  - SQLite file: `apps/api/storage/manual-asset-scheduled-cleanup-20260501.sqlite`
  - Upload directory: `apps/api/storage/manual-asset-scheduled-cleanup-uploads-20260501`
  - Runtime env included `NODE_ENV=production`, `OTTE_ASSET_STORAGE=local`, `OTTE_ADMIN_USER_IDS=usr_demo_gm`, `OTTE_ASSET_CLEANUP_INTERVAL_SECONDS=1`, `OTTE_ASSET_CLEANUP_GRACE_DAYS=0`, and `OTTE_ASSET_CLEANUP_USER_ID=usr_demo_gm`.
  - GM bearer login returned `200`.
  - Asset upload created `asset_moncq41v8f2fyy4y` with local object `camp_demo/asset_moncq41v8f2fyy4y.png`; the object file existed after upload.
  - Lifecycle deletion returned `200` with status `deleted` and reason `manual scheduled cleanup`.
  - Scheduled cleanup status reported `enabled: true`, `intervalSeconds: 1`, latest run `trigger: interval`, `status: succeeded`, `deleted: 1`, `failed: 0`, and `changed: true`.
  - The local object file no longer existed after the scheduled run.
  - Blob fetch for the deleted asset returned `410`.
  - Asset lifecycle after the scheduled run included `storageDeletedAt: 2026-05-01T20:14:42.906Z`, `updatedByUserId: usr_demo_gm`, and `cleanupReason: deleted_asset`.

### Asset CDN Edge Configuration Slice

- Implementation:
  - Added `apps/asset-edge`, a Cloudflare Worker package for signed asset blob delivery.
  - The worker validates the API-compatible HMAC payload `${assetId}:${expiresAt}:${disposition}` before origin fetch, rejects expired or tampered URLs, strips `Authorization` and `Cookie` from origin requests, preserves range/conditional request headers, and caps edge cache TTL by both `expiresAt` and `ASSET_EDGE_MAX_TTL_SECONDS`.
  - Added `apps/asset-edge/wrangler.jsonc` with deployable Worker settings for origin URL, optional route prefix, and edge TTL ceiling.
  - Added deployment docs in `docs/deployment/asset-edge.md` and linked the Worker from self-hosting and REST docs.
- Automated validation:
  - `pnpm --filter @open-tabletop/asset-edge test` passed with `5 passed`.
  - `pnpm --filter @open-tabletop/asset-edge typecheck` passed.
  - `pnpm --filter @open-tabletop/asset-edge exec wrangler --version` returned `4.87.0`.
  - Asset edge tests verify API-compatible signatures, route-prefix stripping, origin proxy URL construction, credential stripping, range forwarding, bounded cache headers, tampered signature rejection without origin fetch, expired signature rejection, non-blob route rejection, and non-success origin `no-store`.
- Manual API and edge evidence:
  - API: `http://127.0.0.1:4472`
  - SQLite file: `apps/api/storage/manual-asset-edge-20260501.sqlite`
  - Upload directory: `apps/api/storage/manual-asset-edge-uploads-20260501`
  - Runtime env included `NODE_ENV=production`, `OTTE_ASSET_STORAGE=local`, `OTTE_ADMIN_USER_IDS=usr_demo_gm`, `OTTE_ASSET_CDN_BASE_URL=https://assets.example.test/otte`, `OTTE_ASSET_URL_SIGNING_SECRET=manual-edge-secret`, and `OTTE_ASSET_URL_TTL_SECONDS=300`.
  - GM bearer login returned `200`.
  - Asset upload created `asset_monczy50mcm1qfq5` with local object `camp_demo/asset_monczy50mcm1qfq5.png`.
  - Signed delivery URL generation returned `delivery: cdn` and URL `https://assets.example.test/otte/api/v1/assets/asset_monczy50mcm1qfq5/blob?...`.
  - Local invocation of `handleAssetEdgeRequest` with `ASSET_ORIGIN_URL=http://127.0.0.1:4472`, `ASSET_EDGE_ROUTE_PREFIX=/otte`, and the shared signing secret returned `200`, body `manual-edge-asset`, `x-otte-asset-edge: validated`, and `cache-control: public, max-age=239`.
  - The edge origin request targeted `http://127.0.0.1:4472/api/v1/assets/asset_monczy50mcm1qfq5/blob?...` without the `/otte` prefix and did not forward `Authorization` or `Cookie`.
  - A tampered signature returned `401 invalid_asset_signature` before origin fetch.

### Asset Security Scanning Slice

- Implementation:
  - Added a built-in upload scanner that runs after size validation and before quota checks, asset record creation, or local/S3 storage writes.
  - Clean uploaded assets now persist `MapAsset.security` metadata with scanner name, scan timestamp, clean status, and findings.
  - Blocked uploads return `422 asset_security_blocked` with scanner findings and do not create asset records or stored object bytes.
  - The scanner blocks EICAR test signatures, active SVG content such as scripts/event handlers/javascript URLs/`foreignObject`, executable/script/HTML MIME types, disallowed executable/script extensions, and HTML/script bodies disguised as generic uploads.
- Automated validation:
  - `pnpm --filter @open-tabletop/core build` passed.
  - `pnpm --filter @open-tabletop/core typecheck` passed.
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `33 passed`.
  - `pnpm check` passed across lint, typecheck, tests, and build.
  - API tests verify clean SVG scan metadata and storage, active SVG rejection, EICAR signature rejection, HTML upload rejection, and no asset records for blocked uploads.
- Manual API evidence:
  - API: `http://127.0.0.1:4447`
  - SQLite file: `apps/api/storage/manual-asset-security-20260501.sqlite`
  - Upload directory: `apps/api/storage/manual-asset-security-uploads-20260501`
  - Runtime env included `NODE_ENV=production`, `OTTE_ADMIN_USER_IDS=usr_demo_gm`, `OTTE_SQLITE_PATH=storage/manual-asset-security-20260501.sqlite`, and `OTTE_UPLOAD_DIR=storage/manual-asset-security-uploads-20260501`.
  - GM bearer login returned `200` with an `ots_` token.
  - Clean passive SVG upload created `asset_mon462zexy80nc6u` with `security.status: clean`, scanner `builtin-asset-scanner`, and zero findings.
  - Stored object existed at `apps/api/storage/manual-asset-security-uploads-20260501/camp_demo/asset_mon462zexy80nc6u.svg`.
  - Active SVG upload returned `422` with finding code `active_svg_content`.
  - EICAR test upload returned `422` with finding code `malware_signature`.
  - HTML upload returned `422` with finding code `disallowed_asset_type`.
  - Final campaign asset count remained `1`, confirming blocked uploads did not create asset records.

### External Asset Trust Scanner Slice

- Implementation:
  - Added optional `OTTE_ASSET_TRUST_WEBHOOK_URL` upload scanning after the built-in scanner passes and before quota checks, asset record creation, or local/S3 storage writes.
  - The API posts `name`, `mimeType`, `sizeBytes`, `checksum`, and `contentBase64` to the scanner, with optional bearer auth from `OTTE_ASSET_TRUST_WEBHOOK_TOKEN`.
  - Scanner responses support `status: "clean"` or `status: "blocked"` plus optional scanner names and findings; blocked responses and high-severity findings reject the upload with `422 asset_security_blocked`.
  - Scanner HTTP errors, invalid responses, and timeouts fail closed by default through `OTTE_ASSET_TRUST_FAIL_CLOSED=true`; deployments can explicitly opt into fail-open behavior.
  - Clean external findings are persisted on `MapAsset.security` alongside the built-in scanner metadata, using a combined scanner label such as `builtin-asset-scanner+manual-trust-scanner`.
  - Added `.env.example`, REST API, and self-hosting docs for the webhook contract and environment variables.
- Automated validation:
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `56 passed`.
  - `pnpm check` passed across lint, typecheck, tests, and build.
  - `git diff --check` passed with only LF-to-CRLF warnings.
  - API tests verify clean uploads call the external scanner with bearer auth and upload metadata, scanner findings persist on the asset security record, scanner-blocked uploads create no asset records or stored bytes, and scanner failures fail closed before storage writes.
- Manual API evidence:
  - API: `http://127.0.0.1:53093`
  - Scanner webhook: `http://127.0.0.1:53092/scan`
  - SQLite file: `apps/api/storage/manual-asset-trust-20260501.sqlite`
  - Upload directory: `apps/api/storage/manual-asset-trust-uploads-20260501`
  - Runtime env included `NODE_ENV=production`, `OTTE_ASSET_STORAGE=local`, `OTTE_ADMIN_USER_IDS=usr_demo_gm`, `OTTE_ASSET_TRUST_WEBHOOK_URL=http://127.0.0.1:53092/scan`, `OTTE_ASSET_TRUST_WEBHOOK_TOKEN=manual-trust-token`, `OTTE_ASSET_TRUST_TIMEOUT_MS=2000`, and `OTTE_ASSET_TRUST_FAIL_CLOSED=true`.
  - GM bearer login returned `200`.
  - Clean upload `Manual Trust.png` created `asset_monddc20nbx57hyo` with `security.status: clean`, scanner `builtin-asset-scanner+manual-trust-scanner`, and finding `manual_trust_clean`.
  - Stored object existed at `apps/api/storage/manual-asset-trust-uploads-20260501/camp_demo/asset_monddc20nbx57hyo.png`.
  - The scanner received `Authorization: Bearer manual-trust-token`, `mimeType: image/png`, `sizeBytes: 18`, checksum `sha256:266bccd7ad98ad8563559e6c0801a9a33d3dfd3a370fca02145d62d41ce309a0`, and decoded content `manual-clean-asset`.
  - Blocked upload `Manual Blocked.png` returned `422 asset_security_blocked` with scanner `manual-trust-scanner` and finding `manual_trust_blocked`.
  - Final upload directory contained only `asset_monddc20nbx57hyo.png`, confirming the blocked upload did not write object bytes.

### Advanced Vision Rendering Slice

- Implementation:
  - Added a shared core ray-cast vision engine that computes bounded polygons from token vision, revealed fog regions, and wall-clipped colored lights.
  - Replaced player token visibility's center-line wall shortcut with the shared polygon containment check.
  - Added `GET /api/v1/scenes/{sceneId}/vision` so clients render the same permission-filtered vision state the API uses for token filtering.
  - Added terrain wall metadata with separate `blocksMovement` and `kind` fields, while preserving hard-wall defaults.
  - Rendered clipped colored light polygons, terrain-wall styling, and player fog-of-war masks in the browser scene canvas.
- Automated validation:
  - `pnpm --filter @open-tabletop/core build` passed.
  - `pnpm --filter @open-tabletop/core test` passed with `4 passed`.
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `27 passed`.
  - `pnpm --filter @open-tabletop/web typecheck` passed.
  - `pnpm check` passed across lint, typecheck, tests, and build.
  - Core tests verify token and light polygons are clipped by vision-blocking walls, including a terrain wall.
  - API tests verify player token filtering, the player vision endpoint's token/fog/light polygons, terrain wall authoring, and colored light polygons.
- Manual API and browser evidence:
  - API: `http://127.0.0.1:4442`
  - Web: `http://127.0.0.1:5188`
  - SQLite file: `storage/manual-vision-polygons-20260501.sqlite`
  - Configured `scn_vault_entry` with one revealed fog region, one hard wall, one terrain wall, Valen Ash vision radius `220`, one blue light `#38bdf8`, and one amber light `#f59e0b`.
  - Player token read returned `Valen Ash,Visible Guard,Fog Scout`; GM token read returned `Valen Ash,Visible Guard,Blocked Guard,Fog Scout`; `PlayerSeesBlocked: 0`.
  - Player vision endpoint returned `fogActive: true`, source counts `fog: 1`, `token: 1`, `light: 2`, token polygon points `129`, light colors `#38bdf8,#f59e0b`, and terrain wall `blocksMovement: false`.
  - GM vision endpoint returned `fogActive: false`, confirming the GM view is not masked.
  - Browser loaded as `Demo Player - player`, showed `Realtime connected`, rendered token markers `VA`, `VI`, and `FO`, and did not render the blocked `BL` marker.
  - Browser DOM verification found one `.vision-mask-layer`, two clipped light polygons, one terrain wall, one hard wall, and one fog outline.
  - Screenshot saved at `output/playwright/vision-polygons-player.png`.
  - Browser console had no errors or warnings after reload; it only showed the React DevTools info message and an autocomplete advisory.

### Dynamic Fog Tooling Slice

- Implementation:
  - Added fog region shapes and modes so scenes can store circle or polygon fog with `mode: "reveal" | "hide"`.
  - Extended the shared vision polygon output so hide/erase fog regions are returned alongside reveal regions and rendered as subtractive mask regions in the browser.
  - Added server-side visibility filtering where hide/erase fog overrides revealed fog and owned-token vision before player token reads are returned.
  - Added GM-only polygon reveal and hide brush authoring from the scene toolbar, plus a delete route for individual fog regions.
  - Rendered hide fog outlines separately so manual acceptance can distinguish revealed and erased regions in the player view.
- Automated validation:
  - `pnpm --filter @open-tabletop/core build` passed.
  - `pnpm --filter @open-tabletop/core test` passed with `5 passed`.
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `28 passed`.
  - `pnpm --filter @open-tabletop/web typecheck` passed.
  - `pnpm check` passed across lint, typecheck, tests, and build.
  - Core tests verify polygon fog regions and hide fog modes in shared vision polygon computation.
  - API tests verify players cannot author fog, GMs can create polygon reveal and circle hide regions, hide regions mask visible tokens, vision output returns reveal and hide modes, and GMs can delete fog regions.
- Manual API and browser evidence:
  - API: `http://127.0.0.1:4443`
  - Web: `http://127.0.0.1:5189`
  - SQLite file: `storage/manual-dynamic-fog-20260501.sqlite`
  - Configured `scn_vault_entry` with one polygon reveal region and one hide brush region.
  - Player token read returned `Valen Ash,Polygon Scout`; GM token read returned `Valen Ash,Polygon Scout,Erased Scout`; `PlayerSeesErased: 0`.
  - Player vision endpoint returned fog modes `{ "hide": 1, "reveal": 1 }` before browser toolbar interaction, with polygon point counts `4,72`.
  - Browser GM view exposed toolbar controls titled `Hide fog` and `Reveal polygon fog`; both controls were clicked successfully against the running API.
  - Browser loaded as `Demo Player - player`, showed `Realtime connected`, rendered token markers `VA` and `PO`, and did not render the erased `ER` marker.
  - Browser DOM verification found one `.vision-mask-layer`, two hide outlines, two reveal fog outlines, and toolbar titles for `Reveal fog`, `Hide fog`, and `Reveal polygon fog`.
  - Screenshot saved at `output/playwright/dynamic-fog-player.png`.
  - Browser console had no errors or warnings after reload; it only showed the React DevTools info message and an autocomplete advisory.

### Fog History And Undo Slice

- Implementation:
  - Added a scene-local `fogHistory` log that records fog create, delete, and undo entries with the acting user, fog id, region snapshot, and target history id for undo entries.
  - Added GM-only `GET /api/v1/scenes/{sceneId}/fog/history` and `POST /api/v1/scenes/{sceneId}/fog/undo` routes using the existing `token.reveal` permission boundary.
  - Made fog creation and deletion append history entries and audit rows; undo reverses the latest still-applicable create or delete entry, restores deleted region snapshots, removes created regions, appends an undo history entry, and emits a scene update.
  - Capped scene fog history at 100 entries so repeated brush operations cannot grow scene payloads without bound.
  - Added a GM toolbar button titled `Undo fog change` that calls the undo endpoint and refreshes the tabletop state.
  - Documented the history and undo routes in the REST contract docs and exported route helpers from `@open-tabletop/api-contracts`.
  - Fixed the AI core package's ESM re-export so the built API server can start through `node apps/api/dist/server.js`.
- Automated validation:
  - `pnpm --filter @open-tabletop/core build` passed.
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `60 passed`.
  - `pnpm --filter @open-tabletop/web typecheck` passed.
  - `pnpm --filter @open-tabletop/web build` passed.
  - `pnpm build` passed across `14 successful` build tasks.
  - `pnpm check` passed across lint, typecheck, tests, and build.
  - API tests verify player denial for fog history and undo, GM history after fog create/delete operations, undo restoring a deleted hide region, undo removing a created hide region, and undo audit log creation.
- Manual API evidence:
  - API: `http://127.0.0.1:55160`
  - SQLite file: `apps/api/storage/manual-fog-undo-20260501.sqlite`
  - Runtime env included `NODE_ENV=production`, `PORT=55160`, `HOST=127.0.0.1`, `OTTE_SQLITE_PATH=apps/api/storage/manual-fog-undo-20260501.sqlite`, and `OTTE_ADMIN_USER_IDS=usr_demo_gm`.
  - The server was the built API entrypoint `node apps/api/dist/server.js`; health returned `{ "ok": true, "version": "0.1.0", "service": "open-tabletop-api" }`.
  - GM and player bearer logins returned `ots_` token prefixes.
  - Scene `scn_vault_entry` was reset to `0` fog regions and `0` fog history entries before the run.
  - GM created polygon reveal `fog_monfibrokfs1c4ri` and hide brush `fog_monfibry3rqpsc4u`; history returned actions `create,create`.
  - Player history request returned `403`, confirming player denial on the history surface.
  - GM deleted hide brush `fog_monfibry3rqpsc4u`; the returned scene no longer included that region and the history tail was `delete`.
  - First undo restored the deleted hide brush; second undo removed the restored created hide brush.
  - Final history actions were `create,create,delete,undo,undo`.
  - Admin audit export for `scene.fog.undo` returned `2` rows, both targeting `fog_monfibry3rqpsc4u`.
  - After shutdown, no listener remained on port `55160`.

### Fog Multi-Scene Presets Slice

- Implementation:
  - Added campaign-scoped fog presets that store source-scene fog regions without region ids, including preset name, description, source scene id, timestamps, metadata, and SQLite/archive persistence.
  - Added GM-only `GET|POST /api/v1/campaigns/{campaignId}/fog-presets`, `DELETE /api/v1/campaigns/{campaignId}/fog-presets/{presetId}`, and `POST /api/v1/scenes/{sceneId}/fog/apply-preset` routes behind the existing `token.reveal` permission boundary.
  - Applying a preset can append to the target scene or replace existing fog; replace mode records delete history for removed regions, create history for applied regions, emits a scene update, and writes audit rows.
  - Added fog preset route helpers to `@open-tabletop/api-contracts`, REST documentation, snapshot loading for GM-capable users, and toolbar controls titled `Save fog preset` and `Apply latest fog preset`.
- Automated validation:
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `61 passed`.
  - `pnpm --filter @open-tabletop/web typecheck` passed.
  - `pnpm --filter @open-tabletop/web build` passed.
  - `pnpm build` passed across `14 successful` build tasks.
  - `pnpm check` passed across lint, typecheck, tests, and build.
  - API tests verify player denial for saving/applying presets, GM save/list/delete, replace-mode application to another scene, old fog removal, hide/reveal region recreation with new ids, delete/create/create fog history, and preset create/apply/delete audit rows.
- Manual API evidence:
  - API: `http://127.0.0.1:55161`
  - SQLite file: `apps/api/storage/manual-fog-presets-20260501.sqlite`
  - Runtime env included `NODE_ENV=production`, `PORT=55161`, `HOST=127.0.0.1`, `OTTE_SQLITE_PATH=apps/api/storage/manual-fog-presets-20260501.sqlite`, and `OTTE_ADMIN_USER_IDS=usr_demo_gm`.
  - The server was the built API entrypoint `node apps/api/dist/server.js`; health returned `true` and GM login returned `serverAdmin: true`.
  - GM reset `scn_vault_entry`, created one polygon reveal region and one hide brush region, then saved preset `fogp_mong0ns0j39v9m87` with `presetRegions: 2`.
  - Player save returned `403`.
  - GM preset list returned `listedPresets: 1`, and campaign export returned `archiveFogPresets: 1`.
  - GM created target scene `scn_mong0nt2uzn6uzuc` with an old fog region, applied the preset with `mode: "replace"`, and received applied region modes `hide,reveal` with new fog ids `fog_mong0ntas8sub6dx` and `fog_mong0ntaz5qk9xl4`.
  - Replace-mode fog history was `delete,create,create`, confirming the old region was removed and the two preset regions were recreated.
  - Player preset apply returned `403`.
  - Admin audit export for `scene.fogPreset.apply` returned `scene.fogPreset.apply`.
  - GM deleted the preset and a final list returned `remainingPresets: 0`.
  - After shutdown, no listener remained on port `55161`.

### Fog Freehand Brush Smoothing Slice

- Implementation:
  - Added `buildSmoothFogBrushPolygon` in the shared core vision engine to sanitize raw pointer strokes, clamp them to scene bounds, compact noisy input, smooth the centerline, resample the result, and persist a bounded polygon with at most `64` points.
  - Added `shape: "brush"` fog creation to the API with optional `brushRadius`; brush input is normalized into regular polygon fog regions and remains behind the existing `token.reveal` permission boundary, fog history, audit logging, and player vision filtering.
  - Added GM toolbar controls titled `Smooth reveal brush` and `Smooth hide brush`, a crosshair board mode, pointer-stroke preview rendering, and drag submission to the brush endpoint.
  - Updated REST documentation to describe freehand brush input and persisted polygon output.
- Automated validation:
  - `pnpm --filter @open-tabletop/core build` passed.
  - `pnpm --filter @open-tabletop/core test` passed with `6 passed`.
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `2 passed` and `62 passed` across the API suites.
  - `pnpm --filter @open-tabletop/web typecheck` passed.
  - `pnpm --filter @open-tabletop/web build` passed.
  - `pnpm check` passed across lint, typecheck, tests, and build.
  - Core tests verify noisy freehand strokes are smoothed into bounded polygons with configured brush radius, scene-bound points, at most `64` persisted points, and interior coverage for the stroke path.
  - API tests verify the fog route accepts `shape: "brush"`, compacts raw freehand points into a persisted polygon hide/reveal region, preserves the brush radius, keeps fewer persisted points than raw stroke input, covers the target path, and appends fog history.
- Manual API evidence:
  - API: `http://127.0.0.1:55163`
  - SQLite file: `apps/api/storage/manual-fog-brush-final-20260501.sqlite`
  - Runtime env included `NODE_ENV=production`, `PORT=55163`, `HOST=127.0.0.1`, `OTTE_SQLITE_PATH=apps/api/storage/manual-fog-brush-final-20260501.sqlite`, and `OTTE_ADMIN_USER_IDS=usr_demo_gm`.
  - The server was the built API entrypoint `node apps/api/dist/server.js`; health returned `true` and GM login returned `serverAdmin: true`.
  - GM reset `scn_vault_entry` to `0` fog regions and `0` fog history entries.
  - Player brush create returned `403`, confirming the existing `token.reveal` permission boundary.
  - GM posted a `90` point `shape: "brush"` reveal stroke with `brushRadius: 52`; the returned fog region `fog_mongr771zu8fcp57` was `shape: "polygon"`, `mode: "reveal"`, `radius: 52`, `pointCount: 64`, and contained probe point `{ x: 470, y: 280 }`.
  - GM posted an `84` point hide brush with `brushRadius: 44`; the returned fog region `fog_mongr77agrjvnajt` was `shape: "polygon"`, `mode: "hide"`, `radius: 44`, and `pointCount: 64`.
  - Fog history actions were `create,create`.
  - Player vision returned `fogActive: true` with fog modes `hide,reveal`.
  - Admin audit export for `scene.fog.create` returned `2` rows.
- Manual browser evidence:
  - Web: `http://127.0.0.1:5192/` pointed at the same API on `55163`.
  - Browser snapshot showed GM toolbar controls titled `Smooth reveal brush` and `Smooth hide brush`.
  - Clicking `Smooth reveal brush` switched the board into `scene-board brush-mode`; a real mouse drag across the board posted another brush stroke through the UI.
  - The scene then had `3` fog regions: the two API-created brush polygons plus UI-created reveal polygon `fog_mongspuh16exkrwu` with `radius: 67.5`, `points: 64`, and fog history `create,create,create`.
  - Screenshot saved at `output/playwright/fog-brush-smoothing.png`.
  - Browser console had no application runtime errors; the only error was the existing missing `favicon.ico` 404.
  - After shutdown, no listener remained on ports `55163` or `5192`.

### Packaged Plugin Runtime Slice

- Implementation:
  - Replaced the API's static plugin catalog and hard-coded `/spark` command branch with a manifest loader for local packages under `plugins/*/plugin.manifest.json`.
  - Added plugin manifest validation for semver-like versions, compatible core ranges, relative entrypoints, declared chat commands, and requested permissions from the plugin allowlist.
  - Added package path containment checks, server entrypoint SHA-256 checksums, source metadata, and `vm` sandbox metadata to the plugin catalog.
  - Added a VM-backed server command runner that exposes only a constrained `registerCommand` API, disables string and WASM code generation, times out module load and command execution, and passes token context only when the plugin grant includes `token.read`.
  - Added permission review on campaign plugin install so GMs can grant all requested permissions or an explicit subset; command execution remains blocked until both the human caller and plugin grant allow the operation.
  - Moved `example-macro-plugin` command behavior into `plugins/example-macro-plugin/server.sandbox.js`.
- Automated validation:
  - `pnpm --filter @open-tabletop/plugin-sdk build` passed.
  - `pnpm --filter @open-tabletop/plugin-sdk typecheck` passed.
  - `pnpm --filter @open-tabletop/plugin-sdk test` passed with no test files.
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `31 passed`.
  - `pnpm --filter @open-tabletop/web typecheck` passed.
  - `pnpm check` passed across lint, typecheck, tests, and build.
  - Plugin runtime tests verify package discovery, server-entrypoint metadata and checksums, sandbox command execution, hidden `process`, blocked `eval`, and rejection of entrypoints that escape the plugin package.
  - API tests verify observer install denial, invalid permission rejection, partial grant review, blocked command execution without `chat.write`, full grant review, and sandbox-produced `/spark` chat output with token context.
- Manual API and browser evidence:
  - API: `http://127.0.0.1:4444`
  - Web: `http://127.0.0.1:5190`
  - SQLite file: `storage/manual-plugin-runtime-20260501.sqlite`
  - Plugin catalog returned `example-macro-plugin` with package `example-macro-plugin`, sandbox `vm`, server entrypoint `example-macro-plugin/server.sandbox.js`, and checksum prefix `sha256:2573ee86bee2`.
  - Campaign plugin read initially returned `installed: false`.
  - Partial install granted `token.read`, returned missing permission `chat.write`, and `/spark` command execution returned `403`.
  - Full install granted `chat.write,token.read`, returned no missing permissions, and `/spark` produced plugin chat body `Spark macro: manual flare near Valen Ash.` from the sandboxed server entrypoint.
  - Global package registration rejected traversal package path `../outside` with `400`.
  - Browser SDK panel loaded as `usr_demo_gm`, showed `Realtime connected`, rendered `installed plugin`, `example-macro-plugin - vm sandbox - v0.1.0`, and exposed the `/spark` command button.
  - Browser chat included `plugin Spark macro: manual flare near Valen Ash.`.
  - Screenshot saved at `output/playwright/plugin-sandbox-gm.png`.
  - Browser console had no app runtime errors; it showed the existing missing `favicon.ico` 404, React DevTools info message, and an autocomplete advisory.

### Plugin Version Distribution Slice

- Implementation:
  - Extended the plugin runtime registry to keep multiple installed package versions for one plugin id and return the latest version by default.
  - Added catalog distribution metadata with `availableVersions` and `latestVersion` so clients can present upgrade and rollback options.
  - Added install-time version selection through `POST /api/v1/campaigns/:campaignId/plugins/:pluginId/install`.
  - Persisted installed plugin package id, version, checksum, and install timestamp in permission grant metadata.
  - Changed chat-command execution to run the installed grant version, so upgrading or rolling back a campaign changes the sandbox code that executes.
  - Exposed `installedVersion`, `updateAvailable`, and `rollbackVersions` in campaign plugin responses and web API types.
- Automated validation:
  - `pnpm --filter @open-tabletop/core build` passed.
  - `pnpm --filter @open-tabletop/core typecheck` passed.
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `44 passed`.
  - `pnpm --filter @open-tabletop/web typecheck` passed.
  - `pnpm check` passed across lint, typecheck, tests, and build.
  - Plugin runtime tests verify two package directories with one manifest id are exposed as one plugin with versions `2.0.0` and `1.0.0`, and that explicit command execution can run either version.
  - API tests verify catalog distribution metadata, install of version `1.0.0`, command output from version `1.0.0`, upgrade to `2.0.0`, command output from version `2.0.0`, rollback to `1.0.0`, and command output from the rolled-back package.
- Manual API evidence:
  - API: `http://127.0.0.1:4462`
  - SQLite file: `apps/api/storage/manual-plugin-versioning-20260501.sqlite`
  - Plugin root: `apps/api/storage/manual-plugin-versioning-plugins-20260501`
  - Catalog returned one `versioned-plugin` entry at version `2.0.0`, `installed: false`, `availableVersions: ["2.0.0","1.0.0"]`, and `latestVersion: "2.0.0"`.
  - Installing version `1.0.0` returned `installedVersion: "1.0.0"`, `updateAvailable: true`, `rollbackVersions: ["2.0.0"]`, grant metadata package `versioned-plugin-1`, version `1.0.0`, and a `sha256:` checksum.
  - `/version` produced chat body `Manual Version 1 macro`.
  - Upgrading to version `2.0.0` returned `installedVersion: "2.0.0"`, `updateAvailable: false`, `rollbackVersions: ["1.0.0"]`, grant metadata package `versioned-plugin-2`, version `2.0.0`, and a different `sha256:` checksum.
  - `/version` produced chat body `Manual Version 2 macro`.
  - Rolling back to version `1.0.0` restored grant metadata package `versioned-plugin-1` and `/version` again produced `Manual Version 1 macro`.
  - API server on port `4462` was stopped after evidence capture; no listener remained.

### Plugin Trust Policy Slice

- Implementation:
  - Added plugin package trust metadata to the runtime catalog: trust policy, status, installability, signature details, and trust errors.
  - Added `plugin.signature.json` verification for HMAC-SHA256 signatures over plugin id, version, manifest checksum, and server-entrypoint checksum.
  - Added `OTTE_PLUGIN_TRUST_POLICY=allow_unsigned|require_trusted` and `OTTE_PLUGIN_TRUST_KEYS` support, with Docker Compose and `.env.example` passthrough.
  - Enforced trusted-only mode on campaign plugin install and plugin command execution, so unsigned or tampered packages remain visible for review but cannot run when production policy requires trust.
  - Persisted trust metadata into plugin grant metadata and install/chat audit details.
- Automated validation:
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `47 passed`.
  - `pnpm --filter @open-tabletop/web typecheck` passed.
  - `pnpm check` passed across lint, typecheck, tests, and build.
  - Plugin runtime tests verify trusted signed packages, unsigned packages blocked by trusted-only policy, and tampered package signatures marked untrusted.
  - API tests verify trusted-only catalog metadata, unsigned install denial, signed install success, persisted grant trust metadata, and signed plugin command execution.
- Manual API evidence:
  - API: `http://127.0.0.1:4463`
  - SQLite file: `apps/api/storage/manual-plugin-trust-20260501.sqlite`
  - Plugin root: `apps/api/storage/manual-plugin-trust-plugins-20260501`
  - Runtime env included `OTTE_PLUGIN_TRUST_POLICY=require_trusted` and `OTTE_PLUGIN_TRUST_KEYS=trusted-local=shared-secret`.
  - Catalog returned `signed-plugin` as `trusted`, `installable: true`, key id `trusted-local`, and verified signature `true`.
  - Catalog returned `unsigned-plugin` as `unsigned`, `installable: false`, with error `Plugin package is unsigned and the current trust policy requires a verified signature`.
  - Catalog returned `tampered-plugin` as `untrusted`, `installable: false`, key id `trusted-local`, signature verified `false`, and error `Plugin signature does not match package contents`.
  - Installing `unsigned-plugin` returned `403`; installing `tampered-plugin` returned `403`.
  - Installing `signed-plugin` returned trust status `trusted`, installable `true`, key id `trusted-local`, and grant metadata trust status `trusted`.
  - Running `signed-plugin` `/version` produced chat body `Signed trust macro`.
  - API server on port `4463` was stopped after evidence capture; no listener remained.

### Remote Plugin Registry Sync Slice

- Implementation:
  - Added `OTTE_PLUGIN_REGISTRY_URLS` as a comma-separated allowlist of remote plugin registry catalog URLs and `OTTE_PLUGIN_REGISTRY_TIMEOUT_MS` for registry fetch timeouts.
  - Added `POST /api/v1/plugins/registry/sync` so GMs with `plugin.install` can sync an allowlisted registry into the configured plugin root.
  - Registry catalogs contain plugin package entries with `packageId`, `packageUrl` or `downloadUrl`, and optional `sha256:` package checksum; downloaded package documents contain a `files` object with `plugin.manifest.json`, entrypoints, and optional `plugin.signature.json`.
  - Synced packages are written under the configured plugin root with traversal-safe package ids and file paths, mirrored registry provenance in `plugin.registry.json`, and loaded through the existing manifest validation, path containment, versioning, VM sandbox, permission review, and trust-policy checks.
  - Registry sync refuses to overwrite existing local plugin package directories that do not already carry matching registry provenance.
  - Plugin catalog source metadata now distinguishes local packages from registry-synced packages and exposes registry URL, package URL, package checksum, and sync timestamp.
  - Registry sync writes a `plugin.registrySync` audit log containing imported plugin versions and per-registry errors.
- Automated validation:
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `58 passed`.
  - `pnpm check` passed across lint, typecheck, tests, and build.
  - `git diff --check` passed with only LF-to-CRLF warnings.
  - API tests verify allowlisted registry sync, remote package checksum verification, registry source metadata, registry-synced catalog visibility, install metadata, command execution through the sandboxed server entrypoint, and registry sync audit logs.
  - Plugin runtime tests verify remote registry sync refuses to overwrite an existing local package without registry provenance.
- Manual API evidence:
  - API: `http://127.0.0.1:55132`
  - Registry catalog: `http://127.0.0.1:55131/catalog.json`
  - SQLite file: `apps/api/storage/manual-plugin-registry-20260501.sqlite`
  - Plugin root: `apps/api/storage/manual-plugin-registry-plugins-20260501`
  - Runtime env included `NODE_ENV=production`, `OTTE_PLUGIN_DIR=apps/api/storage/manual-plugin-registry-plugins-20260501`, `OTTE_PLUGIN_REGISTRY_URLS=http://127.0.0.1:55131/catalog.json`, `OTTE_PLUGIN_REGISTRY_TIMEOUT_MS=2000`, and `OTTE_ADMIN_USER_IDS=usr_demo_gm`.
  - GM bearer login returned `200`.
  - Registry sync returned `200`, imported `manual-remote-plugin@1.0.0`, reported source `type: registry`, package `manual-remote-plugin-1`, registry URL, package URL, package checksum `sha256:6ffcca1a6eb46d0966da92615d055e2e9b4f288fb4a464871f3c95240bb9d9e4`, manifest checksum, server checksum, and no errors.
  - Campaign plugin catalog returned `manual-remote-plugin` with `installed: false`, `source.type: registry`, `distribution.latestVersion: "1.0.0"`, and `trust.status: unsigned` with `installable: true` under `allow_unsigned`.
  - Installing the synced plugin returned `200`, `installedVersion: "1.0.0"`, and grant metadata package `manual-remote-plugin-1`.
  - Running `/remote` returned plugin chat body `Manual remote registry macro`.
  - The mirrored package directory contained `plugin.manifest.json`, `server.js`, and `plugin.registry.json`; registry metadata persisted the registry URL, package URL, package checksum, and sync timestamp.
  - SQLite inspection of `auditLogs` showed `plugin.registrySync` with imported `manual-remote-plugin@1.0.0` and no registry errors.
  - API server on port `55132` and registry server on port `55131` were stopped after evidence capture; no listeners remained.

### Plugin Storage API Slice

- Implementation:
  - Added campaign-scoped plugin JSON storage entries to `EngineState`, SQLite persistence, and campaign archive export/import.
  - Added REST plugin storage routes: `GET /api/v1/campaigns/{campaignId}/plugins/{pluginId}/storage`, `GET|PUT|DELETE /api/v1/campaigns/{campaignId}/plugins/{pluginId}/storage/{key}`.
  - Storage reads, writes, deletes, and command-returned mutations require both the human caller's `plugin.configure` permission and an installed plugin grant that includes `plugin.configure`.
  - Storage keys are limited to 80 characters of letters, numbers, dot, underscore, colon, or dash; values must be JSON-serializable and are capped at 16 KiB.
  - VM chat command handlers receive a snapshot of their own plugin storage when granted `plugin.configure` and can return bounded storage mutations with the chat result.
  - Storage set/delete and command mutation paths write `plugin.storageSet`, `plugin.storageDelete`, and `plugin.storageMutation` audit logs.
- Automated validation:
  - `pnpm --filter @open-tabletop/core build` passed.
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `59 passed`.
  - `pnpm --filter @open-tabletop/api build` passed.
  - `pnpm check` passed across lint, typecheck, tests, and build.
  - API tests verify configure-gated storage API denial, configure-gated command mutation denial, REST storage set/list/read/delete, command-visible storage snapshots, command-returned storage mutations, and storage audit logs.
- Manual API evidence:
  - API: `http://127.0.0.1:55140`
  - SQLite file: `apps/api/storage/manual-plugin-storage-20260501.sqlite`
  - Plugin root: `apps/api/storage/manual-plugin-storage-plugins-20260501`
  - Runtime env included `NODE_ENV=production`, `OTTE_SQLITE_PATH=apps/api/storage/manual-plugin-storage-20260501.sqlite`, `OTTE_PLUGIN_DIR=apps/api/storage/manual-plugin-storage-plugins-20260501`, and `OTTE_ADMIN_USER_IDS=usr_demo_gm`.
  - GM bearer login returned `200` with an `ots_` token.
  - Installing `manual-storage-plugin` with only `chat.write` returned `200`; REST storage write and `/state` command mutation both returned `403` with `Plugin manual-storage-plugin lacks plugin.configure in this campaign`.
  - Reinstalling with `chat.write` and `plugin.configure` returned `200`.
  - `PUT /storage/settings` returned `200` with value `{ "enabled": true, "threshold": 4 }` and `updatedByType: "user"`.
  - Running `/state` with `manual-alpha` returned chat body `Manual storage count 1` and storage mutation `counter`; running it again with `manual-beta` returned `Manual storage count 2`.
  - `GET /storage` returned entries `counter` with `{ "count": 2, "args": "manual-beta" }` updated by `plugin` and `settings` updated by `user`.
  - `GET /storage/counter` returned `200` with `{ "count": 2, "args": "manual-beta" }`.
  - `DELETE /storage/settings` returned `{ "deleted": true, "key": "settings" }`; subsequent `GET /storage` returned only `counter`.
  - SQLite inspection of `auditLogs` showed `plugin.storageSet`, two `plugin.storageMutation` entries, and `plugin.storageDelete`.
  - API server on port `55140` was stopped after evidence capture; no listener remained.

### Plugin Marketplace Review Slice

- Implementation:
  - Added version/checksum-scoped plugin marketplace review records to `EngineState` and SQLite persistence.
  - Added server-admin review endpoints: `GET /api/v1/admin/plugins/reviews` and `PATCH /api/v1/admin/plugins/reviews/{reviewKey}`.
  - Added `OTTE_PLUGIN_REVIEW_POLICY=require_approved` so production operators can block plugin install and execution until a package review is approved; rejected package reviews block install and execution even in the default permissive mode.
  - Exposed marketplace review state in campaign plugin catalog responses.
  - Added a Plugin Reviews section to the browser Admin tab with policy totals, package source/trust metadata, approval, rejection, and reset actions.
  - Added `admin.pluginReviews.list` and `admin.pluginReview.update` audit logs.
- Automated validation:
  - `pnpm --filter @open-tabletop/core build` passed.
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/web typecheck` passed.
  - `pnpm --filter @open-tabletop/api-contracts typecheck` passed.
  - `pnpm --filter @open-tabletop/api build` passed.
  - `pnpm --filter @open-tabletop/web build` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `60 passed`.
  - `pnpm check` passed across lint, typecheck, tests, and build.
  - API tests verify strict review-policy install denial, server-admin approval, install after approval, command execution after approval, rejection after install, execution denial after rejection, campaign plugin review metadata, and admin review audit logs.
- Manual API evidence:
  - API: `http://127.0.0.1:55150`
  - SQLite file: `apps/api/storage/manual-plugin-review-20260501.sqlite`
  - Plugin root: `apps/api/storage/manual-plugin-review-plugins-20260501`
  - Runtime env included `NODE_ENV=production`, `OTTE_PLUGIN_REVIEW_POLICY=require_approved`, `OTTE_SQLITE_PATH=apps/api/storage/manual-plugin-review-20260501.sqlite`, and a bearer-auth server-admin user registered through the API.
  - `GET /api/v1/admin/plugins/reviews` returned `policy.mode: "require_approved"`, totals `{ "pending": 1, "approved": 0, "rejected": 0, "blocked": 1 }`, and a pending local review for `manual-review-plugin@1.0.0` with source package `manual-review-plugin-1`.
  - Installing `manual-review-plugin` before approval returned `403` with `requires marketplace approval`.
  - `PATCH /api/v1/admin/plugins/reviews/{reviewKey}` to `approved` returned `200`, persisted admin notes, set `reviewedByUserId`, and made the package installable.
  - Installing after approval returned `200` with `installedVersion: "1.0.0"` and `marketplaceReview.review.status: "approved"`.
  - Running `/review` returned plugin chat body `Manual review macro`.
  - Patching the same review to `rejected` returned `200`, `installable: false`, and `Plugin manual-review-plugin@1.0.0 was rejected by marketplace review`.
  - Running `/review` after rejection returned `403` with the rejected-review message, and campaign plugin catalog metadata reflected the rejected review.
  - SQLite-backed audit rows showed `admin.pluginReviews.list`, two `admin.pluginReview.update` rows, `plugin.install`, and `plugin.chatCommand`.
  - API server on port `55150` was stopped after evidence capture; no listener remained.

### Rules Compendium And Conditions Slice

- Implementation:
  - Added a Generic Fantasy compendium with item, spell, and condition entries for Longsword, Healing Word, Blessed, Poisoned, and Restrained.
  - Added system runtime helpers for applying/removing compendium-backed actor conditions and for building actor sheets with inventory, spells, active conditions, and condition-aware quick rolls.
  - Added campaign-scoped API routes to list a system compendium, add item/spell compendium entries to an actor, apply actor conditions, and remove actor conditions.
  - Updated the browser actor panel to load actor items and render active conditions, inventory, and spells beside the existing HP controls and raw actor data.
  - Updated API contracts and REST/System SDK docs for the compendium and condition routes.
- Automated validation:
  - `pnpm --filter @open-tabletop/system-sdk test` passed with `2 passed`.
  - `pnpm --filter @open-tabletop/system-sdk typecheck` passed.
  - `pnpm --filter @open-tabletop/system-sdk build` passed.
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `31 passed`.
  - `pnpm --filter @open-tabletop/web typecheck` passed.
  - `pnpm check` passed across lint, typecheck, tests, and build.
  - System SDK tests verify Blessed adds `+1d4`, Poisoned switches checks to `2d20kl1`, condition removal preserves other conditions, and sheets split inventory from spells.
  - API tests verify compendium reads, observer condition mutation denial, Healing Word import, Blessed/Poisoned condition effects, condition removal, and conditioned rolls posted through the system roll endpoint.
- Manual API and browser evidence:
  - API: `http://127.0.0.1:4445`
  - Web: `http://127.0.0.1:5191`
  - SQLite file: `storage/manual-rules-runtime-20260501.sqlite`
  - Bearer login returned an `ots_` token prefix.
  - Compendium API returned ids `longsword,healing-word,blessed,poisoned,restrained`.
  - Adding `healing-word` to Valen Ash created spell item `Healing Word` and the actor sheet listed spell `Healing Word`.
  - Applying Blessed and Poisoned produced sheet conditions `Blessed,Poisoned` and Charisma quick-roll formula `2d20kl1+2+1d4`.
  - Deleting Poisoned left condition `Blessed` and changed the Charisma quick-roll formula back to `1d20+2+1d4`.
  - Posting the system roll after deletion returned roll label `Charisma Check` and formula `1d20+2+1d4`.
  - Browser GM view loaded as `Demo GM - owner`, showed `Realtime connected`, selected actor `Valen Ash`, rendered condition `Blessed`, rendered spell `Healing Word`, and showed chat roll `Valen Ash Charisma Check: 1d20+2+1d4`.
  - Screenshot saved at `output/playwright/rules-compendium-gm.png`.
  - Browser console had no app runtime errors; it showed the existing missing `favicon.ico` 404, React DevTools info message, and an autocomplete advisory.

### Second Rules System Slice

- Implementation:
  - Added a second packaged example system at `plugins/example-system-stellar-frontiers` with a manifest, actor schema, item schema, client registration, and server helper.
  - Added a built-in Stellar Frontiers runtime with aptitude quick rolls, strain-aware sheets, gear, talents, and conditions for Locked In, Jammed, and Vacuum Exposed.
  - Generalized system API helpers so compendium import, condition application/removal, sheet reads, rolls, and the AI `read_compendium` tool route by system id instead of assuming Generic Fantasy.
  - Added Stellar Frontiers to the installed system catalog and browser SDK panel, including campaign activation and a Tech Check action for Stellar actors.
- Automated validation:
  - `pnpm --filter @open-tabletop/system-sdk test` passed with `4 passed`.
  - `pnpm --filter @open-tabletop/system-sdk build` passed.
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `49 passed`.
  - `pnpm --filter @open-tabletop/web typecheck` passed.
  - `pnpm --filter @open-tabletop/web build` passed.
  - `pnpm check` passed across lint, typecheck, tests, and build.
  - `git diff --check` passed.
  - System SDK tests verify Stellar Frontiers Locked In and Jammed condition effects, condition removal, gear/talent sheet surfaces, and compendium lookups.
  - API tests verify campaign activation of Stellar Frontiers, Stellar compendium reads, actor sheet quick rolls, talent import, condition-aware aptitude formulas, GM chat-posted rolls, and observer roll denial.
- Manual API and browser evidence:
  - API: `http://127.0.0.1:4466`
  - Web: `http://127.0.0.1:5192`
  - SQLite file: `apps/api/storage/manual-stellar-frontiers-20260501.sqlite`
  - Runtime env included `NODE_ENV=production`, `OTTE_ADMIN_USER_IDS=usr_demo_gm`, and `OTTE_SQLITE_PATH=apps/api/storage/manual-stellar-frontiers-20260501.sqlite`.
  - Bearer login returned an `ots_` token prefix.
  - Installing Stellar Frontiers changed the campaign default system to `stellar-frontiers`; a follow-up system list returned `generic-fantasy:False,stellar-frontiers:True`.
  - Stellar Frontiers compendium returned ids `laser-carbine,med-patch,overclock,locked-in,jammed,vacuum-exposed`.
  - Created Stellar actor `Nova Quill` with tech aptitude `3` and strain `3/6`; the initial Tech Check formula was `1d20+3`.
  - Importing `laser-carbine` listed gear `Laser Carbine`; importing `overclock` listed talent `Overclock`.
  - Applying Locked In changed Tech Check to `1d20+3+1d6`; applying Jammed changed it to `2d20kl1+3+1d6`.
  - Posting the Stellar system roll returned label `Tech Check`, formula `2d20kl1+3+1d6`, and chat `Nova Quill Tech Check: 2d20kl1+3+1d6 = 12`.
  - Browser SDK panel loaded as `Demo GM - owner`, showed `Stellar Frontiers` as the active system, showed `Generic Fantasy` as an available system with `Activate`, selected the Stellar actor `Nova Quill`, exposed `Tech Check`, and rendered the Stellar roll in chat.
  - Screenshot saved at `output/playwright/stellar-frontiers-system.png`.
  - Browser page errors were empty; console output only showed Vite connection/debug lines and the React DevTools info message.

### Rules Character Builder And Advancement Slice

- Implementation:
  - Added system-owned character templates for Generic Fantasy (`Guardian`, `Mender`) and Stellar Frontiers (`Freighter Pilot`, `Ship Tech`).
  - Added guided advancement helpers for Generic Fantasy level progression and Stellar Frontiers rank progression.
  - Added campaign-scoped API routes to list system templates, create actors from templates with starting compendium items, list advancement options, and apply advancement to owned or GM-editable actors.
  - Added browser SDK-panel controls for creating active-system characters and advancing the selected actor.
  - Updated API contracts and REST/System SDK docs for the character builder and advancement routes.
- Automated validation:
  - `pnpm --filter @open-tabletop/system-sdk test` passed with `6 passed`.
  - `pnpm --filter @open-tabletop/system-sdk build` passed.
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `50 passed`.
  - `pnpm --filter @open-tabletop/web typecheck` passed.
  - `pnpm --filter @open-tabletop/api-contracts typecheck` passed.
  - System SDK tests verify template lookup, starting item ids, Generic Fantasy level advancement, and Stellar Frontiers rank advancement.
  - API tests verify template listing, player create denial, GM template-based character creation, starting item creation, owned-player advancement, and Stellar Frontiers template/advancement behavior.
- Manual API and browser evidence:
  - API: `http://127.0.0.1:4467`
  - Web: `http://127.0.0.1:5193`
  - SQLite file: `apps/api/storage/manual-character-builder-20260501.sqlite`
  - Runtime env included `NODE_ENV=production`, `OTTE_ADMIN_USER_IDS=usr_demo_gm`, and `OTTE_SQLITE_PATH=apps/api/storage/manual-character-builder-20260501.sqlite`.
  - GM and player bearer logins each returned an `ots_` token prefix.
  - Generic Fantasy template listing returned ids `guardian,mender`.
  - Player direct character creation returned `403`, confirming `actor.create` is still required.
  - GM-created `Manual Guardian` from the Guardian template for owner `usr_demo_player`; starting items included `Longsword`.
  - Guardian advancement options returned `level-up:2`; the owning player applied advancement, producing level `2`, HP `17/17`, and features `Shield Wall,Guardian Level 2`.
  - Installing Stellar Frontiers changed the campaign default system to `stellar-frontiers`.
  - Stellar Frontiers template listing returned ids `freighter-pilot,ship-tech`.
  - GM-created `Manual Ship Tech` from the Ship Tech template; starting items included `Med Patch,Overclock`, and the sheet talent list included `Overclock`.
  - The owning player applied Stellar rank advancement, producing rank `2`, strain `4/7`, and milestones `Patch Cable Genius,Rank 2 Field Promotion`.
  - Browser SDK panel loaded as `Demo GM - owner`, showed `Stellar Frontiers` active, rendered character template cards for `Freighter Pilot` and `Ship Tech`, and a browser click on `Ship Tech` `Create` posted `POST /systems/stellar-frontiers/characters` with status `200`.
  - Live API check after the browser click showed one additional `Ship Tech` actor.
  - Screenshot saved at `output/playwright/rules-character-builder.png`.
  - Browser page errors were empty; console output only showed Vite connection/debug lines and the React DevTools info message.

### Rules Encounter Math Slice

- Implementation:
  - Added Generic Fantasy and Stellar Frontiers threat catalogs with per-threat budget values and roles.
  - Added system SDK encounter planners that calculate party rating, selected threat budget, difficulty, and a readable encounter summary.
  - Added campaign-scoped API routes to list encounter threats and to plan encounters, with optional persisted encounter creation.
  - Kept permission boundaries split: read-only planning requires `campaign.read`, while creating a stored encounter requires `combat.manage`.
  - Added browser SDK-panel support for creating a planned encounter from the active system and displaying the resulting budget metric.
- Automated validation:
  - `pnpm --filter @open-tabletop/system-sdk test` passed with `8 passed`.
  - `pnpm --filter @open-tabletop/system-sdk build` passed.
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `51 passed`.
  - `pnpm --filter @open-tabletop/api-contracts build` passed.
  - `pnpm --filter @open-tabletop/web typecheck` passed.
  - `pnpm --filter @open-tabletop/web build` passed.
  - System SDK tests verify Generic Fantasy and Stellar Frontiers budget calculations and summaries.
  - API tests verify both system threat catalogs, planned difficulty math, GM persisted encounter creation, and player denial when trying to create a planned encounter.
- Manual API and browser evidence:
  - API: `http://127.0.0.1:4468`
  - Web: `http://127.0.0.1:5194`
  - SQLite file: `apps/api/storage/manual-encounter-math-20260501.sqlite`
  - Runtime env included `NODE_ENV=production`, `OTTE_ADMIN_USER_IDS=usr_demo_gm`, and `OTTE_SQLITE_PATH=apps/api/storage/manual-encounter-math-20260501.sqlite`.
  - GM and player bearer logins each returned an `ots_` token prefix.
  - Generic Fantasy threat listing returned `goblin-cutpurse:50`, `skeletal-guard:75`, and `ogre-brute:200`.
  - A Guardian party member against two Skeletal Guards planned a `hard` encounter with party rating `100`, threat budget `150`, and summary `hard encounter: 2x Skeletal Guard (150/100 budget)`.
  - Player persisted encounter creation returned `403`, confirming `combat.manage` is required for `createEncounter`.
  - GM persisted `Manual Budgeted Guards` with difficulty `hard`.
  - Stellar Frontiers threat listing returned `boarding-drone:45`, `void-raider:70`, and `corsair-ace:180`.
  - A Ship Tech party member against two Boarding Drones and one Void Raider planned a `deadly` encounter with party rating `90`, threat budget `160`, and summary `deadly encounter: 2x Boarding Drone, 1x Void Raider (160/90 budget)`.
  - GM persisted `Manual Void Boarding`; the stored encounter list included `Manual Budgeted Guards` and `Manual Void Boarding`.
  - Browser SDK panel loaded with `Stellar Frontiers` active, clicked `Plan Encounter`, issued `POST /api/v1/campaigns/camp_demo/systems/stellar-frontiers/encounter-plan`, and rendered the resulting `hard encounter` metric `140/90`.
  - Screenshot saved at `output/playwright/rules-encounter-math.png`.
  - Browser page errors were empty; console output only showed Vite connection/debug lines and the React DevTools info message.

### Rules Character Importer Slice

- Implementation:
  - Added Generic Fantasy and Stellar Frontiers character import normalizers that accept external JSON-like character data and normalize names, levels/ranks, HP/strain pools, abilities/aptitudes, features/milestones, conditions, and compendium-backed item selections.
  - Added campaign-scoped API route `POST /api/v1/campaigns/{campaignId}/systems/{systemId}/characters/import`.
  - Kept importer creation behind the existing `actor.create` permission boundary.
  - Added browser SDK-panel support for importing a sample active-system character and displaying the imported actor name.
  - Updated API contracts and REST/System SDK docs for the importer route.
- Automated validation:
  - `pnpm --filter @open-tabletop/system-sdk test` passed with `10 passed`.
  - `pnpm --filter @open-tabletop/system-sdk build` passed.
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `52 passed`.
  - `pnpm --filter @open-tabletop/api-contracts build` passed.
  - `pnpm --filter @open-tabletop/web typecheck` passed.
  - `pnpm --filter @open-tabletop/web build` passed.
  - System SDK tests verify Generic Fantasy and Stellar Frontiers importer normalization, compendium item mapping, condition mapping, and skipped unknown entries.
  - API tests verify player importer denial, GM imported actor creation, item and sheet creation, warnings for skipped unknown entries, and Stellar Frontiers gear/talent/condition import behavior.
- Manual API and browser evidence:
  - API: `http://127.0.0.1:4469`
  - Web: `http://127.0.0.1:5195`
  - SQLite file: `apps/api/storage/manual-character-import-20260501.sqlite`
  - Runtime env included `NODE_ENV=production`, `OTTE_ADMIN_USER_IDS=usr_demo_gm`, and `OTTE_SQLITE_PATH=apps/api/storage/manual-character-import-20260501.sqlite`.
  - GM and player bearer logins each returned an `ots_` token prefix.
  - Player direct import returned `403`, confirming `actor.create` is required.
  - GM imported `Manual Imported Mender` for owner `usr_demo_player`; normalized level was `3`, condition was `blessed`, items were `Healing Word,Longsword`, and warning was `Unknown compendium entry skipped: missing-item`.
  - GM imported `Manual Imported Ace`; normalized rank was `4`, conditions were `locked-in,vacuum-exposed`, inventory listed `Laser Carbine`, and talents listed `Overclock`.
  - Campaign actor list contained two manual imported actors.
  - Browser SDK panel loaded with `Generic Fantasy` active, clicked `Import Character`, issued `POST /api/v1/campaigns/camp_demo/systems/generic-fantasy/characters/import`, and rendered `Imported Character` as `Imported Mender`.
  - Screenshot saved at `output/playwright/rules-character-import.png`.
  - Browser page errors were empty; console output only showed Vite connection/debug lines, the React DevTools info message, and the expected Vite hot update for `App.tsx`.

### Rules Action Automation Slice

- Implementation:
  - Added Generic Fantasy action quick rolls for actor-owned compendium items and spells, including Longsword damage/versatile damage and Healing Word healing formulas resolved from actor attributes.
  - Added Stellar Frontiers action quick rolls for actor-owned gear and talents, including Laser Carbine damage, Med Patch healing, and Overclock boost formulas resolved from actor aptitudes.
  - Updated the system roll endpoint so item/spell/gear/talent action roll ids are available alongside ability and aptitude checks and can post the resolved formulas into chat.
  - Added browser actor-panel Actions output so compendium-backed action formulas are visible with inventory, spells, and talents.
  - Updated REST and System SDK docs for compendium-backed action formulas.
- Automated validation:
  - `pnpm --filter @open-tabletop/system-sdk test` passed with `10 passed`.
  - `pnpm --filter @open-tabletop/system-sdk build` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `52 passed`.
  - `pnpm --filter @open-tabletop/web build` passed.
  - System SDK tests verify Generic Fantasy item/spell action rolls and Stellar Frontiers gear/talent action rolls in sheet quick rolls.
  - API tests verify compendium-backed action roll ids can be selected through the system roll endpoint and posted into chat for both systems.
- Manual API and browser evidence:
  - API: `http://127.0.0.1:4470`
  - Web: `http://localhost:5175`
  - SQLite file: `apps/api/storage/manual-rules-action-automation-20260501.sqlite`
  - Runtime env included `NODE_ENV=production`, `OTTE_ADMIN_USER_IDS=usr_demo_gm`, `OTTE_SQLITE_PATH=storage/manual-rules-action-automation-20260501.sqlite`, and `VITE_API_URL=http://127.0.0.1:4470`.
  - GM and player bearer logins each returned an `ots_` token prefix.
  - GM attached `Healing Word` and `Longsword` to Valen Ash; the sheet action quick rolls showed `Healing Word Healing=1d4+2` and `Longsword Damage=1d8+2`.
  - GM rolled Longsword damage and the player rolled Healing Word healing through the system roll endpoint; returned formulas were `1d8+2` and `1d4+2`.
  - GM installed Stellar Frontiers, created `Manual Ship Tech`, and attached `Laser Carbine`, `Overclock`, and `Med Patch`; the sheet action quick rolls showed `Laser Carbine Damage=1d8+2`, `Overclock Boost=1d6+3`, and `Med Patch Healing=1d6+2`.
  - GM/player action rolls for the Stellar actor returned formulas `1d8+2`, `1d6+3`, and `1d6+2`.
  - Manual item count was `5` and chat roll message count was `5`, confirming the evidence run created the intended action items and posted each roll once.
  - Browser actor panel showed `Inventory: Longsword`, `Spells: Healing Word`, and `Actions: Healing Word Healing: 1d4+2, Longsword Damage: 1d8+2, Longsword Versatile: 1d10+2`.
  - Screenshot saved at `output/playwright/rules-action-automation.png`.
  - Browser page errors had no application runtime failures; console output was limited to the React DevTools info message, a missing `favicon.ico` 404, and an autocomplete hint.

### Third Rules System Slice

- Implementation:
  - Added the built-in `mystic-noir` rules runtime alongside Generic Fantasy and Stellar Frontiers.
  - Added Mystic Noir compendium entries for clues, rituals, and conditions; Field Investigator and Occult Scholar character templates; case-breakthrough advancement; character import normalization; composure-aware sheets; skill quick rolls; condition-aware Focused/Shaken roll automation; compendium-backed Case Notebook and Warding Rite action formulas; and case-scene encounter budget planning.
  - Added `plugins/example-system-mystic-noir` with a manifest, actor schema, item schema, client registration, and server helper so the third system is represented in the installable example-system pattern.
  - Updated API system dispatch, the installed system registry, the AI `read_compendium` tool description, the browser SDK panel helpers, actor-panel clue/ritual surfaces, REST docs, and System SDK docs for the third rules system.
- Automated validation:
  - `pnpm --filter @open-tabletop/system-sdk test -- --run` passed with `15 passed`.
  - `pnpm --filter @open-tabletop/system-sdk build` passed.
  - `pnpm --filter @open-tabletop/api build` passed.
  - `pnpm --filter @open-tabletop/api test -- src/app.test.ts -t "supports a third rules system"` passed with `1 passed, 56 skipped`.
  - `pnpm --filter @open-tabletop/api test -- src/app.test.ts` passed with `57 passed`.
  - `pnpm --filter @open-tabletop/web build` passed.
  - System SDK tests verify Mystic Noir condition effects, sheet clue/ritual surfaces, action formulas, templates, advancement, importer normalization, and encounter budgets.
  - API tests verify Mystic Noir campaign activation, compendium listing, actor sheets, clue/ritual attachment, action rolls, Focused/Shaken condition automation, player roll permission, observer denial, template creation, advancement, importer normalization, and encounter planning.
- Manual API evidence:
  - Manual smoke used the built API modules from `apps/api/dist` with `MemoryStateStore` and `OTTE_ALLOW_LEGACY_USER_HEADER=true` for local compatibility headers.
  - Activating Mystic Noir returned `200`; the campaign system list reported `generic-fantasy:false,stellar-frontiers:false,mystic-noir:true`.
  - Character templates returned `field-investigator` and `occult-scholar`.
  - Creating `Manual Investigator` from the Field Investigator template returned `200`, produced actor `act_moni2zeu35ru1lcg`, and sheet clues included `Case Notebook`.
  - Applying Focused changed the `skill-investigation` formula to `1d20+3+1d4`; applying Shaken changed it to `2d20kl1+3+1d4`.
  - Player-owned roll for `skill-investigation` returned `200` with formula `2d20kl1+3+1d4`.
  - Case Notebook action roll returned `200` with formula `1d4+3`.
  - Encounter planning returned `200` with summary `standard encounter: 1x Masked Agent (60/80 budget)` and persisted encounter `Manual Mystic Case`.
  - Importing `Manual Imported Investigator` returned `200`, normalized conditions `focused,marked`, clues `Case Notebook`, and rituals `Warding Rite`.
  - The smoke left `2` chat roll messages for `Manual Investigator`.

### AI Tool Depth And Observability Slice

- Implementation:
  - Added typed AI tool schemas so hosted providers receive structured parameters instead of permissive untyped function definitions.
  - Expanded permission-filtered AI context with visible actors, scenes, and encounters in addition to journals, memory, and GM-only secrets.
  - Added AI thread tools for `draft_encounter`, `create_memory`, `roll_dice`, and `read_compendium`, keeping the existing `create_proposal` tool.
  - Added per-tool permission enforcement and tool execution error capture so failed or forbidden provider tool requests return structured outputs instead of aborting the thread.
  - Added `GET /api/v1/campaigns/{campaignId}/ai/tool-calls` for GM-facing tool-call observability.
  - Updated the Codex loopback provider to exercise the expanded tool surface for manual and local smoke tests.
- Automated validation:
  - `pnpm --filter @open-tabletop/ai-core typecheck` passed.
  - `pnpm --filter @open-tabletop/ai-core build` passed.
  - `pnpm --filter @open-tabletop/ai-core test` passed with `3 passed`.
  - `pnpm --filter @open-tabletop/codex-app-server-provider typecheck` passed.
  - `pnpm --filter @open-tabletop/codex-app-server-provider build` passed.
  - `pnpm --filter @open-tabletop/codex-app-server-provider test` passed with no test files.
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `32 passed`.
  - `pnpm check` passed across lint, typecheck, tests, and build.
  - OpenAI provider tests verify typed tool schemas are sent to the Responses API.
  - API tests verify GM tool execution for compendium read, memory creation, encounter drafting, dice rolling, unknown-tool handling, persisted tool-call observability, player denial for GM observability, and player denial for `ai.proposeChanges` tools while allowing permission-safe compendium and dice tools.
- Manual API evidence:
  - API: `http://127.0.0.1:4446`
  - SQLite file: `storage/manual-ai-depth-20260501.sqlite`
  - Environment: `OTTE_AI_PROVIDER=codex-loopback`
  - GM AI thread returned provider `codex-app-server`.
  - GM event sequence included `tool.started`, `tool.completed`, `proposal.created`, and `message.completed`.
  - GM completed tool names were `draft_encounter,create_memory,roll_dice,read_compendium`.
  - Tool-call observability returned unique names `draft_encounter,create_memory,roll_dice,read_compendium`.
  - Created memory text was `Loopback memory: the obsidian key hums near the vault door.`
  - Draft encounter tool created proposal `prop_mon3ux6mnhjfapsj`.
  - Dice tool posted chat `Loopback Perception: 1d20+4 = 6`.
  - Player AI thread returned missing-permission outputs `draft_encounter:ai.proposeChanges,create_memory:ai.proposeChanges`.
  - Player `GET /api/v1/campaigns/camp_demo/ai/tool-calls` returned `403`.

### AI Integration Reliability Slice

- Implementation:
  - Added persisted AI thread operational status fields: `running`, `completed`, `failed`, start/completion/failure timestamps, `durationMs`, retry attempts, event count, tool-call count, and provider error text.
  - Added `GET /api/v1/campaigns/{campaignId}/ai/threads` so GMs can inspect campaign AI thread status history.
  - Added a configurable pre-event provider retry budget through `OTTE_AI_PROVIDER_RETRY_ATTEMPTS`, defaulting to `1` and clamped from `0` to `3`.
  - Failed provider calls now persist the failed thread and return `502 ai_provider_failed` with the thread and any already-emitted events.
  - Completed tool-call records now include `durationMs` for integration observability.
- Automated validation:
  - `pnpm --filter @open-tabletop/core build` passed.
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/api-contracts typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `39 passed`.
  - `pnpm check` passed across lint, typecheck, tests, and build.
  - `git diff --check` passed.
  - API tests verify pre-event provider retry, failed-thread persistence after retry exhaustion, `502 ai_provider_failed`, GM thread-status listing, player denial for the thread-status endpoint, and per-tool completion duration recording.
- Manual API evidence:
  - API: `http://127.0.0.1:4456`
  - SQLite file: `apps/api/storage/manual-ai-reliability-20260501.sqlite`
  - Runtime env included `NODE_ENV=production`, `OTTE_AI_PROVIDER=codex-loopback`, `OTTE_AI_PROVIDER_RETRY_ATTEMPTS=1`, and `OTTE_SQLITE_PATH=storage/manual-ai-reliability-20260501.sqlite`.
  - GM login returned an `ots_` token length `47`.
  - GM AI thread returned provider `codex-app-server`, status `completed`, retry attempts `0`, event count `1`, tool-call count `0`, and numeric `durationMs`.
  - GM `GET /api/v1/campaigns/camp_demo/ai/threads` returned the same thread with status `completed`.
  - Player `GET /api/v1/campaigns/camp_demo/ai/threads` returned `403`.

### AI Usage Metrics Slice

- Implementation:
  - Added provider usage events to the AI provider interface.
  - Mapped OpenAI Responses `usage` payloads into provider usage events.
  - Persisted per-thread prompt, context, and response character counts.
  - Persisted provider-reported input, output, and total token counts on AI threads.
  - Added optional estimated cost calculation from `OTTE_AI_INPUT_TOKEN_COST_USD_PER_1K` and `OTTE_AI_OUTPUT_TOKEN_COST_USD_PER_1K`.
  - Added `GET /api/v1/campaigns/{campaignId}/ai/usage` for GM-facing campaign and provider aggregate usage.
- Automated validation:
  - `pnpm --filter @open-tabletop/core build` passed.
  - `pnpm --filter @open-tabletop/ai-core typecheck` passed.
  - `pnpm --filter @open-tabletop/ai-core build` passed.
  - `pnpm --filter @open-tabletop/ai-core test` passed with `3 passed`.
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/api-contracts typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `40 passed`.
  - `pnpm check` passed across lint, typecheck, tests, and build.
  - `git diff --check` passed.
  - AI core tests verify OpenAI Responses usage mapping.
  - API tests verify thread usage persistence, estimated cost calculation, aggregate usage by provider, and player denial for the usage endpoint.
- Manual API evidence:
  - API: `http://127.0.0.1:4457`
  - Fake OpenAI-compatible endpoint: `http://127.0.0.1:4714/v1/responses`
  - SQLite file: `apps/api/storage/manual-ai-usage-20260501.sqlite`
  - Runtime env included `NODE_ENV=production`, `OTTE_AI_PROVIDER=openai-responses`, `OPENAI_API_KEY=sk-local-smoke`, `OPENAI_BASE_URL=http://127.0.0.1:4714/v1`, `OPENAI_MODEL=gpt-local-usage-smoke`, `OTTE_AI_INPUT_TOKEN_COST_USD_PER_1K=0.01`, and `OTTE_AI_OUTPUT_TOKEN_COST_USD_PER_1K=0.02`.
  - GM login returned an `ots_` token length `47`.
  - GM AI thread returned provider `openai-responses`, status `completed`, assistant message `Usage smoke completed.`, input tokens `1234`, output tokens `321`, total tokens `1555`, and estimated cost `0.01876`.
  - GM `GET /api/v1/campaigns/camp_demo/ai/usage` returned thread count `1`, input tokens `1234`, output tokens `321`, estimated cost `0.01876`, and provider summary `openai-responses`.
  - GM `GET /api/v1/campaigns/camp_demo/ai/threads` listed the same thread.
  - Player `GET /api/v1/campaigns/camp_demo/ai/usage` returned `403`.

### AI Operator Dashboard Slice

- Implementation:
  - Added AI thread, usage, and tool-call telemetry to the web snapshot contract.
  - Gated web telemetry fetches behind the current campaign member's `ai.proposeChanges` permission.
  - Added GM-only AI panel operator signals for thread counts, failures, retries, tokens, estimated cost, tool calls, provider usage, recent thread status, and recent tool-call status.
  - Player sessions keep the existing AI action controls disabled and do not load the GM-only telemetry endpoints.
- Automated validation:
  - `pnpm --filter @open-tabletop/web typecheck` passed.
  - `pnpm --filter @open-tabletop/web build` passed.
  - `pnpm check` passed across lint, typecheck, tests, and build.
  - `git diff --check` passed.
- Manual browser/API evidence:
  - API: `http://127.0.0.1:4458`
  - Web: `http://127.0.0.1:5175`
  - Fake OpenAI-compatible endpoint: `http://127.0.0.1:4715/v1/responses`
  - SQLite file: `apps/api/storage/manual-ai-operator-dashboard-20260501.sqlite`
  - Runtime env included `NODE_ENV=production`, `OTTE_AI_PROVIDER=openai-responses`, `OPENAI_API_KEY=sk-local-smoke`, `OPENAI_BASE_URL=http://127.0.0.1:4715/v1`, `OPENAI_MODEL=gpt-local-operator-smoke`, `OTTE_AI_INPUT_TOKEN_COST_USD_PER_1K=0.01`, and `OTTE_AI_OUTPUT_TOKEN_COST_USD_PER_1K=0.02`.
  - Seeded GM AI thread returned provider `openai-responses`, status `completed`, input tokens `888`, output tokens `222`, total tokens `1110`, and estimated cost `0.01332`.
  - GM browser AI tab showed `Operator Signals`, thread count `1`, failures `0`, retries `0`, tokens `1,110`, cost `$0.013320`, provider `openai-responses`, and recent completed thread `Create operator dashboard smoke telemetry.`
  - Player browser session kept AI action buttons disabled, hid `Operator Signals`, and the post-switch network request list did not include `/ai/threads`, `/ai/usage`, or `/ai/tool-calls`.
  - Screenshots saved at `output/playwright/ai-operator-dashboard-gm.png` and `output/playwright/ai-operator-dashboard-player.png`.

### AI Campaign Edit Tools Slice

- Implementation:
  - Added typed AI proposal tools for `draft_journal_entry`, `draft_scene`, `draft_token_update`, and `draft_actor_update`.
  - Tightened `draft_encounter` to require `campaign.update` in addition to `ai.proposeChanges`.
  - Tightened the generic `create_proposal` tool so each requested proposal change also requires the underlying campaign edit permission.
  - Extended the Codex loopback provider so local Codex smoke tests can request journal, scene, token, and actor edit tools.
- Automated validation:
  - `pnpm --filter @open-tabletop/codex-app-server-provider typecheck` passed.
  - `pnpm --filter @open-tabletop/codex-app-server-provider build` passed.
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `41 passed`.
  - `pnpm check` passed across lint, typecheck, tests, and build.
  - `git diff --check` passed.
  - API tests verify GM execution for the expanded edit tools, persisted tool-call observability, player denial for missing `ai.proposeChanges`, and denial for a user granted `ai.proposeChanges` but missing the underlying `journal.create`, `campaign.update`, `scene.create`, `token.update`, or `actor.update` permission.
- Manual API evidence:
  - API: `http://127.0.0.1:4459`
  - SQLite file: `apps/api/storage/manual-ai-edit-tools-20260501.sqlite`
  - Runtime env included `NODE_ENV=production`, `OTTE_AI_PROVIDER=codex-loopback`, and `OTTE_SQLITE_PATH=apps/api/storage/manual-ai-edit-tools-20260501.sqlite`.
  - GM login returned an `ots_` token prefix.
  - A Codex loopback AI thread with a prompt requesting encounter, journal, scene, token, actor, memory, dice, and compendium work completed with `toolCallCount: 8` and `eventCount: 22`.
  - Tool-call observability included `draft_encounter`, `draft_journal_entry`, `draft_scene`, `draft_token_update`, `draft_actor_update`, `create_memory`, `roll_dice`, and `read_compendium`.
  - The thread created pending AI proposals titled `Encounter: Loopback Vault Sentinel`, `Journal: Loopback Journal Lead`, `Scene: Loopback Test Chamber`, `Token: Valen Ash`, and `Actor: Valen Ash`.

### AI Tool Failure Hardening Slice

- Implementation:
  - Added schema validation before AI tool execution so required tool fields and basic field types are checked before any proposal, memory, or dice side effect runs.
  - Changed AI tool-call observability so unknown tools, missing permissions, invalid inputs, and tool-thrown errors persist as `failed` tool calls instead of successful completions with error payloads.
  - Added a deterministic Codex loopback malformed-tool path for production-mode integration smoke testing.
- Automated validation:
  - `pnpm --filter @open-tabletop/codex-app-server-provider typecheck` passed.
  - `pnpm --filter @open-tabletop/codex-app-server-provider build` passed.
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `42 passed`.
  - API tests verify invalid provider inputs for `create_proposal`, `draft_scene`, `draft_token_update`, and `create_memory` return `invalid_tool_input`, unknown tools return `unknown_tool`, all are persisted as failed tool calls, and no proposals, memory facts, or rolls are created from those invalid inputs.
- Manual API evidence:
  - API: `http://127.0.0.1:4460`
  - SQLite file: `apps/api/storage/manual-ai-tool-hardening-20260501.sqlite`
  - Runtime env included `NODE_ENV=production`, `OTTE_AI_PROVIDER=codex-loopback`, and `OTTE_SQLITE_PATH=apps/api/storage/manual-ai-tool-hardening-20260501.sqlite`.
  - GM login returned an `ots_` token prefix.
  - A Codex loopback prompt for a malformed invalid tool edge case completed with `eventCount: 11` and `toolCallCount: 5`.
  - Completed tool outputs were `create_proposal: invalid_tool_input / Missing required field: title`, `draft_scene: invalid_tool_input / Missing required field: name`, `draft_token_update: invalid_tool_input / Invalid field: x`, `create_memory: invalid_tool_input / Tool input must be an object.`, and `unknown_tool: unknown_tool`.
  - `GET /api/v1/campaigns/camp_demo/ai/tool-calls` showed failed tool calls for `create_proposal`, `draft_scene`, `draft_token_update`, `create_memory`, and `unknown_tool`.
  - Proposal count delta was `0` and memory count delta was `0`, confirming invalid provider inputs did not mutate campaign proposal or memory state.

### AI Tool Advertisement Filtering Slice

- Implementation:
  - Filtered provider-visible AI tool definitions to only tools whose declared `requiredPermissions` are available to the human caller.
  - Kept execution-time permission checks as the final guard when a provider emits a stale, unavailable, or malicious tool call anyway.
- Automated validation:
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `42 passed`.
  - API tests verify a player-visible provider request only receives `roll_dice` and `read_compendium`, a GM provider request receives the full tool catalog, and malicious provider-emitted mutation tools are still denied by execution-time permission checks.
- Manual API evidence:
  - API: `http://127.0.0.1:4461`
  - SQLite file: `apps/api/storage/manual-ai-tool-filtering-20260501.sqlite`
  - Runtime env included `NODE_ENV=production`, `OTTE_AI_PROVIDER=codex-loopback`, and `OTTE_SQLITE_PATH=apps/api/storage/manual-ai-tool-filtering-20260501.sqlite`.
  - Player login returned an `ots_` token prefix.
  - A player Codex loopback prompt requesting proposal, encounter, journal, scene, token, actor, memory, dice, and compendium work completed with `eventCount: 5` and `toolCallCount: 2`.
  - The only completed tool events were `roll_dice: ok` and `read_compendium: ok`, confirming mutation tools were not advertised to the player provider request.
  - Proposal count delta was `0` and memory count delta was `0`.
  - Player access to `GET /api/v1/campaigns/camp_demo/ai/tool-calls` returned `403`.

### SCIM Organization Sync Slice

- Implementation:
  - Added bearer-token-protected SCIM v2 routes under `/api/v1/scim/v2`.
  - Added ServiceProviderConfig, Users list/create/get/replace/patch/deactivate, and Groups list/create/get/replace/patch/delete.
  - Added persistent `scimGroups` state for SQLite and file-backed stores.
  - Added SCIM profile metadata on users while redacting that metadata from public/admin user responses and campaign archives.
  - SCIM-created users are marked `passwordResetRequired` by default so provisioning does not create passwordless local accounts.
  - SCIM active=false and delete revoke that user's active sessions and mark the account disabled.
  - Added system audit logs for SCIM user and group mutations.
- Automated validation:
  - `pnpm --filter @open-tabletop/core build` passed.
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/api-contracts typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `36 passed`.
  - API tests verify SCIM bearer enforcement, ServiceProviderConfig, user creation, password-reset-required login blocking, filtered user lookup, active=false deprovisioning, group creation, duplicate group rejection, group membership patching, SQLite SCIM group persistence, and system audit entries.
- Manual API evidence:
  - API: `http://127.0.0.1:4452`
  - SQLite file: `storage/manual-scim-20260501.sqlite`
  - Runtime env included `NODE_ENV=production`, `OTTE_SQLITE_PATH=storage/manual-scim-20260501.sqlite`, `OTTE_ADMIN_USER_IDS=usr_demo_gm`, and `OTTE_SCIM_BEARER_TOKEN=manual-scim-secret`.
  - Unauthenticated `GET /api/v1/scim/v2/Users` returned `401`.
  - Authorized `GET /api/v1/scim/v2/ServiceProviderConfig` returned `200` with `patch.supported: true`.
  - `POST /api/v1/scim/v2/Users` created `usr_mon5mco646brezqi` with `userName: manual.scim@example.test`, normalized email `manual.scim@example.test`, and `active: true`.
  - Passwordless login for `manual.scim@example.test` returned `403 forbidden`, confirming the provisioned user requires a password reset before local password auth.
  - Filtered user lookup with `userName eq "manual.scim@example.test"` returned `totalResults: 1`.
  - `PATCH /api/v1/scim/v2/Users/usr_mon5mco646brezqi` with `active=false` returned `active: false`.
  - `POST /api/v1/scim/v2/Groups` created `scimg_mon5mcotk08gz5ef` with one member, and `PATCH /api/v1/scim/v2/Groups/scimg_mon5mcotk08gz5ef` replaced members with an empty list.
  - Admin audit export for `action=scim.user.create` returned `count: 1`, `firstAction: scim.user.create`, and `firstActorType: system`.

### SCIM Group Role Mapping Slice

- Implementation:
  - Added server-admin endpoints under `/api/v1/admin/scim/group-role-mappings` to list, create, and delete SCIM group-to-campaign role mappings.
  - Mappings can target a provisioned group by `groupId`, `groupExternalId`, or `groupDisplayName` and assign `gm`, `assistant_gm`, `player`, or `observer`.
  - SCIM group create/replace/patch operations now sync matching mappings into `CampaignMember` rows with `source: { type: "scim_group", groupId, mappingId }`.
  - Removing a user from a mapped SCIM group removes only memberships created by that mapping; manually managed campaign members are preserved.
  - Deleting a mapping removes the campaign memberships sourced from that mapping.
  - Campaign archives omit SCIM group role mappings and SCIM membership source metadata with the rest of operational identity state.
- Automated validation:
  - `pnpm --filter @open-tabletop/core build` passed.
  - `pnpm --filter @open-tabletop/core typecheck` passed.
  - `pnpm --filter @open-tabletop/api-contracts typecheck` passed.
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `37 passed`.
  - `pnpm check` passed.
  - API tests verify server-admin mapping creation, initial membership sync, SCIM group member removal/restoration, external-id change cleanup/restoration, mapping list group snapshots, mapping deletion cleanup, and audit log actions.
- Manual API evidence:
  - API: `http://127.0.0.1:4455`
  - SQLite file: `storage/manual-scim-role-map-20260501-1218.sqlite`
  - Runtime env included `NODE_ENV=production`, `OTTE_SQLITE_PATH=storage/manual-scim-role-map-20260501-1218.sqlite`, `OTTE_ADMIN_USER_IDS=usr_demo_gm`, and `OTTE_SCIM_BEARER_TOKEN=manual-role-map-secret`.
  - Admin login returned `200`.
  - `POST /api/v1/scim/v2/Users` created `usr_mon6c5cfagkadgnh` for `manual.role.member.accept@example.test`.
  - `POST /api/v1/scim/v2/Groups` created `scimg_mon6c5cmbcyrlynj` with display name `Manual Accepted Observers`, external id `manual-role-group-accept-1`, and the provisioned user as a member.
  - A mapping create request with both `groupId` and `groupExternalId` returned `400` with message `SCIM group role mapping requires exactly one of groupId, groupExternalId, or groupDisplayName`.
  - `POST /api/v1/admin/scim/group-role-mappings` created `scimmap_mon6c5cvfu234ver` for `campaignId: camp_demo`, `role: observer`, and returned sync `{ matchedGroups: 1, createdMemberships: 1, updatedMemberships: 0, removedMemberships: 0, preservedManualMemberships: 0 }`.
  - `GET /api/v1/campaigns/camp_demo/members` showed the provisioned user as an `observer` with SCIM source `{ groupId: scimg_mon6c5cmbcyrlynj, mappingId: scimmap_mon6c5cvfu234ver }`.
  - `GET /api/v1/campaigns/camp_demo/export` returned an archive where the mapped member had no `source` metadata and the archive JSON did not contain `scimmap_mon6c5cvfu234ver`.
  - `PATCH /api/v1/scim/v2/Groups/scimg_mon6c5cmbcyrlynj` with an empty `members` list removed that sourced campaign membership.
  - Restoring the group member through SCIM recreated the `observer` campaign membership with the same SCIM source.
  - Changing the SCIM group `externalId` to `manual-role-group-accept-renamed` removed the sourced campaign membership; restoring `externalId: manual-role-group-accept-1` recreated it.
  - `GET /api/v1/admin/scim/group-role-mappings` returned the mapping with a group snapshot for `Manual Accepted Observers`, external id `manual-role-group-accept-1`, and one member user id.
  - `DELETE /api/v1/admin/scim/group-role-mappings/scimmap_mon6c5cvfu234ver` returned `{ removedMemberships: 1 }`, and a final member list check confirmed the provisioned user was no longer a `camp_demo` member.
  - Admin audit exports for `admin.scim.groupRoleMapping.create` and `admin.scim.groupRoleMapping.delete` each returned `count: 1`.

### Organization Admin Access UI Slice

- Implementation:
  - Added SCIM group role mappings to the browser admin snapshot so server admins can inspect organization access state from the Admin tab.
  - Added an `Organization Access` Admin tab section for creating SCIM group-to-campaign role mappings by group display name, external id, or group id.
  - Added matched mapping cards showing campaign, role, SCIM member count, group identity, and delete controls.
  - Wired create/delete UI actions to the existing audit-backed `/api/v1/admin/scim/group-role-mappings` routes and refreshed campaign/admin state after each mutation.
- Automated validation:
  - `pnpm --filter @open-tabletop/web typecheck` passed.
  - `pnpm --filter @open-tabletop/web build` passed.
- Manual browser/API evidence:
  - API: `http://127.0.0.1:55164`
  - Web: `http://127.0.0.1:5193/`
  - SQLite file: `apps/api/storage/manual-org-admin-ui-20260501.sqlite`
  - Runtime env included `NODE_ENV=production`, `PORT=55164`, `HOST=127.0.0.1`, `OTTE_SQLITE_PATH=apps/api/storage/manual-org-admin-ui-20260501.sqlite`, `OTTE_ADMIN_USER_IDS=usr_demo_gm`, and `OTTE_SCIM_BEARER_TOKEN=manual-org-admin-secret`.
  - The server was the built API entrypoint `node apps/api/dist/server.js`; health returned `true` and GM login returned `serverAdmin: true`.
  - SCIM API setup created user `usr_monh0e2ibbhdd605` for `manual.org.admin@example.test` and group `scimg_monh0e2pcol7xxxo` named `Manual Org Observers` with external id `manual-org-observers-20260501`.
  - Browser Admin tab displayed the `Organization Access` section with mapping campaign, role, match, group identifier, and `Add mapping` controls.
  - Creating a display-name mapping from the browser produced `scimmap_monh1i3zyjqjdvvy`, matched `Manual Org Observers`, assigned role `observer`, showed `1 SCIM members`, and added the provisioned user to the session switcher as `Manual Org Admin Member - observer`.
  - API verification after browser create returned member role `observer` with source `{ type: "scim_group", groupId: "scimg_monh0e2pcol7xxxo", mappingId: "scimmap_monh1i3zyjqjdvvy" }` and `admin.scim.groupRoleMapping.create` audit count `1`.
  - Screenshot saved at `output/playwright/org-admin-scim-mapping.png`.
  - Clicking browser `Delete mapping` removed the mapping; API verification returned `remainingMappings: 0`, `provisionedMemberStillInCampaign: false`, `admin.scim.groupRoleMapping.create` count `1`, and `admin.scim.groupRoleMapping.delete` count `1`.
  - Browser console had no application runtime errors; the only error was the existing missing `favicon.ico` 404.
  - After shutdown, no listener remained on ports `55164` or `5193`.

### Server Admin AI Operations Slice

- Implementation:
  - Added `GET /api/v1/admin/ai/operations` for server admins to inspect redacted AI/Codex provider runtime settings, retry budget, configured cost-rate flags, aggregate usage, campaign rollups, recent threads, and recent tool calls across campaigns.
  - Added an AI Operations section to the browser Admin tab so server admins can verify the active provider, Codex/OpenAI configuration state, failures, tokens, estimated cost, and recent tool activity without using a campaign GM panel.
  - Added `.env.example` entries for AI retry and cost-rate settings.
- Automated validation:
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/api test` passed with `48 passed`.
  - `pnpm --filter @open-tabletop/web typecheck` passed.
  - `pnpm --filter @open-tabletop/web build` passed.
  - API tests verify server-admin-only access, redacted runtime metadata, aggregate usage totals, campaign rollups, recent tool-call enrichment, audit logging for `admin.aiOperations.inspect`, and non-admin denial.
- Manual browser evidence:
  - API: `http://127.0.0.1:4465`
  - Web: `http://localhost:5175`
  - SQLite file: `apps/api/storage/manual-ai-admin-ops-20260501.sqlite`
  - Runtime env included `NODE_ENV=production`, `OTTE_AI_PROVIDER=codex-loopback`, `OTTE_ADMIN_USER_IDS=usr_demo_gm`, `OTTE_AI_INPUT_TOKEN_COST_USD_PER_1K=0.01`, and `OTTE_AI_OUTPUT_TOKEN_COST_USD_PER_1K=0.02`.
  - A GM bearer login returned an `ots_` token prefix.
  - A Codex loopback thread created through `POST /api/v1/campaigns/camp_demo/ai/threads` completed with provider `codex-app-server`, `toolCallCount: 8`, and `eventCount: 22`.
  - `GET /api/v1/admin/ai/operations` returned provider `codex-app-server`, Codex transport `loopback`, `adminThreads: 1`, `adminTools: 8`, campaign `The Ember Vault`, and recent tool names including `roll_dice`, `read_compendium`, `draft_actor_update`, `create_memory`, and `draft_encounter`.
  - Browser Admin tab showed the AI Operations section with `codex-app-server`, `codex-loopback`, `loopback Codex transport`, cost rates configured, `Threads: 1`, `Failures: 0`, `Tools: 8`, campaign rollup for `The Ember Vault`, recent tool-call rows, and an `admin.aiOperations.inspect` audit row.
  - Switching the browser session to Demo Player removed the Admin tab and kept AI mutation/approval controls disabled.
  - Screenshot saved at `output/playwright/admin-ai-operations.png`.
  - Browser console showed no application runtime errors; the only console error was the missing `favicon.ico` 404.

### AI Provider Timeout Hardening Slice

- Implementation:
  - Added a default 30 second timeout around OpenAI Responses provider HTTP requests so a hung upstream cannot leave an AI thread running indefinitely.
  - Added `OTTE_AI_PROVIDER_TIMEOUT_MS` to configure the timeout, clamped from `0` to `300000` milliseconds; `0` disables it for local debugging.
  - Wired the timeout through the API and AI gateway provider configuration.
  - Added the timeout to server-admin AI Operations runtime data and the browser Admin AI Operations summary.
- Automated validation:
  - `pnpm --filter @open-tabletop/ai-core test -- --run` passed with `4 passed`, including a hung-upstream abort test.
  - `pnpm --filter @open-tabletop/ai-core typecheck` passed.
  - `pnpm --filter @open-tabletop/ai-core build` passed.
  - `pnpm --filter @open-tabletop/api test -- src/app.test.ts` passed with `55 passed`, including OpenAI provider configuration/admin-runtime coverage.
  - `pnpm --filter @open-tabletop/api typecheck` passed.
  - `pnpm --filter @open-tabletop/api build` passed.
  - `pnpm --filter @open-tabletop/ai-gateway typecheck` passed.
  - `pnpm --filter @open-tabletop/web typecheck` passed.
  - `pnpm check` passed across lint, typecheck, tests, and build.
  - `git diff --check` passed.
- Manual API evidence:
  - Fake OpenAI-compatible endpoint: `http://127.0.0.1:4722/v1/responses`.
  - The fake endpoint accepted the `/v1/responses` request and intentionally never responded.
  - API smoke used the built API modules from `apps/api/dist` with `MemoryStateStore`.
  - Runtime env included `OTTE_AI_PROVIDER=openai-responses`, `OPENAI_API_KEY=sk-timeout-smoke`, `OPENAI_BASE_URL=http://127.0.0.1:4722/v1`, `OPENAI_MODEL=gpt-timeout-smoke`, `OTTE_AI_PROVIDER_TIMEOUT_MS=50`, `OTTE_AI_PROVIDER_RETRY_ATTEMPTS=0`, and `OTTE_ADMIN_USER_IDS=usr_demo_gm`.
  - Bearer login returned `200`.
  - `POST /api/v1/campaigns/camp_demo/ai/threads` returned `502` in `61ms` with `error: "ai_provider_failed"` and message `OpenAI Responses API request timed out after 50ms`.
  - The failed thread persisted with provider `openai-responses`, status `failed`, provider error `OpenAI Responses API request timed out after 50ms`, retry attempts `0`, and event count `0`.
  - `GET /api/v1/admin/ai/operations` returned `200` and reported OpenAI runtime `timeoutMs: 50`.
  - After shutdown, no listener remained on port `4722`.

### AI Tool Permission Regression Slice

- Implementation:
  - Added an API regression test that captures the AI provider tool schemas actually advertised to GM, assistant GM, player, and observer roles.
  - The regression enforces that every advertised GM tool declares required permissions, exposes an object parameter schema, and rejects stray provider arguments with `additionalProperties: false`.
  - The regression enforces that every mutating provider tool requires `ai.proposeChanges`, assistant GM advertisement excludes the `campaign.update`-gated encounter draft tool, players only receive permission-safe `roll_dice` and `read_compendium`, and observers cannot start AI threads.
- Automated validation:
  - `pnpm --filter @open-tabletop/api test -- src/app.test.ts` passed with `56 passed`.
  - `pnpm --filter @open-tabletop/api build` passed.
- Manual API evidence:
  - API smoke used the built API modules from `apps/api/dist` with `MemoryStateStore` and a custom provider that records the advertised tool schemas.
  - Bearer logins returned `200` for GM, assistant GM, player, and observer.
  - GM AI thread returned `200` and advertised `create_proposal`, `draft_encounter`, `draft_journal_entry`, `draft_scene`, `draft_token_update`, `draft_actor_update`, `create_memory`, `roll_dice`, and `read_compendium`.
  - Assistant GM AI thread returned `200` and advertised `create_proposal`, `draft_journal_entry`, `draft_scene`, `draft_token_update`, `draft_actor_update`, `create_memory`, `roll_dice`, and `read_compendium`; `draft_encounter` was absent because it requires `campaign.update`.
  - Player AI thread returned `200` and advertised only `roll_dice` and `read_compendium`; `mutatingPlayerTools` was empty.
  - Observer AI thread returned `403` and did not reach the provider; total provider request count was `3`.
  - Captured GM policy showed every tool with required permissions and `additionalProperties: false`.

### Rules Rest And Resource Automation Slice

- Implementation:
  - Added built-in rest/recovery automation for `generic-fantasy`, `stellar-frontiers`, and `mystic-noir`.
  - Generic Fantasy now tracks template/imported hit dice, resource pools, Mender spell slots, additional spell compendium actions, short-rest hit-die healing, long-rest HP/spell/resource recovery, and rest-clearing conditions.
  - Stellar Frontiers and Mystic Noir now track system resource pools and recover strain/composure, short/long-rest resources, and rest-clearing conditions.
  - Added `POST /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/rest`, with the same owned-actor/GM update permission boundary as advancement.
  - Added browser SDK-panel rest controls and actor-panel resource display so resource recovery is visible in the tabletop UI.
  - Updated API contracts, REST docs, and System SDK docs for the rest endpoint and resource automation.
- Automated validation:
  - `pnpm --filter @open-tabletop/system-sdk test -- --run` passed with `18 passed`.
  - `pnpm --filter @open-tabletop/system-sdk build` passed.
  - `pnpm --filter @open-tabletop/api test -- src/app.test.ts -t "applies system rest recovery"` passed.
  - `pnpm --filter @open-tabletop/api-contracts build` passed.
  - `pnpm --filter @open-tabletop/api build` passed.
  - `pnpm --filter @open-tabletop/web build` passed.
  - `pnpm check` passed across lint, typecheck, tests, and build; the full API suite reported `65 passed`.
  - `git diff --check` passed with only the repo's CRLF conversion warnings.
  - System SDK tests verify fantasy short/long rest recovery, hit-die spending/recovery, resource and spell-slot restoration, rest-clearing condition removal, sci-fi strain/resource recovery, and investigation composure/resource recovery.
  - API tests verify observer denial, player-owned fantasy long rest persistence, sheet condition cleanup, and Mystic Noir short-rest recovery.
- Manual API evidence:
  - API smoke used the built API modules from `apps/api/dist` with `MemoryStateStore` and no dev server.
  - Observer `POST /systems/generic-fantasy/actors/{actorId}/rest` returned `403`.
  - Player-owned Generic Fantasy long rest returned `200`, restored HP to `{ current: 12, max: 12 }`, hit dice to `{ current: 2, max: 2, size: "d8" }`, `fieldPrayer` and `secondWind` to full, `level1` spell slots to `{ current: 3, max: 3, recovery: "long" }`, kept `blessed`, and removed `poisoned` and `restrained`.
  - Player-owned Mystic Noir short rest returned `200`, restored composure to `{ current: 3, max: 6 }`, restored `ward` to full, left long-rest `lead` spent, kept `marked`, and removed `focused` and `shaken`.

### Rules Action Resource Consumption Slice

- Implementation:
  - Added system SDK action-use helpers for stateful resource spending when compendium-backed actions are used.
  - Generic Fantasy leveled spell actions now spend matching spell slots, while cantrips and no-cost item actions remain read-only.
  - Stellar Frontiers actions now spend strain for strain-cost talents and decrement consumable gear quantities such as Med Patch.
  - Mystic Noir clue and ritual actions now spend configured actor resource pools such as `lead` and `ward`.
  - The system roll endpoint accepts `consumeResources: true`, requires owned-actor or GM edit permission before mutating state, returns `409` when a paid action is depleted, and includes usage, actor, and sheet data in the response.
  - The browser actor panel now exposes a `Use` action button, posts consuming rolls, and shows item quantities in inventory/spell/talent/clue/ritual lists.
  - Updated REST and System SDK docs for stateful action use.
- Automated validation:
  - `pnpm --filter @open-tabletop/system-sdk test -- --run` passed with `21 passed`.
  - `pnpm --filter @open-tabletop/system-sdk build` passed.
  - `pnpm --filter @open-tabletop/api test -- src/app.test.ts -t "spends system action resources"` passed.
  - `pnpm --filter @open-tabletop/api build` passed.
  - `pnpm --filter @open-tabletop/web build` passed.
  - System SDK tests verify fantasy spell-slot spending and depletion errors, sci-fi strain and consumable spending, and investigation resource spending.
  - API tests verify observer denial, player-owned spell-slot spending and persistence, depletion conflict responses, consumable quantity persistence, and consumable depletion conflicts.
- Manual API evidence:
  - API smoke used the built API modules from `apps/api/dist` with `MemoryStateStore` and no dev server.
  - Observer `POST /systems/generic-fantasy/actors/{actorId}/roll` with `consumeResources: true` returned `403`.
  - Player-owned `Cure Wounds` action returned `200`, consumed `{ type: "spellSlot", key: "level1", amount: 1, remaining: 0 }`, persisted `level1` spell slots at `{ current: 0, max: 2, recovery: "long" }`, and posted the chat roll.
  - Reusing the depleted `Cure Wounds` action returned `409` with message `Insufficient level 1 spell slot`.
  - Player-owned `Med Patch` action returned `200`, consumed `{ type: "itemQuantity", label: "Med Patch", amount: 1, remaining: 0 }`, persisted item quantity `0`, and posted the chat roll.
  - Reusing the depleted `Med Patch` action returned `409` with message `Med Patch has no remaining uses`.

### AI Actor Action Tool Slice

- Implementation:
  - Added visible actor quick-action ids, labels, and formulas to permission-filtered AI provider context.
  - Added the typed `use_actor_action` AI/Codex tool for GM/assistant operator sessions with `ai.proposeChanges`, `actor.read`, `actor.update`, and `dice.roll`.
  - The tool resolves actions by exact roll id or action label, runs the same stateful system action consumption path as the REST roll endpoint, posts the action roll to chat, and returns consumed resources plus updated item summaries.
  - Player AI sessions continue to receive only `roll_dice` and `read_compendium`; provider-requested `use_actor_action` calls from a player context are denied before actor state changes.
  - Codex loopback can now request `use_actor_action` when the prompt asks to use/cast an action or spell.
- Automated validation:
  - `pnpm --filter @open-tabletop/api test -- src/app.test.ts -t "expanded ai tools"` passed.
  - `pnpm --filter @open-tabletop/api test -- src/app.test.ts -t "caller-visible campaign context"` passed.
  - `pnpm --filter @open-tabletop/api test -- src/app.test.ts -t "tool advertisement covered"` passed.
  - `pnpm --filter @open-tabletop/ai-core test -- --run` passed with `4 passed`.
  - `pnpm --filter @open-tabletop/ai-core build` passed.
  - `pnpm --filter @open-tabletop/codex-app-server-provider build` passed.
  - `pnpm --filter @open-tabletop/api build` passed.
- Manual API evidence:
  - Built-API smoke used `apps/api/dist` with `MemoryStateStore`, a custom provider emitting `use_actor_action`, and real bearer tokens from `POST /api/v1/auth/login`.
  - Player AI thread returned `200`, advertised only `roll_dice` and `read_compendium`, produced `{ error: "missing_permission", permission: "ai.proposeChanges" }` for the unadvertised `use_actor_action` request, and left `level1` spell slots at `{ current: 1, max: 1, recovery: "long" }`.
  - GM AI thread returned `200`, advertised `use_actor_action`, resolved `Healing Word Healing` to `spell-item_manual_healing_word-healing`, posted the action roll, consumed `{ type: "spellSlot", key: "level1", amount: 1, remaining: 0 }`, and persisted `level1` spell slots at `{ current: 0, max: 1, recovery: "long" }`.

### Rules Target Effect Application Slice

- Implementation:
  - Added `applyEffect` and `targetActorId` support to the system roll endpoint for supported damage and healing actions.
  - Damage/healing totals now apply to target actor HP, strain, or composure pools and return an `effect` summary with target, pool, amount, before, after, and max.
  - Resource consumption and target effect application are staged and committed together, so failed target permission or unsupported-effect checks do not spend source resources.
  - Extended the `use_actor_action` AI/Codex tool schema and execution path with the same target effect support.
  - Updated the AI tool context contract and REST docs for target effect application.
- Automated validation:
  - `pnpm --filter @open-tabletop/api test -- src/app.test.ts -t "applies system action damage"` passed.
  - `pnpm --filter @open-tabletop/api test -- src/app.test.ts -t "executes expanded ai tools"` passed.
  - `pnpm --filter @open-tabletop/ai-core build` passed.
  - `pnpm --filter @open-tabletop/api build` passed.
  - `pnpm check` passed across lint, typecheck, tests, and build; the full API suite reported `67 passed`.
  - API tests verify GM-applied Longsword damage to a target HP pool, GM-applied Healing Word with spell-slot consumption, player target-update denial, unchanged target HP after denial, and unchanged source spell slots after denial.
  - AI tool tests verify provider-requested `use_actor_action` can apply a Healing Word effect to the actor HP pool while consuming the spell slot and recording tool observability.
- Manual API evidence:
  - Built-API smoke used `apps/api/dist` with `MemoryStateStore` and real bearer tokens from `POST /api/v1/auth/login`; no dev server was started.
  - GM-created `Manual Effect Mender` as a player-owned Generic Fantasy actor and `Manual Effect Target` as a GM-owned target, then imported Longsword and Healing Word to the source actor.
  - GM Longsword damage returned `200` with effect `{ type: "damage", pool: "hp", amount: 5, before: 10, after: 5, max: 10 }` and persisted target HP `{ current: 5, max: 10 }`.
  - Player Healing Word with `consumeResources: true`, `applyEffect: true`, and the GM-owned target returned `403 Missing permission: actor.update`, left target HP `{ current: 5, max: 10 }`, and left source `level1` spell slots `{ current: 1, max: 1, recovery: "long" }`.
  - GM Healing Word with `consumeResources: true` and `applyEffect: true` returned `200`, consumed `{ type: "spellSlot", key: "level1", amount: 1, remaining: 0 }`, applied healing effect `{ type: "healing", pool: "hp", amount: 4, before: 5, after: 9, max: 10 }`, persisted target HP `{ current: 9, max: 10 }`, persisted source `level1` spell slots `{ current: 0, max: 1, recovery: "long" }`, and left `2` source action roll chat messages.

### D&D 5.5e SRD Focus Slice

- Implementation:
  - Added `dnd-5e-srd` as the primary built-in rules runtime targeting SRD 5.2.1 / 5.5e-compatible play.
  - Added a first-class system manifest, made the demo campaign default active system `dnd-5e-srd`, and made new API-created campaigns/actors/items default to `dnd-5e-srd`.
  - Added SRD-oriented Fighter, Cleric, and Wizard character templates, SRD character import normalization, SRD encounter threats, level advancement, rest recovery, spell-slot-consuming action use, and sheet/quick-roll routing.
  - Added SRD compendium entries for Longsword, Healing Word, Fire Bolt, Cure Wounds, Shield, Magic Initiate, Savage Attacker, Blessed, Poisoned, and Restrained using short original summaries rather than copying SRD prose.
  - Updated Codex loopback and AI `read_compendium` defaults to prefer `dnd-5e-srd`, while leaving Generic Fantasy, Stellar Frontiers, and Mystic Noir available as demo runtimes for later expansion.
  - Added SRD attribution in REST/System SDK docs and cited the D&D Beyond SRD page as the source for SRD 5.2.1 / CC-BY-4.0 compatibility.
- Automated validation:
  - `pnpm --filter @open-tabletop/system-sdk test -- --run` passed with `23 passed`.
  - `pnpm --filter @open-tabletop/system-sdk build` passed.
  - `pnpm --filter @open-tabletop/api test -- src/app.test.ts -t "D&D 5.5e SRD"` passed.
  - `pnpm --filter @open-tabletop/api test -- src/app.test.ts -t "system runtime"` passed.
  - `pnpm --filter @open-tabletop/core build`, `pnpm --filter @open-tabletop/api build`, `pnpm --filter @open-tabletop/codex-app-server-provider build`, and `pnpm --filter @open-tabletop/web build` passed.
  - `pnpm check` passed across lint, typecheck, tests, and build; the full API suite reported `68 passed`, and the full System SDK suite reported `23 passed`.
  - System SDK tests verify SRD templates, compendium entries, quick rolls, advancement, rest, spell-slot-consuming action use, condition application, character import warnings, and SRD encounter planning.
  - API tests verify system registration, template listing, Cleric creation with Healing Word/Cure Wounds, SRD compendium reads, Healing Word resource consumption plus target HP application, and persisted target HP.
- Manual API evidence:
  - Built-API smoke used `apps/api/dist` with `MemoryStateStore` and real bearer tokens from `POST /api/v1/auth/login`; no dev server was started.
  - `GET /systems` returned `dnd-5e-srd` as `active: true`, name `D&D 5.5e SRD`, version `5.2.1`, and the expected actor/dice/chat permissions.
  - `GET /systems/dnd-5e-srd/character-templates` returned `fighter,cleric,wizard`.
  - Creating `Manual SRD Cleric` from the Cleric template returned actor system `dnd-5e-srd`, spells `Healing Word,Cure Wounds`, and `level1` spell slots `{ current: 2, max: 2, recovery: "long" }`.
  - SRD compendium sample included `healing-word` as a spell with `healingFormula: "1d4+@attributes.wisdom"` and `magic-initiate` as a condition-backed sheet marker.
  - Healing Word with `consumeResources: true` and `applyEffect: true` rolled formula `1d4+3`, consumed `{ type: "spellSlot", key: "level1", amount: 1, remaining: 1 }`, applied healing effect `{ type: "healing", pool: "hp", amount: 6, before: 4, after: 10, max: 12 }`, persisted target HP `{ current: 10, max: 12 }`, and persisted source spell slots `{ current: 1, max: 2, recovery: "long" }`.
  - SRD encounter planning for `2x Goblin Minion` returned `standard encounter: 2x Goblin Minion (100/100 budget)` from `POST /api/v1/campaigns/camp_demo/systems/dnd-5e-srd/encounter-plan`.

### D&D SRD Spell Upcasting Slice

- Implementation:
  - Added `spellSlotLevel` support to stateful system action use so SRD leveled spell actions can resolve an upcast formula and spend the matching spell slot.
  - Updated SRD Healing Word and Cure Wounds compendium data with SRD 5.2.1-oriented Wisdom formulas and per-slot upcast dice.
  - Expanded default SRD Cleric/Wizard spell-slot normalization so level 3 imports and advancements receive level 2 slots.
  - Threaded `spellSlotLevel` through the REST system roll endpoint and AI `use_actor_action` tool schema/execution path.
- Automated validation:
  - `pnpm --filter @open-tabletop/system-sdk test -- --run` passed with `23 passed`.
  - `pnpm --filter @open-tabletop/ai-core build`, `pnpm --filter @open-tabletop/system-sdk build`, and `pnpm --filter @open-tabletop/api build` passed.
  - `pnpm --filter @open-tabletop/api test -- src/app.test.ts -t "D&D 5.5e SRD"` passed.
  - `pnpm --filter @open-tabletop/api test -- src/app.test.ts -t "executes expanded ai tools"` passed.
  - `pnpm check` passed across lint, typecheck, tests, and build; the full API suite reported `68 passed`.
  - System SDK tests verify level 2 Healing Word resolves `1d4+3+2d4`, level 2 Cure Wounds resolves `2d8+3+2d8`, level 2 Cure Wounds consumes `level2`, and level 3 SRD Cleric imports include `level1` and `level2` spell slots.
  - API tests verify SRD Healing Word accepts `spellSlotLevel: 2`, returns upcast formula `1d4+3+2d4`, consumes a `level2` slot, applies healing to target HP, and persists source spell-slot state.
- Manual API evidence:
  - Built-API smoke used `apps/api/dist` with `MemoryStateStore` and a real bearer token from `POST /api/v1/auth/login`; no dev server was started.
  - Importing a level 3 `Manual Upcast Cleric` returned spell slots `{ level1: { current: 4, max: 4, recovery: "long" }, level2: { current: 2, max: 2, recovery: "long" } }`.
  - Level 2 Healing Word with `consumeResources: true`, `applyEffect: true`, and `spellSlotLevel: 2` returned quick-roll and roll formula `1d4+3+2d4`, consumed `{ type: "spellSlot", key: "level2", amount: 1, remaining: 1 }`, applied healing effect `{ type: "healing", pool: "hp", amount: 9, before: 1, after: 10, max: 18 }`, persisted source `level2` slots `{ current: 1, max: 2, recovery: "long" }`, and persisted target HP `{ current: 10, max: 18 }`.

### D&D SRD Saving Throw Proficiency Slice

- Implementation:
  - Added SRD saving throw quick rolls for all six abilities with class save proficiencies adding the actor's proficiency bonus.
  - Added default save proficiencies for Fighter, Cleric, and Wizard templates and normalized imported SRD characters to class defaults when explicit `saveProficiencies` are absent.
  - Updated SRD sheets so `quickRolls` include both ability checks and saving throws, while existing action rolls remain available.
- Automated validation:
  - `pnpm --filter @open-tabletop/system-sdk test -- --run` passed with `23 passed`.
  - `pnpm --filter @open-tabletop/system-sdk build` and `pnpm --filter @open-tabletop/api build` passed.
  - `pnpm --filter @open-tabletop/api test -- src/app.test.ts -t "D&D 5.5e SRD"` passed.
  - `pnpm check` passed across lint, typecheck, tests, and build; the full API suite reported `68 passed`.
  - System SDK tests verify Cleric `saveProficiencies` default to `wisdom,charisma`, Wisdom saves resolve `1d20+5`, Charisma saves resolve `1d20+2`, non-proficient Strength saves resolve `1d20+0`, and imported Clerics retain `wisdom,charisma` save proficiencies.
  - API tests verify the Cleric template returns `saveProficiencies`, the sheet includes `save-wisdom`, and the system roll endpoint posts `Wisdom Save: 1d20+5`.
- Manual API evidence:
  - Built-API smoke used `apps/api/dist` with `MemoryStateStore` and a real bearer token from `POST /api/v1/auth/login`; no dev server was started.
  - Creating `Manual Save Cleric` from the Cleric template returned `saveProficiencies: ["wisdom","charisma"]`.
  - The returned sheet included `save-strength: 1d20+0`, `save-dexterity: 1d20+1`, `save-constitution: 1d20+1`, `save-intelligence: 1d20+1`, `save-wisdom: 1d20+5`, and `save-charisma: 1d20+2`.
  - Posting a roll with `rollId: "save-wisdom"` returned quick roll `{ id: "save-wisdom", label: "Wisdom Save", formula: "1d20+5" }`, roll formula `1d20+5`, and chat body `Manual Save Cleric Wisdom Save: 1d20+5 = 14`.

### D&D SRD Skill Proficiency Slice

- Implementation:
  - Added SRD skill check quick rolls for all eighteen SRD skills using the standard ability mapping and actor proficiency bonus.
  - Added template/default skill proficiencies for Fighter, Cleric, and Wizard, plus normalized SRD character import support for `skillProficiencies` and `skillExpertise`.
  - Updated SRD quick rolls and sheets so `skill-*` roll ids sit alongside ability checks, saving throws, and compendium-backed action rolls.
- Automated validation:
  - `pnpm --filter @open-tabletop/system-sdk test -- --run` passed with `23 passed`.
  - `pnpm --filter @open-tabletop/system-sdk build` and `pnpm --filter @open-tabletop/api build` passed.
  - `pnpm --filter @open-tabletop/api test -- src/app.test.ts -t "D&D 5.5e SRD"` passed.
  - `pnpm check` passed across lint, typecheck, tests, and build; the full API suite reported `68 passed`.
  - System SDK tests verify Cleric `skillProficiencies` default to `medicine,religion`, Medicine resolves `1d20+5`, Religion resolves `1d20+2` against an Intelligence 11 Cleric, non-proficient Perception resolves `1d20+3`, Poisoned changes skill checks to `2d20kl1`, and imported Clerics retain `medicine,religion` skill proficiencies.
  - API tests verify the Cleric template returns `skillProficiencies`, the sheet includes `skill-medicine`, and the system roll endpoint posts `Medicine Check: 1d20+5`.
- Manual API evidence:
  - Built-API smoke used `apps/api/dist` with `MemoryStateStore` and a real bearer token from `POST /api/v1/auth/login`; no dev server was started.
  - Creating `Manual Skill Cleric` from the Cleric template returned `skillProficiencies: ["medicine","religion"]` and `saveProficiencies: ["wisdom","charisma"]`.
  - The returned sheet included `skill-medicine: 1d20+5`, `skill-perception: 1d20+3`, `skill-religion: 1d20+3`, and `skill-stealth: 1d20+1`.
  - Posting a roll with `rollId: "skill-medicine"` returned quick roll `{ id: "skill-medicine", label: "Medicine Check", formula: "1d20+5" }`, roll formula `1d20+5`, and chat body `Manual Skill Cleric Medicine Check: 1d20+5 = 17`.

### D&D SRD Tool Proficiency Slice

- Implementation:
  - Added SRD tool check quick rolls for template/import tool proficiencies, including Sage Calligrapher's Supplies and Soldier Gaming Set defaults.
  - Added `toolProficiencies` to Fighter, Cleric, and Wizard templates and normalized SRD character import support for `toolProficiencies` and `toolExpertise`.
  - Updated SRD quick rolls and sheets so `tool-*` roll ids sit alongside ability checks, saving throws, skill checks, and compendium-backed action rolls.
- Automated validation:
  - `pnpm --filter @open-tabletop/system-sdk test -- --run` passed with `23 passed`.
  - `pnpm --filter @open-tabletop/system-sdk build` and `pnpm --filter @open-tabletop/api build` passed.
  - `pnpm --filter @open-tabletop/api test -- src/app.test.ts -t "D&D 5.5e SRD"` passed.
  - `pnpm check` passed across lint, typecheck, tests, and build; the full API suite reported `68 passed`.
  - System SDK tests verify Cleric `toolProficiencies` default to `calligraphers-supplies`, Fighter defaults to `gaming-set`, Calligrapher's Supplies resolves `1d20+3`, Poisoned changes the tool check to `2d20kl1+3`, and imported Clerics retain `calligraphers-supplies`.
  - API tests verify the Cleric template returns `toolProficiencies`, the sheet includes `tool-calligraphers-supplies`, and the system roll endpoint posts `Calligrapher's Supplies Check: 1d20+3`.
- Manual API evidence:
  - Built-API smoke used `apps/api/dist` with `MemoryStateStore` and a real bearer token from `POST /api/v1/auth/login`; no dev server was started.
  - Creating `Manual Tool Cleric` from the Cleric template returned `toolProficiencies: ["calligraphers-supplies"]` and `skillProficiencies: ["medicine","religion"]`.
  - The returned sheet included `save-wisdom: 1d20+5`, `skill-medicine: 1d20+5`, and `tool-calligraphers-supplies: 1d20+3`.
  - Posting a roll with `rollId: "tool-calligraphers-supplies"` returned quick roll `{ id: "tool-calligraphers-supplies", label: "Calligrapher's Supplies Check", formula: "1d20+3" }`, roll formula `1d20+3`, and chat body `Manual Tool Cleric Calligrapher's Supplies Check: 1d20+3 = 12`.

### D&D SRD Equipment Purchasing Slice

- Implementation:
  - Added SRD currency tracking to Fighter, Cleric, and Wizard templates and normalized imported SRD character currency.
  - Added SRD equipment costs/weights for Longsword, Shield gear, and Calligrapher's Supplies, while preserving the Shield spell as a separate compendium entry.
  - Added `POST /api/v1/campaigns/{campaignId}/systems/{systemId}/actors/{actorId}/purchase` for D&D SRD actors. The route requires owned-actor or GM edit permission, spends actor currency, creates the purchased compendium item with quantity and purchase metadata, updates the sheet, and rejects insufficient funds without mutating currency.
- Automated validation:
  - `pnpm --filter @open-tabletop/system-sdk test -- --run` passed with `23 passed`.
  - `pnpm --filter @open-tabletop/system-sdk build` and `pnpm --filter @open-tabletop/api build` passed.
  - `pnpm --filter @open-tabletop/api test -- src/app.test.ts -t "D&D 5.5e SRD"` passed.
  - `pnpm check` passed across lint, typecheck, tests, and build; the full API suite reported `68 passed`.
  - System SDK tests verify SRD template currency, Longsword and Shield equipment costs, two-Longsword purchase cost and remaining currency, purchased item metadata, insufficient-currency rejection, and condition non-purchasability.
  - API tests verify the Cleric template returns starting currency, SRD compendium exposes Shield equipment cost, purchasing two Longswords spends 30 GP and creates a quantity-2 item, and an over-budget follow-up purchase returns `409` while preserving the 20 GP balance.
- Manual API evidence:
  - Built-API smoke used `apps/api/dist` with `MemoryStateStore` and a real bearer token from `POST /api/v1/auth/login`; no dev server was started.
  - Creating `Manual Purchase Fighter` from the Fighter template returned starting currency `{ gp: 50, sp: 0, cp: 0 }`.
  - Purchasing `shield-armor` returned `200`, purchase metadata `{ entryId: "shield-armor", quantity: 1, unitCostGp: 10, totalCostGp: 10, currency: { gp: 40, sp: 0, cp: 0 } }`, and created a `Shield` item with `{ armorBonus: 2, costGp: 10, weightLb: 6, quantity: 1, purchasedForGp: 10 }`.
  - Attempting to buy four Longswords afterward returned `409` with `Insufficient currency: requires 60 GP, available 40 GP`, and the stored actor currency remained `{ gp: 40, sp: 0, cp: 0 }`.

### D&D SRD Monster XP/CR Encounter Slice

- Implementation:
  - Replaced the placeholder D&D encounter budgets with SRD monster stat block payloads for Bandit, Goblin Warrior/Minion, Tough, Goblin Boss, Hobgoblin Captain, and Tough Boss.
  - Added CR, XP, AC, HP, abilities, saves, senses, languages, gear, traits, and action summaries to D&D SRD threat responses.
  - Added 2024 Basic Rules low/standard/hard XP budgets per character level and made D&D encounter plans classify selected monster XP as trivial/easy/standard/hard/deadly against the party budget.
- Automated validation:
  - `pnpm --filter @open-tabletop/system-sdk test -- --run` passed with `23 passed`.
  - `pnpm --filter @open-tabletop/system-sdk build` and `pnpm --filter @open-tabletop/system-sdk lint` passed.
  - `pnpm --filter @open-tabletop/api build` passed.
  - `pnpm --filter @open-tabletop/api test -- src/app.test.ts -t "D&D 5.5e SRD"` passed.
  - System SDK tests verify Goblin Boss CR `1` / `200 XP`, Tough Boss CR `4` / `1100 XP`, D&D level 2 party XP budgets `{ easy: 100, standard: 150, hard: 200 }`, and hard difficulty for one CR 1 Goblin Boss against one level 2 character.
  - API tests verify D&D threat payloads expose monster stat fields and that two CR 1/4 Goblin Warriors classify as a hard encounter for one level 1 Cleric with `{ easy: 50, standard: 75, hard: 100 }` budgets.
- Manual API evidence:
  - Built-API smoke used `apps/api/dist` with `MemoryStateStore` and a real bearer token from `POST /api/v1/auth/login`; no dev server was started.
  - Creating `Manual XP Cleric` from the Cleric template returned actor level `1`.
  - `GET /systems/dnd-5e-srd/encounter-threats` returned `goblin-warrior` with CR `1/4`, `50 XP`, AC `15`, HP `10`, and actions `Scimitar`, `Shortbow`, `Nimble Escape`; `goblin-boss` with CR `1`, `200 XP`, AC `17`, HP `21`, and actions `Multiattack`, `Scimitar`, `Shortbow`; and `tough-boss` with CR `4`, `1100 XP`, AC `16`, HP `82`, and actions `Multiattack`, `Warhammer`, `Heavy Crossbow`.
  - Planning `2x Goblin Warrior` for the level 1 Cleric returned `hard encounter: 2x Goblin Warrior (100/100 XP; easy 50, standard 75, hard 100)`, with `difficulty: "hard"`, `partyRating: 100`, `threatBudget: 100`, and threat metadata `{ id: "goblin-warrior", count: 2, budgetEach: 50, budgetTotal: 100, challengeRating: "1/4" }`.
  - Planning `1x Goblin Boss` for the same level 1 Cleric returned `deadly encounter: 1x Goblin Boss (200/100 XP; easy 50, standard 75, hard 100)`.

### D&D SRD Monster Action Automation Slice

- Implementation:
  - Added D&D SRD monster actor data generation from encounter threat stat blocks, including HP, AC, CR, XP, abilities, skills, and copied monster metadata.
  - Added `POST /api/v1/campaigns/{campaignId}/systems/{systemId}/monsters` for creating campaign monster actors from `dnd-5e-srd` threat ids.
  - Added monster sheet quick rolls for stat block attack and damage actions, with IDs such as `monster-scimitar-attack`, `monster-scimitar-damage`, `monster-shortbow-attack`, and `monster-shortbow-damage`.
  - Reused the existing system roll path so monster damage quick rolls can post to chat and apply HP damage through `applyEffect` with the same target permission checks as other damage actions.
- Automated validation:
  - `pnpm --filter @open-tabletop/system-sdk test -- --run` passed with `23 passed`.
  - `pnpm --filter @open-tabletop/system-sdk build` passed.
  - `pnpm --filter @open-tabletop/api test -- src/app.test.ts -t "D&D 5.5e SRD"` passed with `1 passed | 60 skipped`.
  - `pnpm --filter @open-tabletop/api build` passed.
  - System SDK tests verify `dnd5eSrdMonsterActorData("goblin-boss")` returns HP `{ current: 21, max: 21 }`, AC `17`, CR `1`, XP `200`, and Goblin Boss Scimitar/Shortbow attack and damage quick rolls.
  - API tests verify D&D monster creation returns a `type: "monster"` actor with stat block-derived data, sheet quick rolls, chat-posted monster attack rolls, and target HP damage application from monster damage rolls.
- Manual API evidence:
  - Built-API smoke used `apps/api/dist` with `MemoryStateStore` and a real bearer token from `POST /api/v1/auth/login`; no dev server was started.
  - `POST /systems/dnd-5e-srd/monsters` for `goblin-boss` with name `Manual Action Goblin Boss` returned `200`.
  - The created monster actor `act_monmapvz015uxo14` returned HP `{ current: 21, max: 21 }`, AC `17`, CR `1`, and XP `200`.
  - The returned sheet exposed quick rolls `{ id: "monster-scimitar-attack", label: "Scimitar Attack", formula: "1d20+4" }`, `{ id: "monster-scimitar-damage", label: "Scimitar Damage", formula: "1d6+2" }`, `{ id: "monster-shortbow-attack", label: "Shortbow Attack", formula: "1d20+4" }`, and `{ id: "monster-shortbow-damage", label: "Shortbow Damage", formula: "1d6+2" }`.
  - Rolling `monster-scimitar-attack` returned `200`, formula `1d20+4`, and chat body `Manual Action Goblin Boss Scimitar Attack: 1d20+4 = 6`.
  - Rolling `monster-scimitar-damage` with `applyEffect: true` against `Manual Monster Target` returned `200`, formula `1d6+2`, effect `{ type: "damage", targetActorName: "Manual Monster Target", pool: "hp", amount: 3, before: 10, after: 7, max: 12 }`, and stored target HP `{ current: 7, max: 12 }`.

### D&D SRD Character Origin Choice Slice

- Implementation:
  - Added SRD character origin catalogs for the Acolyte, Criminal, Sage, and Soldier backgrounds and Dragonborn, Dwarf, Elf, Gnome, Goliath, Halfling, Human, Orc, and Tiefling species metadata.
  - Added `GET /api/v1/campaigns/{campaignId}/systems/{systemId}/character-origins` for D&D SRD builder clients.
  - Extended D&D SRD character creation to accept `backgroundId`, `speciesId`, and `abilityScoreIncreases` when creating actors from Fighter, Cleric, or Wizard templates.
  - Origin application now sets background skill/tool proficiencies, origin feat tracking, starting 50 GP, species traits/resources, senses, speed/size metadata, and validates SRD background ability-score increases as either `+2/+1` or `+1/+1/+1` against the chosen background's ability list.
  - Added SRD compendium/tool support for Alert and Thieves' Tools so Criminal-background characters expose matching tool quick rolls.
- Automated validation:
  - `pnpm --filter @open-tabletop/system-sdk test -- --run` passed with `24 passed`.
  - `pnpm --filter @open-tabletop/system-sdk build` passed.
  - `pnpm --filter @open-tabletop/api test -- src/app.test.ts -t "D&D 5.5e SRD"` passed with `1 passed | 60 skipped`.
  - `pnpm --filter @open-tabletop/api build` passed.
  - System SDK tests verify the four SRD background ids, nine SRD species ids, Alert and Thieves' Tools compendium entries, Criminal/Orc origin application to a Wizard template, validated Dexterity/Constitution ability increases, Orc Adrenaline Rush and Relentless Endurance resources, and Stealth/Thieves' Tools quick-roll formulas.
  - API tests verify the new origins endpoint, successful creation of a Criminal Orc Wizard with background/species data and quick rolls, and `400` rejection when a Criminal background attempts a Strength ability increase.
- Manual API evidence:
  - Built-API smoke used `apps/api/dist` with `MemoryStateStore` and a real bearer token from `POST /api/v1/auth/login`; no dev server was started.
  - `GET /systems/dnd-5e-srd/character-origins` returned backgrounds `acolyte,criminal,sage,soldier` and species `dragonborn,dwarf,elf,gnome,goliath,halfling,human,orc,tiefling`.
  - Creating `Manual Origin Wizard` from the Wizard template with `backgroundId: "criminal"`, `speciesId: "orc"`, and `abilityScoreIncreases: { dexterity: 2, constitution: 1 }` returned `200` and actor `act_monmnoknhz4u9mwg`.
  - The created actor had `background: "Criminal"`, `species: "Orc"`, attributes `{ strength: 8, dexterity: 16, constitution: 15, intelligence: 16, wisdom: 12, charisma: 10 }`, skill proficiencies `["sleight-of-hand","stealth"]`, tool proficiencies `["thieves-tools"]`, feats `["Alert"]`, Orc resources `{ adrenalineRush: { current: 2, max: 2, recovery: "short" }, relentlessEndurance: { current: 1, max: 1, recovery: "long" } }`, senses `["Darkvision 120 ft."]`, and origin metadata `{ source: "SRD 5.2.1", backgroundId: "criminal", speciesId: "orc", abilityScoreIncreases: { dexterity: 2, constitution: 1 } }`.
  - The returned sheet exposed quick rolls `{ id: "skill-stealth", label: "Stealth Check", formula: "1d20+5" }` and `{ id: "tool-thieves-tools", label: "Thieves' Tools Check", formula: "1d20+5" }`.
  - Creating a Criminal character with invalid `{ strength: 2, constitution: 1 }` ability increases returned `400` with `D&D SRD Criminal ability increases can only use dexterity, constitution, intelligence`.

### D&D SRD Spell And Weapon Compendium Slice

- Implementation:
  - Added bounded SRD spell compendium entries for Chromatic Orb, Ice Knife, and Ray of Sickness using original short summaries and SRD-derived structured data.
  - Added bounded SRD weapon entries for Dagger, Quarterstaff, Shortbow, and Spear with cost, weight, damage, damage type, properties, and purchase metadata.
  - Added fixed spell damage formula support to actor action quick rolls so spells can expose `spell-{itemId}-damage` without requiring an ability modifier.
  - Added secondary damage formula support for entries such as Ice Knife with `spell-{itemId}-secondary-damage`.
  - Extended `spellSlotLevel` formula resolution so fixed damage formulas can upcast through the same stateful spell-slot consumption path as supported healing formulas.
  - Updated the browser actor action list so compendium-backed fixed and secondary damage actions appear in the sheet UI.
- Automated validation:
  - `pnpm --filter @open-tabletop/system-sdk test -- --run` passed with `24 passed`.
  - `pnpm --filter @open-tabletop/system-sdk build` passed.
  - `pnpm --filter @open-tabletop/api test -- src/app.test.ts -t "D&D 5.5e SRD"` passed with `1 passed | 60 skipped` after rebuilding the SDK package used by the API.
  - `pnpm --filter @open-tabletop/api build` passed.
  - `pnpm check` passed across lint, typecheck, tests, and build; the full API suite reported `68 passed`.
  - System SDK tests verify the new spell and weapon compendium entries, Chromatic Orb and Ice Knife quick rolls, Chromatic Orb level 2 formula `3d8+1d8`, Ice Knife secondary level 2 formula `2d6+1d6`, Shortbow damage quick rolls, and Shortbow purchase cost/remaining currency.
  - API tests verify D&D compendium reads include Chromatic Orb, Ice Knife, and Shortbow; a D&D actor can attach Chromatic Orb from the compendium; the sheet exposes `Chromatic Orb Damage`; a level 2 Chromatic Orb roll resolves `3d8+1d8`, consumes a `level2` spell slot, applies target HP damage, and persists source/target state.
- Manual API evidence:
  - Built-API smoke used `apps/api/dist` with `MemoryStateStore` and a real bearer token from `POST /api/v1/auth/login`; no dev server was started.
  - `GET /systems/dnd-5e-srd/compendium` returned `200` and included `chromatic-orb` with `damageFormula: "3d8"`, `ice-knife` with `damageFormula: "1d10"` and `secondaryDamageFormula: "2d6"`, `ray-of-sickness` with `damageFormula: "2d8"`, and `shortbow` with `damage: "1d6"` and `costGp: 25`.
  - Creating `Manual Damage Wizard` from the Wizard template with Sage/Human origins returned `200` and actor `act_monn2cxvh7a6505q`.
  - Adding `chromatic-orb` to that actor returned sheet quick roll `{ id: "spell-itm_monn2cxz9a1y2wfn-damage", label: "Chromatic Orb Damage", formula: "3d8" }`.
  - Purchasing `shortbow` returned `200`, spent 25 GP, left currency `{ gp: 25, sp: 0, cp: 0 }`, and exposed item quick roll `{ id: "item-itm_monn2cy2xbqday6k-damage", label: "Shortbow Damage", formula: "1d6+2" }`.
  - Rolling Chromatic Orb with `spellSlotLevel: 2`, `consumeResources: true`, and `applyEffect: true` returned formula `3d8+1d8`, consumed `{ type: "spellSlot", key: "level2", amount: 1, remaining: 0 }`, applied damage effect `{ type: "damage", pool: "hp", amount: 12, before: 12, after: 0, max: 12 }`, persisted source `level2` slots `{ current: 0, max: 1, recovery: "long" }`, and persisted target HP `{ current: 0, max: 12 }`.

### D&D SRD Armor Class Automation Slice

- Implementation:
  - Added bounded SRD armor compendium entries for Leather Armor and Chain Mail, and expanded Shield gear with armor metadata.
  - Added D&D SRD Armor Class calculation for actor sheets using owned armor and shield items: unarmored base, light/heavy armor bases, Dexterity contribution, shield bonus, stealth disadvantage metadata, Strength requirement, and speed penalty.
  - Kept computed AC in returned sheet data rather than mutating stored actor data, so existing actors remain stable while clients can render current sheet AC.
  - Updated the browser actor panel to show computed D&D SRD AC from actor items alongside HP, resources, inventory, spells, and actions.
- Automated validation:
  - `pnpm --filter @open-tabletop/system-sdk test -- --run` passed with `24 passed`.
  - `pnpm --filter @open-tabletop/system-sdk build` passed.
  - `pnpm --filter @open-tabletop/api test -- src/app.test.ts -t "D&D 5.5e SRD"` passed with `1 passed | 60 skipped`.
  - `pnpm --filter @open-tabletop/api build` passed.
  - `pnpm check` passed across lint, typecheck, tests, and build; the full API suite reported `68 passed`.
  - System SDK tests verify Leather Armor, Chain Mail, and Shield compendium data; Leather Armor plus Shield computes AC `14`; Chain Mail plus Shield computes AC `18` with Strength `13`, stealth disadvantage, and a `-10` speed penalty for an under-Strength actor; and Leather Armor purchasing spends 10 GP.
  - API tests verify D&D compendium reads include Leather Armor and Chain Mail, Shield purchasing spends 10 GP after prior purchases, the returned sheet computes AC `13` from unarmored defense plus Shield, and an over-budget follow-up purchase returns `409` while preserving the 10 GP balance.
- Manual API evidence:
  - Built-API smoke used `apps/api/dist` with `MemoryStateStore` and a real bearer token from `POST /api/v1/auth/login`; no dev server was started.
  - `GET /systems/dnd-5e-srd/compendium` returned `200` and included `shield-armor` with `armorBonus: 2`, `leather-armor` with `armorBase: 11` and `costGp: 10`, and `chain-mail` with `armorBase: 16`, `dexBonus: false`, `strengthRequirement: 13`, `stealthDisadvantage: true`, and `costGp: 75`.
  - Creating `Manual Armor Fighter` from the Fighter template with Soldier/Human origins returned `200` and starting sheet AC `11`.
  - Purchasing `leather-armor` returned `200`, left currency `{ gp: 40, sp: 0, cp: 0 }`, and returned sheet armor details `{ value: 12, base: 11, dexModifier: 1, armorName: "Leather Armor", shieldBonus: 0, speedPenalty: 0 }`.
  - Purchasing `shield-armor` returned `200`, left currency `{ gp: 30, sp: 0, cp: 0 }`, and returned sheet armor details `{ value: 14, base: 11, dexModifier: 1, armorName: "Leather Armor", shieldBonus: 2, speedPenalty: 0 }`.
  - `GET /systems/dnd-5e-srd/actors/{actorId}/sheet` returned `armorClass: 14` with the same Armor Class details after both purchases.

### D&D SRD Fighter Second Wind Automation Slice

- Implementation:
  - Added D&D SRD Fighter Second Wind class-feature quick rolls through `feature-second-wind-healing`.
  - Updated Fighter templates and default imported/advanced Fighter resources to the SRD 5.2.1 two-use Second Wind pool.
  - Added Second Wind action formula resolution as `1d10 + Fighter level`.
  - Added stateful Second Wind use through the D&D action path so `consumeResources: true` spends one `secondWind` resource before posting the roll.
  - Reused the existing target-effect path so `applyEffect: true` applies the Second Wind roll as HP healing to the Fighter by default.
  - Added D&D-specific rest recovery semantics: a Short Rest restores one expended Second Wind use, and a Long Rest restores all uses, including older persisted Fighter actors that still had a one-use pool.
  - Updated the browser actor action list so D&D Fighter sheets expose `Second Wind Healing: 1d10+level` next to item and spell actions.
- Automated validation:
  - `pnpm --filter @open-tabletop/system-sdk test -- --run` passed with `24 passed`.
  - `pnpm --filter @open-tabletop/system-sdk build` passed.
  - `pnpm --filter @open-tabletop/api test -- src/app.test.ts -t "D&D 5.5e SRD"` passed with `1 passed | 60 skipped`.
  - `pnpm --filter @open-tabletop/api build` passed.
  - System SDK tests verify Fighter starts with `secondWind` `{ current: 2, max: 2, recovery: "short" }`, the Second Wind quick roll formula is `1d10+1`, level 3 formula resolution is `1d10+3`, action use consumes one resource use, depletion throws `Insufficient second wind`, Short Rest restores one use, and Long Rest restores all uses while upgrading old one-use pools.
  - API tests verify D&D Fighter creation exposes the Second Wind quick roll, resource-consuming rolls persist remaining uses, depletion returns `409`, Short Rest restores one use, Long Rest restores all uses, and `applyEffect: true` applies self-healing.
- Manual API evidence:
  - Built-API smoke used `apps/api/dist` with `MemoryStateStore` and real bearer tokens for GM and player sessions; no dev server or legacy `x-user-id` fallback was used.
  - Creating `Manual Second Wind Fighter` from the Fighter template returned `200`, actor `act_monns3gi22h91w1p`, starting resources `{ secondWind: { current: 2, max: 2, recovery: "short" } }`, and sheet quick roll `{ id: "feature-second-wind-healing", label: "Second Wind Healing", formula: "1d10+1" }`.
  - First `POST /systems/dnd-5e-srd/actors/{actorId}/roll` with `rollId: "feature-second-wind-healing"`, `consumeResources: true`, and `applyEffect: true` returned `200`, formula `1d10+1`, consumed `{ type: "resource", key: "secondWind", label: "Second Wind", amount: 1, remaining: 1 }`, applied healing `{ amount: 10, before: 4, after: 12, max: 12 }`, and persisted resources `{ secondWind: { current: 1, max: 2, recovery: "short" } }`.
  - A second consuming roll returned `200`, consumed the remaining use, and persisted resources `{ secondWind: { current: 0, max: 2, recovery: "short" } }`.
  - A third consuming roll returned `409` with `Insufficient second wind`.
  - `POST /rest` with `restType: "short"` returned `200`, recovered `{ secondWind: 1 }`, and persisted resources `{ secondWind: { current: 1, max: 2, recovery: "short" } }`.
  - `POST /rest` with `restType: "long"` after forcing zero uses returned `200`, recovered `{ secondWind: 2 }`, and persisted resources `{ secondWind: { current: 2, max: 2, recovery: "short" } }`.
  - `GET /sheet` still returned the `feature-second-wind-healing` quick roll with formula `1d10+1`.

### D&D SRD Fighter Level 2 Feature Automation Slice

- Implementation:
  - Added D&D SRD Fighter level-2 class-feature quick rolls for `feature-action-surge` and `feature-tactical-mind-bonus`.
  - Added level-aware Fighter resource defaults: Second Wind stays two uses at levels 1-3, increases to three uses at level 4, and Action Surge appears at level 2 with one Short Rest resource use.
  - Updated D&D advancement so level-2 Fighters gain Action Surge and Tactical Mind feature tracking plus the `actionSurge` resource pool.
  - Added stateful Action Surge use through the D&D action path so `consumeResources: true` spends one `actionSurge` resource before posting the feature action.
  - Added Tactical Mind bonus use through the D&D action path as `1d10`, spending one Second Wind use.
  - Extended D&D rest recovery so Short Rest restores one expended Second Wind use and all expended Action Surge uses, while Long Rest restores all uses and upgrades older lower-max Fighter pools.
- Automated validation:
  - `pnpm --filter @open-tabletop/system-sdk test -- --run` passed with `24 passed`.
  - `pnpm --filter @open-tabletop/system-sdk build` passed.
  - `pnpm --filter @open-tabletop/api test -- src/app.test.ts -t "D&D 5.5e SRD"` passed with `1 passed | 60 skipped` after rebuilding the SDK package used by the API.
  - `pnpm --filter @open-tabletop/api build` passed.
  - System SDK tests verify level-2 Fighter advancement adds Action Surge and Tactical Mind, resources become `{ secondWind, actionSurge }`, class-feature quick rolls include `feature-action-surge` and `feature-tactical-mind-bonus`, Action Surge depletion throws `Insufficient action surge`, Tactical Mind consumes Second Wind, Short Rest restores Action Surge plus one Second Wind use, and level-4 Long Rest upgrades Second Wind to three uses.
  - API tests verify `/advance` persists level-2 Fighter features/resources, sheet quick rolls include Action Surge and Tactical Mind, consuming Action Surge persists its remaining use, repeated Action Surge returns `409`, Tactical Mind consumes Second Wind, and Short Rest recovers Action Surge plus one Second Wind use.
- Manual API evidence:
  - Built-API smoke used `apps/api/dist` with `MemoryStateStore` and real bearer tokens from `POST /auth/login` for GM and player sessions; no legacy `x-user-id` fallback was used.
  - Creating `Manual Level Two Fighter` from the Fighter template returned `200`, actor `act_mono61k7yu59xwdi`, and starting resources `{ secondWind: { current: 2, max: 2, recovery: "short" } }`.
  - `POST /advance` with `optionId: "level-up"` returned `200`, level `2`, features `["Fighting Style", "Second Wind", "Fighter Level 2", "Action Surge", "Tactical Mind"]`, resources `{ secondWind: { current: 2, max: 2, recovery: "short" }, actionSurge: { current: 1, max: 1, recovery: "short" } }`, and feature quick rolls `feature-second-wind-healing: 1d10+2`, `feature-action-surge: 0`, and `feature-tactical-mind-bonus: 1d10`.
  - `POST /roll` with `rollId: "feature-action-surge"` and `consumeResources: true` returned `200`, formula `0`, consumed `{ type: "resource", key: "actionSurge", label: "Action Surge", amount: 1, remaining: 0 }`, and persisted `actionSurge.current: 0`.
  - A second consuming Action Surge roll returned `409` with `Insufficient action surge`.
  - `POST /roll` with `rollId: "feature-tactical-mind-bonus"` and `consumeResources: true` returned `200`, formula `1d10`, consumed `{ type: "resource", key: "secondWind", label: "Second Wind", amount: 1, remaining: 1 }`, and preserved `actionSurge.current: 0`.
  - `POST /rest` with `restType: "short"` after forcing both resources to zero returned `200`, recovered `{ secondWind: 1, actionSurge: 1 }`, and persisted resources `{ secondWind: { current: 1, max: 2, recovery: "short" }, actionSurge: { current: 1, max: 1, recovery: "short" } }`.
  - `POST /rest` with `restType: "long"` after forcing both resources to zero returned `200`, recovered `{ secondWind: 2, actionSurge: 1 }`, and persisted resources `{ secondWind: { current: 2, max: 2, recovery: "short" }, actionSurge: { current: 1, max: 1, recovery: "short" } }`.

### D&D SRD Fighter Level 5 Feature Automation Slice

- Implementation:
  - Added D&D SRD Fighter level-5 feature progression for Extra Attack and Tactical Shift.
  - Added structured `QuickRoll.metadata` so passive feature automation can travel with normal rolls without inventing non-dice roll ids.
  - Added Extra Attack metadata to level-5 Fighter weapon damage quick rolls, including `attacksPerAction: 2`.
  - Added Tactical Shift metadata to level-5 Fighter Second Wind quick rolls, including half-speed movement and no opportunity attacks.
  - Added persisted Fighter combat metadata during advancement with `combat.attacksPerAction` and `combat.tacticalShift`.
  - Updated the browser D&D action list so Action Surge, Tactical Mind, Tactical Shift, and Extra Attack attack-count cues are visible outside the API sheet surface.
- Automated validation:
  - `pnpm --filter @open-tabletop/system-sdk test -- --run` passed with `24 passed`.
  - `pnpm --filter @open-tabletop/system-sdk build` passed.
  - `pnpm --filter @open-tabletop/api test -- src/app.test.ts -t "D&D 5.5e SRD"` passed with `1 passed | 60 skipped`.
  - `pnpm --filter @open-tabletop/api build` passed.
  - System SDK tests verify level-5 Fighter advancement adds Extra Attack and Tactical Shift, persists combat metadata, adds Tactical Shift metadata to Second Wind, and adds Extra Attack attack-count metadata to Longsword damage.
  - API tests verify four `/advance` calls reach level 5, persist Extra Attack/Tactical Shift and combat metadata, expose level-5 metadata in sheet quick rolls, and preserve weapon Extra Attack metadata through the `/roll` response.
- Manual API evidence:
  - Built-API smoke used `apps/api/dist` with `MemoryStateStore` and real bearer tokens from `POST /auth/login` for GM and player sessions; no legacy `x-user-id` fallback was used.
  - Creating `Manual Level Five Fighter` from the Fighter template returned `200`, actor `act_monofjrfdsy5tjf8`, Longsword roll id `item-itm_monofjrg6td1zbsk-damage`, and starting resources `{ secondWind: { current: 2, max: 2, recovery: "short" } }`.
  - Four `POST /advance` calls returned a level-5 Fighter with features `["Fighting Style", "Second Wind", "Fighter Level 2", "Action Surge", "Tactical Mind", "Fighter Level 3", "Fighter Level 4", "Fighter Level 5", "Extra Attack", "Tactical Shift"]`.
  - The level-5 actor persisted combat metadata `{ attacksPerAction: 2, tacticalShift: { movementFt: 15, opportunityAttacks: false } }` and resources `{ secondWind: { current: 2, max: 3, recovery: "short" }, actionSurge: { current: 1, max: 1, recovery: "short" } }`.
  - The level-5 sheet returned Second Wind as `1d10+5` with Tactical Shift metadata and Longsword Damage as `1d8+5` with `{ attacksPerAction: 2, feature: "Extra Attack" }`.
  - `POST /roll` for the Longsword damage id returned `200`, formula `1d8+5`, and preserved the Extra Attack metadata on `quickRoll`.
  - `POST /roll` for `feature-second-wind-healing` with `consumeResources: true` returned `200`, formula `1d10+5`, preserved Tactical Shift metadata on `quickRoll`, and consumed one Second Wind use with remaining `1`.

### D&D SRD Cleric Level 2 Channel Divinity Automation Slice

- Implementation:
  - Added D&D SRD Cleric level-2 feature progression for Channel Divinity, Divine Spark, and Turn Undead.
  - Added the level-aware `channelDivinity` resource pool: two uses starting at Cleric level 2, three uses at level 6, and four uses at level 18.
  - Added class-feature quick rolls for `feature-divine-spark-healing`, `feature-divine-spark-damage`, and `feature-turn-undead`.
  - Added Divine Spark healing/damage formulas as `d8 + Wisdom modifier`, scaling to additional d8s at Cleric levels 7, 13, and 18.
  - Added save DC metadata for Divine Spark damage and Turn Undead, plus damage type, range, target, condition, and duration metadata where applicable.
  - Added stateful Channel Divinity consumption through the D&D action path and D&D-specific rest recovery: one expended Channel Divinity use on Short Rest, all expended uses on Long Rest.
  - Updated the browser D&D action list so Divine Spark and Turn Undead appear alongside spell/item actions for level-2 Clerics.
- Automated validation:
  - `pnpm --filter @open-tabletop/system-sdk test -- --run` passed with `24 passed`.
  - `pnpm --filter @open-tabletop/system-sdk build` passed.
  - `pnpm --filter @open-tabletop/api test -- src/app.test.ts -t "D&D 5.5e SRD"` passed with `1 passed | 60 skipped`.
  - `pnpm --filter @open-tabletop/api build` passed.
  - `pnpm --filter @open-tabletop/web build` passed.
  - `pnpm check` passed.
  - System SDK tests verify level-2 Cleric advancement adds Channel Divinity/Divine Spark/Turn Undead, creates the `channelDivinity` resource, exposes quick-roll metadata, consumes Channel Divinity, rejects depleted use, and restores one use on Short Rest.
  - API tests verify `/advance` persists Cleric level-2 features/resources, sheet quick rolls expose Divine Spark and Turn Undead metadata, `consumeResources: true` spends Channel Divinity, Divine Spark healing can apply a target HP effect, depletion returns `409`, and Short Rest restores one use.
- Manual API evidence:
  - Built-API smoke used `apps/api/dist` with `MemoryStateStore` and real bearer tokens from `POST /auth/login` for GM and player sessions; no legacy `x-user-id` fallback was used.
  - Creating `Manual Level Two Cleric` from the Cleric template returned `200`, actor `act_monouzk796ghlrwy`, and starting resources `{}`.
  - `POST /advance` with the player bearer token returned level `2`, features `["Spellcasting", "Divine Order", "Cleric Level 2", "Channel Divinity", "Divine Spark", "Turn Undead"]`, and resources `{ channelDivinity: { current: 2, max: 2, recovery: "short" } }`.
  - The level-2 sheet returned `feature-divine-spark-healing` and `feature-divine-spark-damage` as `1d8+3`; Divine Spark damage included Constitution save DC `13`, success `half`, and `Necrotic`/`Radiant` damage type metadata. `feature-turn-undead` returned formula `0` with Wisdom save DC `13`, Undead target, Frightened/Incapacitated conditions, and 1-minute duration metadata.
  - `POST /roll` for `feature-divine-spark-healing` with `consumeResources: true`, `applyEffect: true`, and target `act_monouzked4za6u39` returned `200`, formula `1d8+3`, preserved Channel Divinity metadata, consumed one Channel Divinity use with remaining `1`, and applied healing to the target HP pool from `3` to `9`.
  - `POST /roll` for `feature-turn-undead` with `consumeResources: true` returned `200`, formula `0`, preserved save/condition metadata, and consumed one Channel Divinity use with remaining `0`.
  - A third consuming Channel Divinity roll returned `409` with `Insufficient channel divinity`.
  - `POST /rest` with `restType: "short"` returned `200`, recovered `{ channelDivinity: 1 }`, and persisted resources `{ channelDivinity: { current: 1, max: 2, recovery: "short" } }`.

### D&D SRD Cleric Level 5 Sear Undead Automation Slice

- Implementation:
  - Added `feature-sear-undead-damage` for Cleric level-5 Sear Undead as Wisdom-modifier d8 radiant damage.
  - Added Sear Undead metadata to `feature-turn-undead` so Turn Undead failed-save handling exposes the linked radiant damage formula.
  - Kept Channel Divinity consumption on Turn Undead itself; the separate Sear damage roll does not spend an additional resource.
  - Updated the browser D&D action list so level-5 Clerics see Turn Undead's Sear cue and a separate Sear Undead damage action.
- Automated validation:
  - `pnpm --filter @open-tabletop/system-sdk test -- --run` passed with `24 passed`.
  - `pnpm --filter @open-tabletop/system-sdk build` passed.
  - `pnpm --filter @open-tabletop/api test -- src/app.test.ts -t "D&D 5.5e SRD"` passed with `1 passed | 60 skipped` after rebuilding the SDK package used by the API.
  - `pnpm --filter @open-tabletop/ai-core build` passed.
  - `pnpm --filter @open-tabletop/api build` passed.
  - `pnpm --filter @open-tabletop/web build` passed.
  - `git diff --check` passed with only expected LF-to-CRLF warnings on touched files.
  - `pnpm check` passed.
  - `git diff --check` passed with only expected LF-to-CRLF warnings on touched files.
  - `pnpm check` passed.
  - `git diff --check` passed with only expected LF-to-CRLF warnings on touched files.
  - `pnpm check` passed.
  - System SDK tests verify level-5 Cleric advancement adds Sear Undead, exposes `feature-sear-undead-damage` as `5d8` for the advanced Cleric, attaches Sear metadata to Turn Undead, and leaves the Sear damage roll non-consuming.
  - API tests verify `/advance` persists level-5 Cleric Sear Undead, sheet quick rolls expose Turn Undead Sear metadata and `feature-sear-undead-damage`, consuming Turn Undead spends Channel Divinity, and Sear Undead damage can apply a target HP effect.
- Manual API evidence:
  - Built-API smoke used `apps/api/dist` with `MemoryStateStore` and real bearer tokens from `POST /auth/login` for GM and player sessions; no legacy `x-user-id` fallback was used.
  - The GM bearer created a player-owned `Manual Level Five Cleric` from the Cleric template, returning `200`, actor `act_monp9xgd2jteiw14`, and starting resources `{}`.
  - Four `POST /advance` calls with the player bearer token returned level `5`, features `["Spellcasting", "Divine Order", "Cleric Level 2", "Channel Divinity", "Divine Spark", "Turn Undead", "Cleric Level 3", "Cleric Level 4", "Cleric Level 5", "Sear Undead"]`, and resources `{ channelDivinity: { current: 2, max: 2, recovery: "short" } }`.
  - The level-5 sheet returned `feature-turn-undead` with Wisdom save DC `16`, Frightened/Incapacitated conditions, and `searUndead: { formula: "5d8", damageType: "Radiant" }`; it also returned `feature-sear-undead-damage` with formula `5d8`, trigger `Turn Undead failed save`, target `Undead`, and damage type `Radiant`.
  - `POST /roll` for `feature-turn-undead` with `consumeResources: true` returned `200`, formula `0`, preserved Sear metadata, consumed one Channel Divinity use with remaining `1`, and persisted resources `{ channelDivinity: { current: 1, max: 2, recovery: "short" } }`.
  - `POST /roll` for `feature-sear-undead-damage` with `applyEffect: true` and target `act_monp9xgs28wiozhd` returned `200`, formula `5d8`, preserved radiant damage metadata, applied `18` damage to the target HP pool from `10` to `0`, and did not spend another Channel Divinity use.

### D&D SRD Wizard Arcane Recovery Automation Slice

- Implementation:
  - Added Wizard Arcane Recovery to the D&D SRD Wizard template and class-feature progression.
  - Added the `arcaneRecovery` resource as one use that recovers on Long Rest.
  - Extended the D&D SRD rest path so Short Rest can accept an `arcaneRecovery` spell-slot selection, validate the half-Wizard-level rounded-up recovery budget, reject 6th-level-or-higher slots, recover selected expended spell slots, and spend the Arcane Recovery resource.
  - Updated the browser SDK panel to show an Arcane Recovery rest control when a Wizard has an available Arcane Recovery use and recoverable expended spell slots.
- Automated validation:
  - `pnpm --filter @open-tabletop/system-sdk test -- --run` passed with `24 passed`.
  - `pnpm --filter @open-tabletop/system-sdk build` passed.
  - `pnpm --filter @open-tabletop/api test -- src/app.test.ts -t "D&D 5.5e SRD"` passed with `1 passed | 60 skipped` after rebuilding the SDK package used by the API.
  - `pnpm --filter @open-tabletop/api build` passed.
  - `pnpm --filter @open-tabletop/web build` passed.
  - System SDK tests verify the Wizard template exposes Arcane Recovery, Short Rest with `arcaneRecovery: { level1: 1 }` recovers one expended level-1 slot, spends `arcaneRecovery`, rejects reuse before Long Rest, and Long Rest restores the resource and spell slots.
  - API tests verify a Wizard character exposes Arcane Recovery resources, Short Rest Arcane Recovery persists recovered spell slots and spent resource state, depleted Arcane Recovery returns `409`, and Long Rest restores both the resource and spell slots.
- Manual API evidence:
  - Built-API smoke used `apps/api/dist` with `MemoryStateStore` and real bearer tokens from `POST /auth/login` for GM and player sessions; no legacy `x-user-id` fallback was used.
  - The GM bearer created a player-owned `Manual Arcane Recovery Wizard` from the Wizard template, returning `200`, actor `act_monpm0xc8e3p91e8`, features `["Spellcasting", "Arcane Recovery"]`, resources `{ arcaneRecovery: { current: 1, max: 1, recovery: "long" } }`, spell slots `{ level1: { current: 2, max: 2, recovery: "long" } }`, and Shield roll id `spell-itm_monpm0xd2e44vpu6-effect`.
  - Two player-bearer Shield casts with `consumeResources: true` returned `200`, formula `5+3`, and consumed level-1 spell slots from remaining `1` to remaining `0`.
  - `POST /rest` with the player bearer, `restType: "short"`, and `arcaneRecovery: { level1: 1 }` returned `200`, recovered `{ spellSlots: { level1: 1 }, arcaneRecovery: { totalLevels: 1, limit: 1 }, resourcesSpent: { arcaneRecovery: 1 } }`, persisted resources `{ arcaneRecovery: { current: 0, max: 1, recovery: "long" } }`, and restored level-1 slots to `{ current: 1, max: 2, recovery: "long" }`.
  - A second Arcane Recovery Short Rest returned `409` with `Arcane Recovery is unavailable until a Long Rest`.
  - `POST /rest` with `restType: "long"` returned `200`, recovered `{ resources: { arcaneRecovery: 1 }, spellSlots: { level1: 1 } }`, restored resources `{ arcaneRecovery: { current: 1, max: 1, recovery: "long" } }`, and restored level-1 slots to `{ current: 2, max: 2, recovery: "long" }`.

### D&D SRD Rogue Sneak Attack and Cunning Strike Automation Slice

- Implementation:
  - Added a first-class D&D SRD Rogue template with Criminal background, Dexterity/Intelligence saving throw proficiencies, skill expertise, Thieves' Tools, Dagger, and Shortbow.
  - Added Rogue class feature progression through level 5: Expertise, Sneak Attack, Thieves' Cant, Weapon Mastery, Cunning Action, Steady Aim, Cunning Strike, and Uncanny Dodge.
  - Added `feature-sneak-attack-damage` as scaling Rogue Sneak Attack d6 damage with once-per-turn eligibility metadata and target-effect support through the existing damage application path.
  - Added `feature-cunning-strike` plus Cunning Strike metadata for Poison, Trip, and Withdraw rider options, Rogue save DC, Sneak Attack dice count, and reduced Sneak Attack formula.
  - Updated the browser D&D action list so Rogue sheets expose Sneak Attack and Cunning Strike actions.
- Automated validation:
  - `pnpm --filter @open-tabletop/system-sdk test -- --run` passed with `24 passed`.
  - `pnpm --filter @open-tabletop/system-sdk build` passed.
  - `pnpm --filter @open-tabletop/api test -- src/app.test.ts -t "D&D 5.5e SRD"` passed with `1 passed | 60 skipped` after rebuilding the SDK package used by the API.
  - `pnpm --filter @open-tabletop/api build` passed.
  - `pnpm --filter @open-tabletop/web build` passed.
  - System SDK tests verify Rogue template data, Sneak Attack quick rolls and formulas, level-5 Cunning Strike progression, Cunning Strike metadata, and no-resource action usage.
  - API tests verify the Rogue template appears in D&D SRD character templates, level-1 Rogue sheet quick rolls expose saves/skills/tools/Sneak Attack, level-5 advancement exposes Cunning Strike metadata, Sneak Attack can apply target HP damage, and Cunning Strike rolls expose rider metadata.
- Manual API evidence:
  - Built-API smoke used `apps/api/dist` with `MemoryStateStore` and real bearer tokens from `POST /auth/login` for GM and player sessions; no legacy `x-user-id` fallback was used.
  - The GM bearer created a player-owned `Manual Sneak Attack Rogue` from the Rogue template, returning `200`, actor `act_monq2m0w4z6vcua7`.
  - Four player-bearer `POST /advance` calls advanced the Rogue to level `5` with features `["Expertise", "Sneak Attack", "Thieves' Cant", "Weapon Mastery", "Rogue Level 2", "Cunning Action", "Rogue Level 3", "Rogue Subclass", "Steady Aim", "Rogue Level 4", "Ability Score Improvement", "Rogue Level 5", "Cunning Strike", "Uncanny Dodge"]`.
  - The level-5 sheet exposed `feature-sneak-attack-damage` with formula `3d6`, once-per-turn eligibility metadata, Cunning Strike metadata, save DC `16`, options `Poison`, `Trip`, and `Withdraw`, and reduced Sneak Attack formula `2d6`.
  - The level-5 sheet exposed `feature-cunning-strike` with formula `0`, save DC `16`, Sneak Attack dice `3`, the same rider options, and reduced Sneak Attack formula `2d6`.
  - A GM-bearer Sneak Attack roll with `applyEffect: true` against `Manual Sneak Attack Target` returned `200`, formula `3d6`, applied `9` HP damage from `10` to `1`, and persisted target HP `{ current: 1, max: 12 }`.
  - A player-bearer Cunning Strike roll returned `200`, formula `0`, and preserved the Cunning Strike metadata on the quick roll response.

### D&D SRD Barbarian Rage and Reckless Attack Automation Slice

- Implementation:
  - Added a first-class D&D SRD Barbarian template with Soldier background, Strength/Constitution saving throw proficiencies, d12 hit dice, a Spear, and a `rage` resource.
  - Added Barbarian class feature progression through level 5: Rage, Unarmored Defense, Weapon Mastery, Danger Sense, Reckless Attack, Barbarian Subclass, Primal Knowledge, Ability Score Improvement, Extra Attack, and Fast Movement.
  - Added `feature-rage` as a stateful resource action with Rage resistance, duration, extension, concentration, spellcasting, Strength-advantage, and damage-bonus metadata.
  - Added `feature-rage-damage-bonus` as fixed Rage bonus damage with target-effect support through the existing damage application path.
  - Added `feature-reckless-attack` metadata and Danger Sense metadata on Dexterity saving throws.
  - Updated Barbarian rest behavior so Short Rests recover one expended Rage use and Long Rests restore all Rage uses to the SRD level-based maximum.
  - Updated the browser D&D action list so Barbarian sheets expose Rage, Rage Damage, and Reckless Attack actions.
- Automated validation:
  - `pnpm --filter @open-tabletop/system-sdk test -- --run` passed with `24 passed`.
  - `pnpm --filter @open-tabletop/system-sdk build` passed.
  - `pnpm --filter @open-tabletop/api test -- src/app.test.ts -t "D&D 5.5e SRD"` passed with `1 passed | 60 skipped` after rebuilding the SDK package used by the API.
  - `pnpm --filter @open-tabletop/api build` passed.
  - `pnpm --filter @open-tabletop/web build` passed.
  - `git diff --check` passed with only expected LF-to-CRLF warnings on touched files.
  - `pnpm check` passed.
  - System SDK tests verify Barbarian template data, Rage quick rolls and formulas, level-2 Danger Sense/Reckless Attack progression, level-5 Extra Attack/Fast Movement progression, Rage resource consumption, depleted Rage protection, Short Rest one-use Rage recovery, and Long Rest all-use Rage recovery.
  - API tests verify the Barbarian template appears in D&D SRD character templates, level-1 and level-5 Barbarian sheet quick rolls expose Rage/Reckless/Danger Sense metadata, Rage consumes and blocks at depletion, Short/Long Rest recover Rage correctly, Rage Damage can apply target HP damage, and Reckless Attack returns its advantage/drawback metadata.
- Manual API evidence:
  - Built-API smoke used `apps/api/dist` with `MemoryStateStore` and real bearer tokens from `POST /auth/login` for GM and player sessions; no legacy `x-user-id` fallback was used.
  - The GM bearer created a player-owned `Manual Rage Barbarian` from the Barbarian template, returning `200`, actor `act_monqk9yu9qi7ascl`.
  - Four player-bearer `POST /advance` calls advanced the Barbarian to level `5` with features `["Rage", "Unarmored Defense", "Weapon Mastery", "Barbarian Level 2", "Danger Sense", "Reckless Attack", "Barbarian Level 3", "Barbarian Subclass", "Primal Knowledge", "Barbarian Level 4", "Ability Score Improvement", "Barbarian Level 5", "Extra Attack", "Fast Movement"]`.
  - The level-5 actor had resources `{ rage: { current: 2, max: 3, recovery: "short" } }` and combat metadata `{ attacksPerAction: 2, fastMovement: { bonusFt: 10, armorRestriction: "not wearing Heavy armor" } }`.
  - The level-5 sheet exposed `save-dexterity` with formula `1d20+1` and Danger Sense metadata, `feature-rage` with damage bonus `2`, resistance/duration/extension/restriction metadata, `feature-rage-damage-bonus` with formula `2`, and `feature-reckless-attack` with Strength-attack advantage and incoming-attack drawback metadata.
  - Two player-bearer Rage rolls with `consumeResources: true` returned `200`, formula `0`, and consumed Rage from remaining `1` to remaining `0`; a third Rage roll returned `409` with `Insufficient rage`.
  - A player-bearer Short Rest returned `200`, recovered `{ resources: { rage: 1 }, spellSlots: {} }`, and persisted `{ rage: { current: 1, max: 3, recovery: "short" } }`.
  - A player-bearer Long Rest returned `200`, recovered `{ resources: { rage: 2 }, spellSlots: {} }`, and restored `{ rage: { current: 3, max: 3, recovery: "short" } }`.
  - A GM-bearer Rage Damage roll with `applyEffect: true` against `Manual Rage Target` returned `200`, formula `2`, applied `2` HP damage from `10` to `8`, and persisted target HP `{ current: 8, max: 12 }`.
  - A player-bearer Reckless Attack roll returned `200`, formula `0`, and preserved the Strength-attack advantage plus incoming-attack drawback metadata on the quick roll response.

### D&D SRD Bard Bardic Inspiration and Font of Inspiration Automation Slice

- Implementation:
  - Added a first-class D&D SRD Bard template with Sage background, Dexterity/Charisma saving throw proficiencies, d8 hit dice, a Dagger, Healing Word, level-1 spell slots, and a Charisma-based `bardicInspiration` resource.
  - Added Bard class feature progression through level 5: Bardic Inspiration, Spellcasting, Expertise, Jack of All Trades, Bard Subclass, Ability Score Improvement, and Font of Inspiration.
  - Added `feature-bardic-inspiration` as a stateful resource action with scaling die metadata (`d6` to `d8` at level 5), 1-hour duration metadata, target/trigger metadata, and level-5 short-rest recovery through Font of Inspiration.
  - Added `feature-font-of-inspiration` as a spell-slot-consuming action that restores one expended Bardic Inspiration use and blocks when Bardic Inspiration is already full.
  - Added Jack of All Trades metadata and half-proficiency math for unproficient SRD skill checks.
  - Updated SRD spellcasting formula resolution so Healing Word and Cure Wounds use the actor's SRD class spellcasting ability; Bard Healing Word now uses Charisma while Cleric Healing Word still uses Wisdom.
  - Updated the browser D&D action list so Bard sheets expose Bardic Inspiration and Font of Inspiration actions.
- Automated validation:
  - `pnpm --filter @open-tabletop/system-sdk test -- --run` passed with `24 passed`.
  - `pnpm --filter @open-tabletop/system-sdk build` passed.
  - `pnpm --filter @open-tabletop/api test -- src/app.test.ts -t "D&D 5.5e SRD"` passed with `1 passed | 60 skipped` after rebuilding the SDK package used by the API.
  - `pnpm --filter @open-tabletop/api build` passed.
  - `pnpm --filter @open-tabletop/web build` passed.
  - System SDK tests verify Bard template data, Bardic Inspiration quick rolls/formulas/metadata, Charisma spellcasting formulas, level-2 Jack of All Trades, level-5 Font of Inspiration progression, Bardic Inspiration resource consumption and depletion protection, level-5 short-rest recovery, Font of Inspiration spell-slot consumption, and full-resource protection.
  - API tests verify the Bard template appears in D&D SRD character templates, level-1 and level-5 Bard sheets expose Bardic Inspiration/Font/Jack metadata, Bardic Inspiration consumes and blocks at depletion, Font of Inspiration spends a spell slot to restore one Bardic Inspiration use, and Short Rest restores level-5 Bardic Inspiration to full.
- Manual API evidence:
  - Built-API smoke used `apps/api/dist` with `MemoryStateStore` and real bearer tokens from `POST /auth/login` for GM and player sessions; no legacy `x-user-id` fallback was used.
  - The GM bearer created a player-owned `Manual Bardic Inspiration Bard` from the Bard template, returning `200`, actor `act_monr7pvekc3lxoe7`.
  - The created actor had resources `{ bardicInspiration: { current: 3, max: 3, recovery: "long" } }`, level-1 spell slots `{ level1: { current: 2, max: 2, recovery: "long" } }`, spell `Healing Word`, inventory `Dagger`, and `feature-bardic-inspiration` formula `1d6` with die `d6`, 1-hour duration, max uses `3`, and long-rest recovery metadata.
  - Four player-bearer `POST /advance` calls advanced the Bard to level `5` with features `["Bardic Inspiration", "Spellcasting", "Bard Level 2", "Expertise", "Jack of All Trades", "Bard Level 3", "Bard Subclass", "Bard Level 4", "Ability Score Improvement", "Bard Level 5", "Font of Inspiration"]`.
  - The level-5 actor had resources `{ bardicInspiration: { current: 3, max: 5, recovery: "short" } }` and spell slots `{ level1: { current: 2, max: 4, recovery: "long" }, level2: { current: 2, max: 3, recovery: "long" }, level3: { current: 2, max: 2, recovery: "long" } }`.
  - The level-5 sheet exposed `feature-bardic-inspiration` with formula `1d8`, die `d8`, max uses `5`, and short-rest recovery metadata; `feature-font-of-inspiration` with formula `0`; and `skill-athletics` as `1d20+0` with Jack of All Trades bonus metadata.
  - Three player-bearer Bardic Inspiration rolls with `consumeResources: true` returned `200`, formula `1d8`, and consumed remaining Bardic Inspiration from `2` to `1` to `0`; a fourth returned `409` with `Insufficient bardic inspiration`.
  - A player-bearer Short Rest returned `200`, recovered `{ resources: { bardicInspiration: 5 }, spellSlots: {} }`, and persisted `{ bardicInspiration: { current: 5, max: 5, recovery: "short" } }`.
  - A post-rest Bardic Inspiration roll consumed one use to remaining `4`, then a player-bearer Font of Inspiration roll returned `200`, formula `0`, consumed one level-1 spell slot to remaining `1`, and restored Bardic Inspiration to `{ current: 5, max: 5, recovery: "short" }`.
  - A second Font of Inspiration roll while Bardic Inspiration was full returned `409` with `Bardic Inspiration is already full`.
  - A player-bearer Long Rest returned `200`, restored spell slots to `{ level1: { current: 4, max: 4, recovery: "long" }, level2: { current: 3, max: 3, recovery: "long" }, level3: { current: 2, max: 2, recovery: "long" } }`, and preserved full Bardic Inspiration.

### D&D SRD Paladin Lay On Hands and Divine Smite Automation Slice

- Implementation:
  - Added a first-class D&D SRD Paladin template with Soldier background, Wisdom/Charisma saving throw proficiencies, Athletics/Persuasion skill proficiencies, d10 hit dice, Longsword, Cure Wounds, level-1 spell slots, and a `layOnHands` resource pool.
  - Added Paladin class feature progression through level 5: Lay On Hands, Spellcasting, Weapon Mastery, Fighting Style, Paladin's Smite, Channel Divinity, Paladin Subclass, Ability Score Improvement, Extra Attack, and Faithful Steed.
  - Added `feature-lay-on-hands-healing` as a variable-amount healing action backed by the Lay On Hands point pool and target-effect application.
  - Added `feature-divine-smite-damage` as Radiant damage that supports `spellSlotLevel` upcasting, level-2-or-higher spell-slot consumption, target damage application, and Paladin's Smite once-per-Long-Rest free use through `useFreeResource`.
  - Added `feature-faithful-steed` as a stateful level-5 free Find Steed use backed by a Long Rest resource.
  - Added Paladin half-caster spell-slot progression, Extra Attack weapon metadata, Charisma spellcasting, and Long Rest restoration for Lay On Hands, Paladin's Smite, Faithful Steed, and spell slots.
  - Updated the browser D&D action list so Paladin sheets expose Lay On Hands, Divine Smite, Faithful Steed, and Extra Attack weapon cues.
  - Extended the API and AI actor-action plumbing with `resourceAmount` and `useFreeResource` so Codex/tool callers can spend variable Lay On Hands points or choose Paladin's Smite free use instead of a spell slot.
- Automated validation:
  - `pnpm --filter @open-tabletop/system-sdk test -- --run` passed with `24 passed`.
  - `pnpm --filter @open-tabletop/system-sdk build` passed.
  - `pnpm --filter @open-tabletop/ai-core build` passed.
  - `pnpm --filter @open-tabletop/api build` passed.
  - `pnpm --filter @open-tabletop/web build` passed.
  - `pnpm --filter @open-tabletop/api test -- src/app.test.ts -t "D&D 5.5e SRD"` passed with `1 passed | 60 skipped`.
  - System SDK tests verify Paladin template data, Divine Smite compendium data, Paladin saves/skills/spells/items, variable Lay On Hands formulas, level-5 Paladin progression, half-caster spell slots, Divine Smite upcasting/free-use behavior, Faithful Steed use, Extra Attack metadata, resource depletion protection, and Long Rest restoration.
  - API tests verify the Paladin template appears in D&D SRD character templates, level-1 and level-5 Paladin sheet quick rolls expose Lay On Hands/Divine Smite/Faithful Steed/Extra Attack metadata, Lay On Hands can spend a chosen point amount and heal a target, Divine Smite consumes spell slots or the free Paladin's Smite resource, Faithful Steed consumes its resource, depletion returns `409`, and Long Rest restores Paladin resources and spell slots.
- Manual API evidence:
  - Built-API smoke used `apps/api/dist` with `MemoryStateStore` and real bearer tokens from `POST /auth/login` for GM and player sessions; no legacy `x-user-id` fallback was used.
  - The GM bearer created a player-owned `Manual Paladin Automation` from the Paladin template, returning `200`, actor `act_monrvg6r8gdab9tq`, features `["Lay On Hands", "Spellcasting", "Weapon Mastery"]`, resources `{ layOnHands: { current: 5, max: 5, recovery: "long" } }`, and spell slots `{ level1: { current: 2, max: 2, recovery: "long" } }`.
  - Four player-bearer `POST /advance` calls advanced the Paladin to level `5` with features `["Lay On Hands", "Spellcasting", "Weapon Mastery", "Paladin Level 2", "Fighting Style", "Paladin's Smite", "Paladin Level 3", "Channel Divinity", "Paladin Subclass", "Paladin Level 4", "Ability Score Improvement", "Paladin Level 5", "Extra Attack", "Faithful Steed"]`.
  - The level-5 actor had resources `{ layOnHands: { current: 5, max: 25, recovery: "long" }, paladinsSmite: { current: 1, max: 1, recovery: "long" }, faithfulSteed: { current: 1, max: 1, recovery: "long" } }`, spell slots `{ level1: { current: 2, max: 4, recovery: "long" }, level2: { current: 2, max: 2, recovery: "long" } }`, and combat metadata `{ attacksPerAction: 2 }`.
  - The level-5 sheet exposed `feature-lay-on-hands-healing` with formula `5`, pool `25`, `chooseAmount: true`; `feature-divine-smite-damage` with formula `2d8`, Radiant damage, upcast metadata, Fiend/Undead bonus metadata, and `freeCastResource: "paladinsSmite"`; `feature-faithful-steed` with formula `0`; and Longsword damage with Extra Attack metadata.
  - A player-bearer Lay On Hands roll with `resourceAmount: 4`, `consumeResources: true`, `applyEffect: true`, and target `act_monrvg75osr32e7m` returned `200`, formula `4`, consumed `{ key: "layOnHands", amount: 4, remaining: 1 }`, and healed target HP from `3` to `7`.
  - A follow-up Lay On Hands roll for `resourceAmount: 2` returned `409` with `Insufficient lay on hands`.
  - A player-bearer Divine Smite roll with `spellSlotLevel: 2`, `consumeResources: true`, `applyEffect: true`, and target `act_monrvg77r3npgech` returned `200`, formula `3d8`, consumed a level-2 spell slot to remaining `1`, applied `12` Radiant damage from `18` HP to `6`, and preserved slot-level metadata.
  - A player-bearer Divine Smite roll with `useFreeResource: true` returned `200`, formula `2d8`, and consumed `{ key: "paladinsSmite", amount: 1, remaining: 0 }` instead of a spell slot.
  - A player-bearer Faithful Steed roll returned `200`, formula `0`, and consumed `{ key: "faithfulSteed", amount: 1, remaining: 0 }`.
  - A player-bearer Long Rest returned `200`, restored resources to `{ layOnHands: { current: 25, max: 25, recovery: "long" }, paladinsSmite: { current: 1, max: 1, recovery: "long" }, faithfulSteed: { current: 1, max: 1, recovery: "long" } }`, and restored spell slots to `{ level1: { current: 4, max: 4, recovery: "long" }, level2: { current: 2, max: 2, recovery: "long" } }`.
  - Source rule reference for this slice: official SRD 5.2.1 PDF, https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf.

### D&D SRD Druid Wild Shape and Wild Resurgence Automation Slice

- Implementation:
  - Added a first-class D&D SRD Druid template with Sage background, Intelligence/Wisdom saving throw proficiencies, Nature/Survival skill proficiencies, d8 hit dice, Cure Wounds, Quarterstaff, level-1 spell slots, and Wisdom spellcasting.
  - Added Druid class feature progression through level 5: Spellcasting, Druidic, Primal Order, Wild Shape, Wild Companion, Druid Subclass, Ability Score Improvement, and Wild Resurgence.
  - Added `feature-wild-shape` as a stateful Wild Shape resource action with Bonus Action, Beast form, known form, Challenge Rating, duration, temporary HP, and short/long rest recovery metadata.
  - Added `feature-wild-companion` as a Find Familiar action that can spend either a spell slot or a Wild Shape use through `useFreeResource`.
  - Added `feature-wild-resurgence-wild-shape` to spend a spell slot and restore one Wild Shape use only when no Wild Shape uses remain.
  - Added `feature-wild-resurgence-spell-slot` to spend one Wild Shape use and a once-per-Long-Rest Wild Resurgence resource to restore one level-1 spell slot.
  - Added Druid full-caster spell-slot progression, Wild Shape one-use Short Rest recovery, Wild Shape/Wild Resurgence Long Rest restoration, and browser action-list entries for all Druid feature actions.
- Automated validation:
  - `pnpm --filter @open-tabletop/system-sdk test -- --run` passed with `24 passed`.
  - `pnpm --filter @open-tabletop/system-sdk build` passed.
  - `pnpm --filter @open-tabletop/api test -- src/app.test.ts -t "D&D 5.5e SRD"` passed with `1 passed | 60 skipped` after rebuilding the SDK package used by the API.
  - `pnpm --filter @open-tabletop/ai-core build` passed.
  - `pnpm --filter @open-tabletop/api build` passed.
  - `pnpm --filter @open-tabletop/web build` passed.
  - `git diff --check` passed with only expected LF-to-CRLF warnings on touched files.
  - `pnpm check` passed.
  - System SDK tests verify Druid template data, Druid saves/skills/spells/items, level-5 Druid progression, full-caster spell slots, Wild Shape/Wild Companion/Wild Resurgence quick rolls and metadata, spell-slot/Wild Shape consumption, depletion protection, Wild Resurgence restoration paths, Short Rest one-use Wild Shape recovery, and Long Rest restoration.
  - API tests verify the Druid template appears in D&D SRD character templates, level-1 and level-5 Druid sheet quick rolls expose Wild Shape/Wild Companion/Wild Resurgence metadata, Wild Shape and Wild Companion consume the correct resources, depleted Wild Shape returns `409`, Wild Resurgence restores Wild Shape or a level-1 spell slot, and Short/Long Rest recover resources and spell slots correctly.
- Manual API evidence:
  - Built-API smoke used `apps/api/dist` with `MemoryStateStore` and real bearer tokens from `POST /auth/login` for GM and player sessions; no legacy `x-user-id` fallback was used.
  - The GM bearer created a player-owned `Manual Druid Automation` from the Druid template, returning `200`, actor `act_monshi3d1q42fnsp`, features `["Spellcasting", "Druidic", "Primal Order"]`, resources `{}`, spell slots `{ level1: { current: 2, max: 2, recovery: "long" } }`, inventory `Quarterstaff`, and spell `Cure Wounds`.
  - Four player-bearer `POST /advance` calls advanced the Druid to level `5` with features `["Spellcasting", "Druidic", "Primal Order", "Druid Level 2", "Wild Shape", "Wild Companion", "Druid Level 3", "Druid Subclass", "Druid Level 4", "Ability Score Improvement", "Druid Level 5", "Wild Resurgence"]`.
  - The level-5 actor had resources `{ wildShape: { current: 2, max: 2, recovery: "short" }, wildResurgence: { current: 1, max: 1, recovery: "long" } }` and spell slots `{ level1: { current: 2, max: 4, recovery: "long" }, level2: { current: 2, max: 3, recovery: "long" }, level3: { current: 2, max: 2, recovery: "long" } }`.
  - The level-5 sheet exposed `feature-wild-shape` with formula `0`, max uses `2`, one-use Short Rest/all-use Long Rest recovery metadata, duration `2` hours, temporary HP `5`, known forms `6`, and max CR `1/2`; `feature-wild-companion` with Find Familiar/Fey/no-material metadata; and both Wild Resurgence feature rolls.
  - A player-bearer Wild Shape roll with `consumeResources: true` returned `200`, formula `0`, and consumed `{ key: "wildShape", amount: 1, remaining: 1 }`.
  - A player-bearer Wild Companion roll with `consumeResources: true` returned `200`, consumed one level-1 spell slot to remaining `1`, and preserved slot-level metadata.
  - A player-bearer Wild Companion roll with `useFreeResource: true` and `consumeResources: true` returned `200` and consumed one Wild Shape use to remaining `0`.
  - A follow-up Wild Shape roll returned `409` with `Insufficient wild shape`.
  - A player-bearer `feature-wild-resurgence-wild-shape` roll returned `200`, consumed one level-1 spell slot to remaining `0`, restored Wild Shape to `{ current: 1, max: 2, recovery: "short" }`, and left Wild Resurgence unused.
  - A player-bearer `feature-wild-resurgence-spell-slot` roll returned `200`, consumed Wild Shape and Wild Resurgence to remaining `0`, and restored level-1 spell slots to `{ current: 1, max: 4, recovery: "long" }`.
  - A player-bearer Short Rest returned `200`, recovered `{ resources: { wildShape: 1 }, spellSlots: {} }`, and persisted resources `{ wildShape: { current: 1, max: 2, recovery: "short" }, wildResurgence: { current: 0, max: 1, recovery: "long" } }`.
  - A player-bearer Long Rest returned `200`, recovered `{ resources: { wildShape: 1, wildResurgence: 1 }, spellSlots: { level1: 3, level2: 1 } }`, restored resources to `{ wildShape: { current: 2, max: 2, recovery: "short" }, wildResurgence: { current: 1, max: 1, recovery: "long" } }`, and restored spell slots to `{ level1: { current: 4, max: 4, recovery: "long" }, level2: { current: 3, max: 3, recovery: "long" }, level3: { current: 2, max: 2, recovery: "long" } }`.
  - Source rule reference for this slice: official SRD 5.2.1 PDF, https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf.

### 2026-05-01 - D&D SRD Ranger automation slice

- Implementation:
  - Added a first-class D&D 5.5e SRD Ranger character template with Dexterity/Wisdom-oriented attributes, D10 hit die, Strength/Dexterity saves, Nature/Perception/Survival skills, Favored Enemy resources, half-caster spell slots, Hunter's Mark/Cure Wounds spells, Longbow/Scimitar/Shortsword/Studded Leather Armor starter equipment, and SRD 5.2.1 attribution metadata.
  - Added SRD compendium entries for Hunter's Mark, Longbow, Scimitar, Shortsword, and Studded Leather Armor.
  - Added Ranger class feature progression through level 5: Spellcasting, Favored Enemy, Weapon Mastery, Deft Explorer, Fighting Style, Ranger Subclass, Ability Score Improvement, and Extra Attack.
  - Added `feature-hunters-mark-damage` as a stateful Hunter's Mark damage action with Force damage, concentration, tracking advantage, Favored Enemy free-use metadata, spell-slot casting, upcast-duration metadata, target damage application, and level-20 Foe Slayer die scaling.
  - Added Ranger half-caster spell-slot progression, Favored Enemy Long Rest recovery, Extra Attack weapon metadata, Wisdom spellcasting support, API roll/resource consumption, and browser action-list entries.
- Automated validation:
  - `pnpm --filter @open-tabletop/system-sdk test -- --run` passed with `24 passed`.
  - `pnpm --filter @open-tabletop/system-sdk build` passed.
  - `pnpm --filter @open-tabletop/api test -- src/app.test.ts -t "D&D 5.5e SRD"` passed with `1 passed | 60 skipped` after rebuilding the SDK package used by the API.
  - `pnpm --filter @open-tabletop/api build` passed before manual API smoke.
  - `pnpm --filter @open-tabletop/ai-core build` passed.
  - `pnpm --filter @open-tabletop/web build` passed.
  - `git diff --check` passed with only the expected LF-to-CRLF working-copy warnings.
  - `pnpm check` passed across lint, typecheck, tests, and build.
  - System SDK tests verify Ranger template data, saves/skills/spells/items, compendium entries, level-5 progression, half-caster spell slots, Favored Enemy max progression, Hunter's Mark quick-roll metadata, spell-slot/free-resource consumption, depletion protection, Extra Attack metadata, and Long Rest restoration.
  - API tests verify the Ranger template appears in D&D SRD character templates, level-1 and level-5 Ranger sheets expose Hunter's Mark and Extra Attack metadata, Hunter's Mark consumes Favored Enemy or spell slots, target HP damage application works, depleted Favored Enemy returns `409`, and Long Rest restores Favored Enemy and spell slots.
- Manual API evidence:
  - Built-API smoke used `apps/api/dist` with `MemoryStateStore` and real bearer tokens from `POST /auth/login` for GM and player sessions; no legacy `x-user-id` fallback was used.
  - The GM bearer created a player-owned `Manual Ranger Automation` from the Ranger template, returning `200`, actor `act_monsy89ko4phdh24`, features `["Spellcasting", "Favored Enemy", "Weapon Mastery"]`, resources `{ favoredEnemy: { current: 2, max: 2, recovery: "long" } }`, spell slots `{ level1: { current: 2, max: 2, recovery: "long" } }`, inventory `Longbow`, `Scimitar`, `Shortsword`, `Studded Leather Armor`, and spells `Hunter's Mark`, `Cure Wounds`.
  - Four player-bearer `POST /advance` calls advanced the Ranger to level `5` with features `["Spellcasting", "Favored Enemy", "Weapon Mastery", "Ranger Level 2", "Deft Explorer", "Fighting Style", "Ranger Level 3", "Ranger Subclass", "Ranger Level 4", "Ability Score Improvement", "Ranger Level 5", "Extra Attack"]`.
  - The level-5 actor had resources `{ favoredEnemy: { current: 2, max: 3, recovery: "long" } }`, spell slots `{ level1: { current: 2, max: 4, recovery: "long" }, level2: { current: 2, max: 2, recovery: "long" } }`, and combat metadata `{ attacksPerAction: 2 }`.
  - The level-5 sheet exposed `feature-hunters-mark-damage` with formula `1d6`, Force damage, Favored Enemy free-resource metadata, concentration, Perception/Survival tracking advantage, and upcast-duration metadata; Longbow damage exposed Extra Attack metadata.
  - A player-bearer Hunter's Mark roll with `useFreeResource: true`, `consumeResources: true`, `applyEffect: true`, and target `act_monsy8a0eh4o427v` returned `200`, formula `1d6`, consumed `{ key: "favoredEnemy", amount: 1, remaining: 1 }`, and applied HP damage from `10` to `9`.
  - A player-bearer Hunter's Mark roll with `spellSlotLevel: 2` and `consumeResources: true` returned `200`, formula `1d6`, and consumed a level-2 spell slot to remaining `1`.
  - A follow-up Hunter's Mark free-resource roll after depleting Favored Enemy returned `409` with `Insufficient favored enemy`.
  - A player-bearer Long Rest returned `200`, recovered `{ resources: { favoredEnemy: 3 }, spellSlots: { level1: 4, level2: 2 } }`, restored resources to `{ favoredEnemy: { current: 3, max: 3, recovery: "long" } }`, and restored spell slots to `{ level1: { current: 4, max: 4, recovery: "long" }, level2: { current: 2, max: 2, recovery: "long" } }`.
  - Source rule reference for this slice: official SRD 5.2.1 PDF, https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf.

## Known Post-MVP Gaps

These are not blockers for the current PRD MVP acceptance, but remain if the project continues toward a broader production Roll20-class platform.

- Auth now has bearer sessions, password registration/login, campaign invites, OIDC SSO, password reset/email delivery, a first-class password reset screen, local TOTP MFA with recovery codes, account administration, production session administration, server-admin audit export, SCIM v2 user/group provisioning, SCIM group-to-campaign role mapping, browser organization access administration, and a disabled-by-default legacy `x-user-id` fallback. Further enterprise identity depth is IdP-specific certification.
- Uploaded maps now support local and S3/MinIO-backed storage, archive export/import through the active provider, per-campaign quotas, lifecycle state, signed CDN delivery URLs, deployable CDN edge configuration, storage stats, migration tooling, deployed recurring cleanup scheduling for deleted or expired object bytes, built-in upload security scanning, and external AV/trust scanner webhooks before storage writes. Higher-assurance hosting may still need provider-specific compliance artifacts and operational certifications outside the app.
- Fog, wall, light authoring, hidden-token visibility, player vision filtering, polygon line-of-sight, terrain walls, clipped colored lighting, browser vision masks, polygon fog reveal, hide/erase fog, smoothed freehand reveal/hide brushes, fog region deletion, fog undo/history, and multi-scene fog presets now have verified controls and permission filtering. No fog-specific item remains in the current acceptance checklist.
- Plugin runtime now supports local and allowlisted remote-registry manifest-packaged third-party modules, permission review, package path containment, VM-sandboxed server chat commands, campaign-scoped JSON storage APIs, command-returned storage mutations, checksums, versioned installs, upgrade/rollback workflows, signed package trust policy, registry provenance metadata, server-admin marketplace review surfaces, optional approval-required review policy, storage/review audit logs, and browser/API acceptance evidence. Remaining plugin ecosystem work is external marketplace operations beyond the self-hosted review and registry workflow.
- D&D 5.5e SRD is now the primary rules focus with SRD 5.2.1 system registration; Fighter, Barbarian, Bard, Cleric, Paladin, Druid, Ranger, Wizard, and Rogue templates; SRD character origins; SRD-oriented compendium entries; bounded spell/weapon/armor coverage; computed Armor Class; class automation for Fighter, Barbarian, Bard, Cleric, Paladin, Druid, Ranger, Wizard, and Rogue early-level slices; spell-slot-consuming actions; target damage/healing application; saving throw, skill, and tool quick rolls; SRD equipment purchasing; guided level advancement; character import normalization; SRD monster stat blocks; monster actor creation; monster action quick rolls; CR/XP threat budgets; 2024 Basic Rules encounter XP thresholds; hit dice; spell slots; short/long rest recovery; API tests; and manual API acceptance evidence. Ranger coverage now includes Favored Enemy, Hunter's Mark, half-caster spell slots, Wisdom spellcasting, Extra Attack metadata, Favored Enemy Long Rest recovery, Longbow/Scimitar/Shortsword/Studded Leather entries, and bearer-token manual evidence. Remaining D&D rules ecosystem work is full SRD-scale spell/equipment/magic-item content coverage, Monk/Sorcerer/Warlock class templates and broader class/subclass feature automation beyond the currently covered early-level slices, more complete species trait automation, and full SRD-scale monster/action coverage beyond the current SRD threat catalog. Generic Fantasy, Stellar Frontiers, and Mystic Noir remain available as demo systems for later expansion, but they are no longer the primary gap-closing direction.
- AI flows now cover provider-configured threads, richer permission-filtered prompt context with visible actor action ids, permission-filtered tool advertisement, typed OpenAI Responses tool schemas, Codex loopback proposal-tool and actor-action execution, encounter/journal/scene/token/actor/memory/dice/compendium/action tools, actor-action resource consumption and target effect application, provider retry/failure handling, provider request timeouts, cross-role tool-advertisement permission regression, thread status history, failed-tool observability, invalid tool-input rejection before side effects, provider-backed memory extraction, usage and estimated-cost metrics, GM-only front-end operator telemetry, server-admin cross-campaign AI/Codex operations telemetry, approval/application, generic proposal underlying-permission checks, and deterministic recap memory. Remaining Codex integration work is broader production provider edge cases and future-tool hardening as new tool classes are added. Model-output quality evaluation is intentionally out of scope for the Codex integration goal.
