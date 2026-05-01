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

## Known Remaining Gaps

- Auth is still a development `x-user-id` session header, not production authentication.
- Browser role switching and a true GM/player two-user tabletop session still need richer manual coverage.
- Uploaded maps now have a local binary storage path, but they are not yet backed by S3 or MinIO object storage.
- Fog, walls, and lights exist in scene state, but wall/light authoring tools are still basic.
- Plugin runtime is bounded to the sample command path; it is not a sandboxed third-party module loader.
- System runtime covers generic fantasy sheet summary and quick rolls, not a complete rules engine.
- AI flows still need approval queue UX, end-to-end proposal application coverage, and broader browser coverage beyond the provider thread path.
- Full MVP completion still requires a clean-checkout runbook and a final prompt-to-artifact audit covering every PRD requirement.
