# Plan: Restore the Playwright e2e suite to green

**Context:** the repo has a real e2e suite (`pnpm e2e` = main config + bootstrap
config) that was never run during the recent feature arc (UI overhaul, XP loop,
loot, realtime sync, App.tsx split, player polish). Current state, just measured:
**11 failed / 13 passed** on the main config; the bootstrap config never got to run
(the `&&` chain stops at the first failure), so its status is UNKNOWN.

**Goal:** every test in BOTH configs green, with each of the 11 failures explicitly
triaged as either (a) stale test updated to the redesigned UI, or (b) genuine app
regression fixed in the app. Then a second consecutive full run to prove stability.

## The 11 failing tests (main config)

- accessibility.spec.ts: `main tabletop controls expose accessible names and keyboard reachability`
- accessibility.spec.ts: `actor sheet targeting controls expose screen-reader structure`
- accessibility.spec.ts: `destructive token dialog supports screen-reader and keyboard flow`
- auth-tabletop.spec.ts: `GM can switch selected-token permission presets`
- auth-tabletop.spec.ts: `demo GM can reach campaign, scene, and tabletop controls`
- auth-tabletop.spec.ts: `GM can create a campaign through the setup wizard`
- auth-tabletop.spec.ts: `GM can run the browser combat tracker lifecycle`
- auth-tabletop.spec.ts: `player combat action requires GM confirmation and completes the browser flow`
- auth-tabletop.spec.ts: `GM can run SDK plugin and system workflows from the browser`
- auth-tabletop.spec.ts: `GM can apply broader D&D SRD action effects from the browser`
- auth-tabletop.spec.ts: `player can accept an invite from a private browser session`

## Environment facts (verified)

- `tests/e2e/start-api.mjs` deletes `storage/e2e-<port>.sqlite*` and boots a FRESH
  seeded API (`OTTE_DEMO_SEED=true`, `NODE_ENV=test`) per run — demo-data drift is
  NOT a possible cause; every failure is code-vs-test divergence.
- Ports: main = API 4100 / web 5174; bootstrap = API 4110 / web 5184 / email 4112.
  These must be free. Do NOT kill processes you did not start — if a port is
  occupied, report it and stop. Ignore unrelated dev servers on 4000/5173.
- Run a single test with: `pnpm exec playwright test tests/e2e/<file>.spec.ts -g "<test name>"`.
  Failure artifacts land in `test-results/**/error-context.md` — read them first.
- Suite is serial (workers: 1); expect ~5 minutes per full main-config run, so
  iterate per-test and save full runs for checkpoints.

## Recent UI changes the stale tests likely predate

The tests were written against the pre-overhaul UI. Since then: stage-first board
layout; right-rail inspector with tabs Actors/Chat/Combat (live) and
Actors/Journal/Content/Plugins (prep workspace — workspace modes are Live
Table/Prep/Manage buttons in the left rail); actor sheet is a movable popout plus a
sidebar summary (`actor-sidebar-summary`, HpBar steppers, XP bar, condition chips,
Level Up modal `.advancement-modal` hosting `AdvancementFlow`); combat tracker is
initiative-first (`combat-panel.tsx`) with Start combat / Prev / Next turn / End and
Split XP / Split GP forms; SdkPanel (Plugins tab, prep mode) hosts plugin/system
workflows and the character-template quick-create + "Open character creator" wizard;
campaign setup lives in the Manage workspace ("Create Campaign Setup" etc.); token
deletion uses a confirm dialog (`token-delete-dialog-title` ids exist in App.tsx).
Web source is now split across feature modules (`apps/web/src/*.tsx`) — grep there,
not just App.tsx.

## Triage discipline (per failure, in order)

1. Read the failure's `error-context.md` + the spec code around the failing line to
   understand what the test PROVES (its intent), not just what it selects.
2. Reproduce headed or with `--trace on` if the context file is not conclusive.
3. Classify:
   - **Stale test:** the UI surface moved/renamed by design (e.g. "Selected Actor"
     panel-stack heading no longer exists). Update the selectors/steps to the
     current UI while preserving the assertion intent at equal or stronger
     strength. Never delete a test; never drop an assertion because it is
     inconvenient; if an entire surface was removed by design, assert the
     replacement surface's equivalent guarantee.
   - **App regression:** the guarantee itself broke (most likely in the
     accessibility specs — missing accessible names/roles/keyboard reachability on
     redesigned controls, missing dialog semantics). Fix the APP
     (`apps/web/src/**`): add aria-labels/roles/focus handling to the current
     components. Prefer app fixes for anything a screen-reader or keyboard user
     would genuinely miss.
4. Record the classification and the fix in a running triage table for the report.

## Scope and constraints

- May edit: `tests/e2e/**`, `apps/web/src/**` (a11y and regression fixes only — no
  feature work, no refactors), and `playwright.config.ts`/bootstrap config ONLY if
  strictly necessary (do not change ports or flip `reuseExistingServer` defaults).
- `apps/api` and `packages/**` are OFF LIMITS unless triage proves a server
  regression; in that case STOP and put the evidence in your report instead of
  fixing it.
- All tripwires from PLAN-xp-level-loop.md apply verbatim (noUnusedLocals, no SDK
  imports in web, `--paper` not `--ink`, source-pin tests must stay green, no
  `.git` writes / no commits).
- If you change app code, the standard web gates must pass too:
  `pnpm --filter @open-tabletop/web typecheck && pnpm --filter @open-tabletop/web test`
  (baseline 166 tests / 30 files) and the build.

## Definition of done

1. `pnpm exec playwright test` (main config): 24/24 passing.
2. `pnpm exec playwright test -c playwright.bootstrap.config.ts`: all passing
   (triage any failures with the same discipline).
3. One more consecutive full `pnpm e2e` run, fully green, to catch flakiness — if a
   test flakes, stabilize it (proper waits over timeouts) and run again.
4. Web unit gates green if app code changed.

## Report

(a) triage table: test → root cause → stale-test vs app-fix → what changed;
(b) any app regressions found (especially a11y) described in a sentence each;
(c) bootstrap-suite findings; (d) flakiness encountered and how it was stabilized;
(e) commit message ending with the `Co-Authored-By: Claude Fable 5
<noreply@anthropic.com>` trailer. No commits — leave the tree for review.
