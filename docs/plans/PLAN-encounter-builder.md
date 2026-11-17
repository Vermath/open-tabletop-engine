# Plan E: Encounter Builder (web-only)

**Context:** the API has a complete encounter-planning surface that the UI reduces
to one hardcoded demo button. `planSystemEncounter()` in App.tsx posts
`threats: [{ id: <hardcoded>, count: 2 }]` and dumps the summary into a status
line. **Goal:** a real GM-facing Encounter Builder — browse the threat catalog,
compose an encounter with live difficulty feedback, save it, and optionally spawn
its monsters onto the active scene.

**Scope fence:** `apps/web/src/**` ONLY, and NOT `apps/web/src/api.ts` — another
agent owns that file concurrently (it is changing `loadSnapshot`; you may READ it
and import existing exports, never edit it). No `apps/api`, no `packages/**`. The
threat/plan routes already exist — you need zero API changes.

## Verified API surface (do not modify it)

- GET `/api/v1/campaigns/:campaignId/systems/:systemId/encounter-threats` →
  `EncounterThreat[]`: `{ id, systemId, name, summary, role, budget,
  challengeRating? }` (permission: campaign.read).
- POST `/api/v1/campaigns/:campaignId/systems/:systemId/encounter-plan` with body
  `{ partyActorIds?: string[]; threats?: Array<{id, count}>; createEncounter?:
  boolean; name?: string }` → `{ plan, encounter? }`. Planning needs campaign.read;
  `createEncounter: true` needs combat.manage. `plan` (client type
  `EncounterPlanInfo` in api.ts): `{ systemId, partyRating, threatBudget,
  difficulty: "trivial"|"easy"|"standard"|"hard"|"deadly", summary, threats:
  [{ id, name, role, count, budgetEach, budgetTotal }] }`.
- Existing wiring to replace: `planSystemEncounter()` in App.tsx (hardcoded
  count 2), `encounterPlan` state, and the `planEncounter={planSystemEncounter}`
  prop (grep it to find which panel consumes it today — keep that surface working
  by pointing it at the new builder).

## Feature design

1. **`encounter-builder.tsx`** — a centered modal (`modal-backdrop`/`modal-dialog`
   pattern like `character-creator-dialog.tsx`) with:
   - Threat catalog: fetched on open from the encounter-threats route for the
     active system; searchable text filter; each row shows name, role, CR
     (`challengeRating` when present), budget/XP; an Add button (and + / − count
     steppers for threats already in the encounter).
   - Composition list: chosen threats with counts and per-threat `budgetTotal`.
   - Live plan: on every composition change, debounce ~300ms then POST
     encounter-plan (no `createEncounter`) and render `partyRating`,
     `threatBudget`, the difficulty as a prominent badge (color-code:
     trivial/easy muted, standard `--paper`, hard brass, deadly red), and
     `summary`. Party defaults to all party actors (reuse the same
     party filter used by `awardPartyXp` in App.tsx); optionally let the GM
     toggle individual party members (checkbox list) → send `partyActorIds`.
   - Name input + **Save encounter** button (gated `hasPermission("combat.manage")`)
     → POST with `createEncounter: true`, apply the returned encounter to
     `snapshot.encounters` locally (follow the `applyActorToSnapshot` local-apply
     pattern in App.tsx — add a small `applyEncounterToSnapshot` in App), toast
     via `setStatus`.
2. **Spawn to scene (stretch, only if straightforward):** after saving, offer
   "Place monsters on scene": for each composed threat, create a hostile token on
   the active scene via the existing token-creation path (`createToken` in App.tsx
   accepts name/disposition/position options). Grid-place them near the scene
   center with slight offsets. If the threat catalog cannot be mapped to a token
   image/actor cleanly, spawn plain hostile tokens named after the threat with
   `disposition: "hostile"` — that is enough. Skip actor creation entirely; do NOT
   call monster-creation routes.
3. **Launch points:** a "Plan encounter" `ghost-button` in CombatPanel's
   pre-combat section (next to Start combat, gated combat.manage) and rewire the
   existing `planEncounter` consumer to open the builder instead of firing the
   hardcoded plan.
4. **CSS:** appended layer, reuse `.creator-*` idioms where sensible
   (`--paper` for text on dark, never `--ink`).

## Tripwires

All of PLAN-xp-level-loop.md verbatim (noUnusedLocals, no SDK imports in web,
source-pin tests, no `.git` writes/commits). Web baseline when you start: run
`pnpm --filter @open-tabletop/web test` first and record it (expect ~166+, it may
have grown). Modal state must reset between opens (conditional render unmount,
like the character creator).

## Gates

1. `pnpm --filter @open-tabletop/web typecheck` + full web unit tests + build.
2. **E2E is now a required gate.** Run BOTH configs with dedicated ports so you
   cannot collide with other agents:
   `OTTE_E2E_API_PORT=4200 OTTE_E2E_WEB_PORT=5274 pnpm exec playwright test`
   and
   `OTTE_E2E_BOOTSTRAP_API_PORT=4210 OTTE_E2E_BOOTSTRAP_WEB_PORT=5284 OTTE_E2E_BOOTSTRAP_EMAIL_WEBHOOK_PORT=4212 pnpm exec playwright test -c playwright.bootstrap.config.ts`
   — all green. If a pre-existing e2e test breaks because you changed a surface it
   pins, update it preserving intent (never delete/weaken).
3. Live check via agent-browser (dev servers; if launch fails in-sandbox, record
   the skip): as Demo GM open the builder from the Combat tab, add two different
   threats, watch the difficulty badge change as counts change, save an encounter,
   verify the toast and that the encounter exists (snapshot fetch), and if you
   built the stretch, verify hostile tokens appeared on the board. Clean up
   spawned test tokens/encounters afterwards.

## Report

Feature summary + wiring trace (catalog fetch → compose → debounced plan → save →
local apply), what the old `planEncounter` surface does now, stretch status,
skipped live checks if any, commit message ending with the
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer. No commits.
