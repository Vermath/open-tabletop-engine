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

## Known Post-MVP Gaps

These are not blockers for the current PRD MVP acceptance, but remain if the project continues toward a broader production Roll20-class platform.

- Auth now has bearer sessions, password registration/login, campaign invites, and OIDC SSO, but still lacks password reset/email delivery, account administration, and production session administration. The legacy `x-user-id` path remains for local test compatibility.
- Uploaded maps now support local and S3/MinIO-backed storage, including archive export/import through the active provider. Production storage work still needs lifecycle policies, migration tooling, and CDN/presigned delivery.
- Fog, wall, light authoring, hidden-token visibility, and basic player fog/vision filtering now have MVP controls and permission filtering, but advanced polygon line-of-sight, dynamic fog tools, and production-grade vision rendering remain basic.
- Plugin runtime is bounded to the sample command path; it is not a sandboxed third-party module loader.
- System runtime covers generic fantasy sheet summary and quick rolls, not a complete rules engine.
- AI flows now cover provider-configured threads, Codex loopback proposal-tool execution, OpenAI Responses adapter requests and function-call mapping, provider-backed memory extraction, approval/application, and deterministic recap memory. Hosted-model prompt quality and broader tool coverage remain basic.
