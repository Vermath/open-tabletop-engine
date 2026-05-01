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

## Known Post-MVP Gaps

These are not blockers for the current PRD MVP acceptance, but remain if the project continues toward a broader production Roll20-class platform.

- Auth now has bearer sessions, password registration/login, campaign invites, OIDC SSO, password reset/email delivery, a first-class password reset screen, local TOTP MFA with recovery codes, account administration, production session administration, server-admin audit export, SCIM v2 user/group provisioning, SCIM group-to-campaign role mapping, and a disabled-by-default legacy `x-user-id` fallback. Further enterprise identity depth is IdP-specific certification and an organization-admin UI.
- Uploaded maps now support local and S3/MinIO-backed storage, archive export/import through the active provider, per-campaign quotas, lifecycle state, signed CDN delivery URLs, storage stats, migration tooling, cleanup jobs for deleted or expired object bytes, and built-in upload security scanning before storage writes. Production storage work still needs CDN edge configuration, deployed recurring cleanup scheduling, and third-party AV/trust integrations for higher-assurance hosting.
- Fog, wall, light authoring, hidden-token visibility, player vision filtering, polygon line-of-sight, terrain walls, clipped colored lighting, browser vision masks, polygon fog reveal, hide/erase fog, and fog region deletion now have verified controls and permission filtering. Remaining fog work is production UX depth such as freehand stroke smoothing, undo/history, and multi-scene fog presets.
- Plugin runtime now supports local manifest-packaged third-party modules, permission review, package path containment, VM-sandboxed server chat commands, checksums, and browser/API acceptance evidence. Remaining plugin-platform work is distribution depth such as remote registries, signing/trust policy, upgrade/rollback workflows, richer storage APIs, and marketplace review surfaces.
- Generic Fantasy now has compendium-backed items, spells, conditions, actor inventory/spell sheet surfaces, condition-aware rolls, API tests, and browser/API acceptance evidence. Remaining rules ecosystem work is multiple full systems, complete SRD-style content, character builders, leveling, encounter math, importers, and deeper automation.
- AI flows now cover provider-configured threads, richer permission-filtered prompt context, typed OpenAI Responses tool schemas, Codex loopback proposal-tool execution, encounter/memory/dice/compendium tools, provider retry/failure handling, thread status history, tool-call observability, provider-backed memory extraction, usage and estimated-cost metrics, approval/application, and deterministic recap memory. Remaining Codex integration work is broader campaign-edit tool coverage, deeper permission-regression breadth, and richer front-end operator dashboards.
