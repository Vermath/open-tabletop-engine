# Player preview security and recovery review — 2026-09-06

Scope: independent review of the player-preview route, snapshot projection, response contract, loader, dialog, and global workspace keyboard handlers. This is a feature-level review, not approval of the wider product-comparison goal.

## Findings and disposition

- **P1 — Workspace shortcuts mutated the hidden GM board.** The preview dialog allowed Delete, undo/redo, and copy/paste to reach `apps/web/src/App.tsx` global keyboard handlers. Fixed by guarding board, tool, and command-palette shortcuts while `playerPreview.open`; normal board shortcuts resume after exit. Regression tests execute the actual App handler callbacks.
- **P2 — Slow preview requests never completed visibly.** A five-second interval and every snapshot revision invalidated in-flight responses in `apps/web/src/player-preview.ts`. Fixed with one active request per context, coalesced revisions, and polling five seconds after settlement. Validated same-context data remains mounted during ordinary refresh; errors clear it. Campaign, scene, player, requester, session, and eligibility changes retain fail-closed invalidation.
- **P1 — Combat ID intersection retained target-only nested secrets.** A target player granted `combat.manage` could expose hidden combatants and other combat details to an otherwise eligible requester lacking that permission. The parent-owned API fix now emits only UI combat fields, intersects participant identities, and requires matching permitted turn identities. The web type matches that minimal response.
- **P2 — Vision polygons exposed an unreadable token's identity and geometry.** Reproduced with a scene-local delegate who held the required campaign capabilities but lacked access to a player-owned token behind fog. The preview omitted that token but retained its vision polygons. Fixed only in the new preview projection by filtering token-origin polygons to final permitted token IDs. Fog/light sources already belong to the readable scene; the other VisionSnapshot identity fields identify the requested scene and player. The regression failed before the fix and passed afterward, while asserting that permitted token vision, fog/light polygons, and the GM preview remain intact.

The earlier nonexistent `Combat.sceneId` filter was independently identified and corrected by the parent. Annotation visibility was not implemented; only the existing public annotation fixture was evaluated.

## Verification

- `pnpm --filter @open-tabletop/web test -- src/player-preview.test.tsx src/board-keyboard.test.ts src/scene-canvas-keyboard.test.ts`: **21 passed**.
- `pnpm --filter @open-tabletop/web typecheck`: **passed**.
- `pnpm --filter @open-tabletop/api test -- src/player-preview.test.ts`: **12 passed** (log: `output/competitive/player-preview-api.log`).
- `pnpm --filter @open-tabletop/api typecheck`: **passed**.
- Diff whitespace checks for the edited web files: **passed**.
- Slow-request coverage advances virtual time beyond five seconds while requests are pending, then verifies successful publication, one coalesced follow-up, retained content, and disposal without later requests.
- The separately authenticated player-versus-preview browser comparison subsequently passed; its latest selected-run status and screenshots are recorded in [competitive map and player-preview browser evidence](competitive-map-preview-browser-evidence-2026-09-06.md). The companion map drag defect was fixed and the subsequent six-case browser run passed with stable source and runtime-input fingerprints. This feature-level review does not replace the broader product audit.

