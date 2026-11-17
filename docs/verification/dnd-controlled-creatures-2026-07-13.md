# D&D controlled-creature lifecycle verification — 2026-07-13

## Delivered behavior

- Shared `@open-tabletop/core` types cover summon, transformation, and persistent-companion records; spell/feature provenance; duration; concentration; initiative; command cost/history; transformation snapshots; preview/confirm requests; revision roots; and mutation results.
- `@open-tabletop/system-sdk` performs side-effect-free D&D validation. It rejects invalid source ownership, scene/token placement, expiration, initiative, concentration, and transformation carryover. Ambiguous stat-block, hit-point, equipment, concentration, and initiative inputs become explicit human-review items; the engine does not invent missing rules.
- Lifecycle metadata is embedded at `Actor.data.dnd5eControlledCreature`, so actor/token/item/combat archive and SQLite behavior preserve it without a parallel persistence collection.
- The API provides list, preview, confirm, command, dismiss/expire/revert, and concentration-end routes. Preparation and mutation authorization use explicit actor/campaign permission checks. Mutations are durable/idempotent and compare every affected revision root before changing state.
- Summon cleanup removes linked actors/tokens and detaches combat/encounter/scene references. Persistent-companion dismissal keeps an archiveable dismissed actor. Transformation reversion restores the preserved actor data, name, type, image, suppressed item ownership/data, and changed combat initiative.
- Concentration cleanup ends the source effect and every linked controlled creature in one durable mutation. The legacy single-actor concentration endpoint refuses linked controlled-creature groups so callers cannot create partial cleanup.
- The Compendium inspector includes an accessible `ControlledCreaturesPanel`. It lists lifecycle status, source, duration, initiative, command cost/history, supports controller commands and cleanup, and provides a semantic preview/review/confirm form. Loads are abortable, stale `409` responses force a reload/review, and no raw JSON editor is exposed.
- API contracts and the TypeScript client expose all six routes. Required write routes document and send `Idempotency-Key`.
- These specialized lifecycle routes are not separately exposed through MCP. The AI agent's existing proposal and governed automatic-execution modes remain unchanged; supported AI and plugin actions continue to use the ordinary permission-, revision-, validation-, and audit-checked application boundary.

## Routes

```text
GET  /api/v1/campaigns/{campaignId}/systems/{systemId}/controlled-creatures
POST /api/v1/campaigns/{campaignId}/systems/{systemId}/controlled-creatures/preview
POST /api/v1/campaigns/{campaignId}/systems/{systemId}/controlled-creatures
POST /api/v1/campaigns/{campaignId}/systems/{systemId}/controlled-creatures/{actorId}/command
POST /api/v1/campaigns/{campaignId}/systems/{systemId}/controlled-creatures/{actorId}/end
POST /api/v1/campaigns/{campaignId}/systems/{systemId}/controlled-creatures/concentration/end
```

All routes are currently restricted to `systemId=dnd-5e-srd`. Preview is read-only. The other five POST lifecycle mutations require explicit permissions; confirm, command, end, and concentration-end require replay keys.

## Verification evidence

- `@open-tabletop/core` build: passed.
- `@open-tabletop/system-sdk` build/typecheck: passed.
- `packages/system-sdk/src/dnd-controlled-creatures.test.ts`: 2/2 passed (manual-review fallback and expiry evaluation).
- `@open-tabletop/api` typecheck: passed.
- `apps/api/src/dnd-controlled-creatures.test.ts`: 2/2 passed (preview/confirm/idempotency/archive/concentration/stale atomicity; transformation revert/persistent dismissal).
- `packages/api-contracts/src/dnd-controlled-creatures-contract.test.ts`: 2/2 passed.
- `packages/api-client/src/dnd-controlled-creatures-client.test.ts`: 1/1 passed.
- API client full route-coverage test: passed with all six controlled-creature calls.
- `apps/web/src/controlled-creatures-panel.test.tsx`: 3/3 passed (accessible surface, encoded paths/revision composition, duration labels).
- The repository-wide web typecheck now passes; the earlier concurrent inventory-panel diagnostic is resolved.
- The API authorization matrix now passes the controlled-creature and D&D inventory unauthenticated/observer outcomes.

## Safety invariants

1. Preview has no side effects and confirmation must reproduce its token and root revisions.
2. Manual-review warnings block confirmation until a human explicitly confirms and previews again.
3. A stale or deleted affected root returns `409` before mutation; durable rollback prevents partial cleanup on save failure.
4. Controller/owner identity is campaign-scoped, and source spell/features must be actor-owned D&D items.
5. Transformation hit-point and equipment behavior is never inferred.
6. Concentration-linked groups cannot be ended through the non-atomic legacy path.
7. Unknown/homebrew actor and item fields survive transformation snapshot/reversion.
