# Plan F: Collapse the snapshot fan-out (initial load + reconcile cost)

**Context:** `loadSnapshot` in `apps/web/src/api.ts` issues ~16 HTTP requests per
call: 4 org-level gets, an optional invites get, the campaign snapshot get, then a
9-wide `Promise.all` fan-out (asset storage, audio, content imports, AI threads /
usage / tool-calls, plugins, systems, combat audit) plus a character-templates get.
It runs on initial page load AND as the debounced realtime reconciler, so the
fan-out is paid constantly. **Goal:** fold the campaign-scoped side resources into
the existing campaign snapshot response and cut `loadSnapshot` to roughly 6
requests, without changing what any seat is allowed to see.

**Scope fence:** `apps/api/src/app.ts` + `apps/api/src/app.test.ts` +
`apps/web/src/api.ts` (and its `api.test.ts`) ONLY. Another agent owns the rest of
`apps/web/src/` concurrently (App.tsx, panels, styles) — do not touch those files.
No `packages/**`. **No new routes** — extend the existing
GET `/api/v1/campaigns/:campaignId/snapshot` response only.

## Implementation

1. **Server:** locate the campaign snapshot route (grep `"/snapshot"` in app.ts)
   and extend its response with a `bundled` (or similarly named) object containing
   exactly what the client fan-out fetches today, with THE SAME permission gating
   the individual routes apply — copy each source route's filtering logic (or
   better, extract shared helpers) rather than re-deriving it:
   - `assetStorage` (campaign asset storage info)
   - `audioTracks`
   - `plugins`, `systems`, `characterTemplates` (templates for the active system,
     same fallback the client uses today)
   - `contentImports` — ONLY if the requester passes the same permission check the
     content-imports route uses (campaign.update); omit the field otherwise
   - `aiThreads`, `aiUsage`, `aiToolCalls` — ONLY behind the same ai gating the
     individual routes use; omit otherwise
   - `combatAudit` — for the active combat if any, same visibility as the combat
     audit route
   The individual routes MUST keep working unchanged (other clients/tests use
   them).
2. **Client:** in `loadSnapshot`, use the bundled fields when present and fall
   back to the existing per-resource requests when a field is absent (undefined),
   so the client tolerates an older server. Keep the org-level requests as they
   are. Net effect: fresh client + fresh server = ~6 requests.
3. **Measure:** before and after, count requests for one `loadSnapshot` (simplest:
   a counter in `snapshotGet` logged in a quick node/vitest harness, or count via
   the api.test.ts fetch mock). Report the numbers.

## Tripwires

- All of PLAN-xp-level-loop.md verbatim. Critical here: the route-coverage /
  auth-matrix gates in app.test.ts fire on NEW routes — extending the snapshot
  response is the sanctioned pattern.
- **Permission parity is the acceptance bar:** a player seat must receive exactly
  the same data via the bundle as it could fetch via the individual routes. Add
  API tests proving: (a) GM snapshot contains the bundled fields, (b) a
  player-seat snapshot OMITS contentImports/ai fields it lacks permission for,
  (c) bundled values equal the individual routes' responses for the same seat.
- apps/web has unit tests for api.ts behavior (`api.test.ts`) — extend, never
  weaken. Web source-pin tests must stay green.
- Do NOT change response shapes of any existing field in the snapshot route.

## Gates

1. `pnpm --filter @open-tabletop/api typecheck` + full API tests (baseline 224
   passed / 1 skipped — yours should add to it).
2. `pnpm --filter @open-tabletop/web typecheck` + full web tests (baseline 166).
3. **E2E both configs on your dedicated ports** (another agent may run e2e
   concurrently on other ports):
   `OTTE_E2E_API_PORT=4300 OTTE_E2E_WEB_PORT=5374 pnpm exec playwright test`
   and
   `OTTE_E2E_BOOTSTRAP_API_PORT=4310 OTTE_E2E_BOOTSTRAP_WEB_PORT=5384 OTTE_E2E_BOOTSTRAP_EMAIL_WEBHOOK_PORT=4312 pnpm exec playwright test -c playwright.bootstrap.config.ts`
   — all green (24 + 1 baseline).
4. Web build.

## Report

Request count before/after; the bundled-field list with its permission gate each;
tests added; commit message ending with the
`Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer. No commits.
