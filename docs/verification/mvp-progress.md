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

## Known Remaining Gaps

- Auth now has MVP bearer sessions for seeded users across REST, realtime, and asset blob access, but still lacks password login, OAuth, invites, account management, and production session administration. The legacy `x-user-id` path remains for local test compatibility.
- Browser role switching and ownership-scoped GM/player token movement now have MVP coverage; broader multi-user workflows still need final clean-checkout audit coverage.
- Uploaded maps now have a local binary storage path, but they are not yet backed by S3 or MinIO object storage.
- Fog, wall, light authoring, hidden-token visibility, and basic player fog/vision filtering now have MVP controls and permission filtering, but advanced polygon line-of-sight, dynamic fog tools, and production-grade vision rendering remain basic.
- Plugin runtime is bounded to the sample command path; it is not a sandboxed third-party module loader.
- System runtime covers generic fantasy sheet summary and quick rolls, not a complete rules engine.
- AI flows now cover provider-configured threads, Codex loopback proposal-tool execution, approval/application, and deterministic recap memory. Richer provider-backed memory extraction remains basic.
- Full MVP completion still requires a clean-checkout runbook and a final prompt-to-artifact audit covering every PRD requirement.
