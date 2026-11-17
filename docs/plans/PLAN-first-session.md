# Plan G: Zero to first session — new-campaign onboarding

**Context:** POST `/api/v1/campaigns` creates ONLY the campaign record, the owner
membership, and permission grants — no scene, no journal, nothing. A brand-new GM
lands in a void and has to discover scene creation, the character creator, and the
encounter builder unaided. This is the biggest gap between "great demo" and
"outside dogfood". **Goal:** a new campaign can opt into starter content and every
major empty state actively points at the next step.

**Scope:** `apps/api/src/app.ts` + `app.test.ts`, `apps/web/src/**`,
`tests/e2e/**` (only where your changes require updating specs — never weaken).
No `packages/**`. **No new routes** — extend the existing campaign-create body.

## Part 1 — Starter content on campaign create (API)

Extend `POST /api/v1/campaigns` body (anchor: `CampaignCreateBody`) with
`starterContent?: boolean`. When `true`, after the existing campaign/member/grant
creation, seed IN THE SAME request:

1. A starter scene: name like "First Session", sensible grid defaults — copy the
   field shape from the existing scene-create route handler (grep
   `"/api/v1/campaigns/:campaignId/scenes"`) or from `seedState` in
   `packages/core` (READ core for the shape; do not edit it). Mark it active.
2. A welcome journal entry (visibility "public", tags `["welcome"]`) titled
   "Running your first session" whose body is a short practical checklist in
   markdown: create characters (character creator on the party rail), drop tokens
   on the board, plan an encounter from the Combat tab, award XP after the fight,
   generate a session recap from the Journal tab. Write it as a GM would want to
   read it — concrete, five bullets, no marketing.
3. A GM-only journal entry (visibility "gm_only", tags `["gm-notes"]`) titled
   "GM notes" with a one-line body inviting them to keep prep here.

Default is `false`/absent (existing API tests and flows must be unaffected).
Broadcast/save exactly as the existing handler does. Add API tests: campaign
created WITH the flag has the scene + 2 journals with correct visibility;
without the flag, none.

## Part 2 — Setup wizard integration (web)

The campaign setup wizard lives in the Manage workspace (grep
`Create Campaign Setup` / the e2e spec `GM can create a campaign through the setup
wizard` shows the flow). Add a "Include starter content" checkbox, CHECKED by
default, wired to `starterContent` in the create request. After creation with
starter content, select the new campaign's starter scene so the GM lands on a
playable board (the create flow already switches campaigns — follow it and extend).

## Part 3 — Empty-state CTAs (web)

Audit the GM-visible empty states and make each one actionable (buttons reuse the
exact existing handlers — no new flows):

- Board with no scenes: the existing "Create a scene to open the tabletop." empty
  state gains a "Create scene" button for seats with scene.create (grep
  `Create a scene to open the tabletop` and the scene-create handler in App).
- Party rail with no party actors: "No party actors yet." gains an
  "Open character creator" button (the handler exists: `openCharacterCreator`),
  gated actor.create.
- Journal panel with zero entries: a hint + the existing create form is already
  there; add a one-line hint mentioning the recap button exists after play.
- Combat tab pre-combat: already has Start combat + Plan encounter — leave it.

Keep the copy terse (the UI voice avoids exposition — no "API-first" style
marketing). Style additions go in ONE appended styles.css layer; text on dark is
`var(--paper)`/`var(--muted)`, never `var(--ink)`.

## Tripwires

All of PLAN-xp-level-loop.md verbatim (noUnusedLocals, no SDK imports in web,
source-pin tests, no `.git` writes/commits). The web source is split across
feature modules — App.tsx holds App() + ActorPanel; panels live in their own
files. The route-coverage/auth-matrix gates in app.test.ts fire on NEW routes
only; extending the create body is the sanctioned pattern.

## Gates (all required)

1. `pnpm --filter @open-tabletop/api typecheck` + full API tests (baseline 224/1
   skipped; yours add to it).
2. `pnpm --filter @open-tabletop/web typecheck` + full web tests (baseline 171) +
   build.
3. **Full e2e, both configs** on your dedicated ports:
   `OTTE_E2E_API_PORT=4400 OTTE_E2E_WEB_PORT=5474 pnpm exec playwright test`
   and
   `OTTE_E2E_BOOTSTRAP_API_PORT=4410 OTTE_E2E_BOOTSTRAP_WEB_PORT=5484 OTTE_E2E_BOOTSTRAP_EMAIL_WEBHOOK_PORT=4412 pnpm exec playwright test -c playwright.bootstrap.config.ts`
   — baseline 24 + 1, all green. The setup-wizard spec (`GM can create a campaign
   through the setup wizard`) WILL need updating for the new checkbox — update it
   to exercise starter content ON and assert the starter scene/journal appear
   (strengthening, which is allowed); keep one path asserting a bare campaign
   still works if the spec covers it.
4. Live check (agent-browser, dev servers on 4000/5173; record skips if the
   browser cannot launch): as Demo GM run the wizard with the checkbox on, land
   in the new campaign, verify the starter scene is active on the board and the
   welcome journal exists with the checklist; verify the party-rail and no-scene
   CTAs render in the right permission states. Clean up: archive or delete the
   test campaign if a route exists (campaign DELETE/archive exists — grep
   `Archive Campaign`); otherwise report the leftover.

## Report

Per-part summary, the starter-content payload contents, e2e spec changes made,
live-check evidence, leftovers, commit message ending with the
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer. No commits.
