# Plan: from the merged UI stack to a Foundry/Roll20-class, AI-native OSS tabletop

Written 2026-11-10 against `main` at `2250136`, after PRs #67 and #71 to #77 were
merged. This is an end-to-end plan meant to be executed by a coding agent, one work
package at a time, with a human owner answering the decisions listed in section 4.
Branch from `main` and open every PR against `main`.

**Read sections 1 to 4 before starting any work package.** They are short, and every
work package assumes them.

---

## 1. How to use this plan

- **One work package (WP) is one pull request.** Never batch two WPs. If a WP is marked
  "split", it lists the PRs to cut it into.
- **Do phases in order.** Inside a phase, do WPs in the listed order unless a WP says
  "parallel-safe".
- **Each WP has the same fields:**
  - *Goal*: the outcome, in one or two sentences.
  - *Start here*: files and searches that locate the relevant code.
  - *Steps*: the work, in order.
  - *Done when*: checks a reviewer can run. All must hold.
  - *Fences*: what you must not touch or change.
  - *Size*: S (under a day), M (2 to 4 days), L (1 to 2 weeks), XL (longer; always split).
  - *Depends on* and *Human decision*, when they apply.
- **Track progress** by ticking the WP in the table in section 6, in the same PR that
  completes it.
- **When a fact in this plan disagrees with the code, the code wins.** Say so in the PR
  and carry on. Section 3 lists facts that were true when this was written.

## 2. Ground rules

These apply to every WP. `AGENTS.md` at the repo root also applies; where the two
overlap, both must hold.

1. **The server is authoritative.** No rules maths, permission decisions or visibility
   filtering in the browser. A new mutation is a typed route that is permission-checked,
   revision-guarded, audited, and undoable where it is destructive.
2. **Every new mutation route must be registered** in the OpenAPI contract
   (`packages/api-contracts/src/index.ts`) and in the route inventory checked by
   `apps/api/src/mutation-route-contract.test.ts`.
3. **Every new piece of campaign data must survive an archive round trip.** Add it to
   export, import and validation, and extend an archive test to prove it.
4. **Player privacy is tested, not assumed.** If a WP adds data to scenes, tokens,
   actors or chat, add a test that a player's HTTP payload, WebSocket events, archive
   and Player Preview do not contain the GM-only part. Existing examples:
   `apps/api/src/dynamic-visibility.test.ts`, `player-preview.test.ts`,
   `plugin-command-context-privacy.test.ts`.
5. **Do not change existing AI agent behaviour** unless the WP is in Phase 4 and says
   so. Even then, changes are additive: new tools, new endpoints, new providers. Never
   convert automatic execution into proposal-only, and never remove the manual mode.
6. **Never weaken a test to get green.** No deleted assertions, no `skip`, no raised
   budgets. `app-architecture-budget.test.ts` caps `App.tsx` at 11,250 lines: you may
   lower that cap after an extraction, never raise it.
7. **Source-text tests.** About 46 test files read `App.tsx` or other sources as text.
   When code moves, repoint the test at the new file and keep the assertion. Find them
   with `grep -ln "readFileSync" apps/web/src/*.test.ts apps/web/src/*.test.tsx`.
8. **Browser tests must not depend on run order.** A full run shares one server, and
   earlier tests leave tokens, actors and combats behind. Create your own data or pick
   elements robustly (see `topmostToken` in `tests/e2e/map-controls.spec.ts` and
   `targetValen` in `tests/e2e/one-step-actions.spec.ts`), and restore what you change.
9. **New runtime dependencies** need a licence compatible with the AGPL core and the
   permissive SDK packages (MIT, Apache-2.0, BSD, ISC, OFL for fonts). Name the licence
   in the PR and run `pnpm security:audit`.
10. **Additive data changes only.** New fields are optional with a documented default so
    existing campaigns and archives load unchanged. If you think you need a breaking
    change, stop and ask.
11. **Do not commit** `artifacts/`, `apps/api/artifacts/`, `output/`, `test-results/`,
    `.env`, or anything under `.agents/` or `.claude/`.
12. **Report honestly.** The PR body states the exact commands run and their counts. If
    a test fails, run the same test on the base branch before calling it pre-existing.
    Never write "all tests pass" for a suite you did not run to completion.

**Stop and ask the human** when: a decision in section 4 is unresolved and the WP
depends on it; a licence or content-rights question comes up; a change would alter
default AI behaviour; a data change cannot be made additive; the work has grown well
past the WP's size; or the same failure survives three distinct attempts.

### Verification commands

```bash
corepack enable && pnpm install --frozen-lockfile
pnpm check                      # lint, typecheck, e2e typecheck, unit tests, build
pnpm --filter @open-tabletop/web typecheck
pnpm --filter @open-tabletop/web test
pnpm --filter @open-tabletop/api test        # long: roughly 9 minutes
pnpm exec playwright install chromium        # once per machine
pnpm e2e                                     # full browser suite, roughly 14 minutes
pnpm exec playwright test tests/e2e/<file>.spec.ts
pnpm security:audit
pnpm docs:site:check
```

Minimum for every PR: `pnpm check`, plus the browser specs that touch what you changed.
Before merging a phase's last WP: the full `pnpm e2e`.

## 3. State when this was written (re-verify before you start)

**Merged into `main`:** the checkpoint branch (#67), the build repair (#71), map
controls (#72), notifications (#73), initiative strip and resizable inspector (#74),
single wall layer (#75), bundled fonts (#76) and one-step actions with undo (#77).

**CI on `main` at `2250136` is green.** The `Release Smoke` workflow runs one job,
`pnpm release:smoke:offline`, on every pull request and on pushes to `main`. That job
includes the dependency audit, two cold runs of `pnpm check`, the full `pnpm e2e`
browser suite, the security, migration and deployment smokes, and the docs-site check.
This plan's author did not re-run those suites locally on `2250136`; the claim rests on
that CI result.

**History worth knowing, because it can come back:**

- Before the repairs, the API unit suite had 12 failing tests in 8 files and the full
  run crashed twice with `ERR_IPC_CHANNEL_CLOSED`. Three of the failures were "durable
  flush fails" rollback cases that behaved differently when run as root on Linux.
- The browser suite had 12 failures on Linux. Eight came from data left behind by
  earlier tests in the same run. Four were intermittent: `ai-provider-concurrency`,
  `archive-stream`, the `browser-evidence` restart case and `campaign-members`.
- One layout test only failed where the Windows system fonts were missing. Fonts are
  now bundled.

**Facts about the code that later WPs rely on:**

- `GridType` is `"square" | "gridless"`. There is no hex grid.
- `TokenLayer` is `"map" | "player" | "gm"`. There is no foreground layer.
- A `Scene` has one `backgroundAssetId`. There are no levels and no video backgrounds.
- The board is DOM plus stacked SVG layers in `apps/web/src/scene-canvas.tsx`. Tokens
  are `<button class="token">` elements with accessible names and keyboard movement.
- There are no rollable tables, card decks, built-in voice or video, service worker,
  or UI translation framework.
- `POST /api/v1/mcp` exposes campaign tools over MCP (see `apps/api/src/app.ts`).
- AI tools and modes are described in `docs/ai/overview.md`. Providers implement the
  interface in `packages/ai-core`.
- External rules systems use `declarative-v1`, documented with its limits in
  `docs/system-sdk/declarative-v1.md`. The worked example is
  `packages/system-sdk/examples/lantern-road/`.
- `apps/api/src/app.ts` is about 28,600 lines. `apps/web/src/App.tsx` is 11,244 lines
  against a cap of 11,250, so there is no room to add features to it before WP-1.1.
- No human group has played a session on this software. Every "session" in
  `docs/verification/` is automation.

## 4. Decisions for the human owner

Ask each once, before the first WP that needs it. Record the answer in
`docs/decisions/` as a short dated file, and link it from the WP's PR.

| ID | Decision | Recommendation | Needed by |
|---|---|---|---|
| D1 | Board renderer | Hybrid: PixiJS (MIT) canvas for map, grid, walls, light, fog and effects; keep tokens as DOM buttons | WP-1.5 |
| D2 | Voice and video | Optional embed of a self-hostable service (LiveKit or Jitsi), off by default | WP-2.9 |
| D3 | Second rules system | Pathfinder 2e under the ORC licence, after a rights review; fallback is an original system | WP-5.1 |
| D4 | First open AI provider | A generic OpenAI-compatible endpoint, which covers local runners and most hosted models | WP-4.1 |
| D5 | Speech-to-text for the scribe | Text-only first; audio later, local model preferred, with explicit table consent | WP-4.5 |
| D6 | Importer stance | Only files the user exports from their own account or install. No scraping, no auth bypass | WP-3.2 |
| D7 | Plugin registry hosting | A static JSON index in a public git repository | WP-5.2 |
| D8 | Where AI may run by default | Off by default everywhere; opt-in per campaign; generated content labelled | Phase 4 |

---

## 5. Work packages

### Phase 0: stabilise

Nothing later is reliable until this phase is done.

#### WP-0.1 Land the PR stack (done)
- Merged on 2026-11-10. Nothing to do.

#### WP-0.2 Confirm the unit suites are green where people develop
- *Goal*: `pnpm check` passes twice in a row on a clean checkout of `main`, on Linux
  and on Windows.
- *Steps*:
  1. Run it. CI already does this on Linux; the owner develops on Windows.
  2. If a test fails on one platform only, fix the test's assumption (file
     permissions, path separators, fonts, timing), not the product.
  3. If the API run ends with `ERR_IPC_CHANNEL_CLOSED`, find the test that leaves a
     server, timer or child process alive.
- *Done when*: two consecutive green runs on each platform, with the counts in the PR.
  If nothing needed fixing, record the counts in `docs/verification/` and close the WP
  without a code change.
- *Fences*: do not delete or skip a test. Do not change AI behaviour to satisfy one.
- *Size*: S if green, M if not.

#### WP-0.3 Make the browser suite independent of run order
- *Goal*: any spec file passes on its own, and the suite passes in reverse file order.
- *Steps*:
  1. Run `pnpm e2e` twice. Then run the spec files in reverse order with one worker.
  2. Where a spec depends on data another spec left behind, or breaks because of it,
     make the spec create and remove its own campaign. Prefer that over a shared reset.
  3. For any intermittent test, find which wait is racing before touching a timeout.
- *Done when*: forward and reverse runs are both green twice; the PR lists every spec
  that was changed and why.
- *Size*: M.

#### WP-0.4 Faster, clearer CI
- *Goal*: a failing test is visible as a failing test within ten minutes of a push.
- *Start here*: `.github/workflows/release-smoke.yml`. Today one sequential job runs
  everything, so an audit failure hides the test results and a test failure waits
  behind the audit.
- *Steps*: split into parallel jobs (audit, `pnpm check`, `pnpm e2e`, smokes and docs);
  keep `release:smoke:offline` as the single local command; upload Playwright traces
  and the API gate diagnostics as artifacts on failure.
- *Done when*: a deliberately broken unit test on a throwaway PR turns the unit job
  red while the audit job stays green.
- *Size*: S.

#### WP-0.5 Three real sessions (human task)
- *Goal*: three sessions of at least 90 minutes with a human GM and at least two human
  players, on the merged branch.
- *Steps for the agent*: prepare a checklist from
  `docs/dogfood/run-your-first-session-checklist.md`; after each session, turn the
  owner's notes into issues labelled by severity; fix Critical and High before Phase 2.
- *Done when*: three session reports exist under `docs/dogfood/sessions/` and every
  Critical or High finding has a merged fix with a regression test.
- *Human decision*: the owner schedules and runs the sessions.
- *Size*: M of agent time, spread over the sessions.

**Phase 0 gate:** `pnpm check` and `pnpm e2e` green twice on `main` on both platforms,
CI green, at least one real session done.

---

### Phase 1: structure

These unlock the features in Phases 2 to 4. Do not skip ahead.

#### WP-1.1 Split `App.tsx` state by domain (split into 5 PRs)
- *Goal*: `App.tsx` under 6,000 lines, with state owned by domain hooks, and no
  behaviour change.
- *Start here*: `docs/plans/PLAN-split-app.md` (same rules apply),
  `apps/web/src/status-toasts.ts` and `inspector-resize.tsx` as examples of the hook
  shape to copy.
- *Steps*, one PR each, in this order:
  1. Board: selection, zoom, tools, fog, annotations, undo stack.
  2. Combat: active combat, turn advance, rewards.
  3. Actors and actions: selected actor, action preview, rules undo.
  4. Campaign and manage: campaigns, members, archives, settings.
  5. Session and connection: auth, realtime, status.
  After each PR lower the cap in `app-architecture-budget.test.ts` to the new line
  count plus 50.
- *Done when*: web unit suite and full browser suite green after each PR; the cap ends
  at or below 6,000; no new context provider re-renders the whole shell on a token
  drag (check with the React profiler and say what you saw).
- *Fences*: code moves verbatim. If you find a bug, note it and leave it. `styles.css`
  is out of scope. No changes outside `apps/web/src/`.
- *Size*: L in total.

#### WP-1.2 URL routing
- *Goal*: the address bar reflects campaign, workspace, scene and open record, and
  Back and Forward work.
- *Steps*: define routes such as `/c/:campaignId/live/:sceneId` and
  `/c/:campaignId/prep/journal/:entryId`; read the route on load; push on navigation;
  keep invite and SSO redirects in `startup-state.ts` working. Use the History API
  directly or a small router, not a framework migration.
- *Done when*: a browser spec opens a deep link in a fresh context and lands on the
  right scene; Back returns to the previous scene; a player following a GM-only link
  gets the normal denial, not a crash.
- *Depends on*: WP-1.1 steps 1 and 4.
- *Size*: M.

#### WP-1.3 Chat dock
- *Goal*: chat and the dice log stay visible while another inspector tab is open.
- *Start here*: `chat-rail.tsx`, `workspace-navigation.tsx`, `chatPanelVisible` and
  unread tracking in `App.tsx`.
- *Steps*: add a "pin chat" control; when pinned, render the chat rail in a resizable
  lower split of the inspector and hide the Chat tab; remember the choice per browser;
  on phones keep today's single-surface behaviour.
- *Done when*: a browser spec pins chat, opens the Actors tab, sends a message from a
  second user and sees it without switching tabs; unread counts stay correct when
  unpinned.
- *Depends on*: WP-1.1 step 1.
- *Size*: M.

#### WP-1.4 Type scale and colour tokens (split into 3 PRs)
- *Goal*: at most 8 font sizes and every colour drawn from a named token.
- *Start here*: `apps/web/src/styles.css` (about 17,500 lines, 44 distinct font sizes,
  159 distinct hex colours, 41 custom properties).
- *Steps*:
  1. Define `--text-xs` to `--text-2xl` and replace sizes file-section by file-section.
  2. Replace hex and `rgba()` literals with tokens; add tokens only where a real new
     role exists.
  3. Add a user text-size setting (90%, 100%, 115%, 130%) stored per browser.
- *Done when*: a unit test counts distinct `font-size` values and hex literals in
  `styles.css` and enforces the limits; screenshots of live table, prep, manage and
  phone at 320px are attached before and after; the 320px navigation spec passes.
- *Fences*: no layout redesign. Tests that pin CSS strings are updated, not removed.
- *Size*: L in total.

#### WP-1.5 Board renderer (split into 4 PRs)
- *Goal*: a 4096 by 3072 map with 50 tokens and 300 walls pans, zooms and drags at
  under 33 ms per frame at the 95th percentile on a mid-range laptop.
- *Human decision*: D1.
- *Start here*: `apps/web/src/scene-canvas.tsx`, `map-viewport-gestures.ts`,
  `tests/e2e/multiplayer-profiling.ts`, `playwright.multiplayer.config.ts`,
  `docs/verification/competitive-critic-2026-09-06.md` (the measured baseline).
- *Steps*:
  1. **Measure first.** Record frame times for drag, pan and zoom on the fixture above
     with the current renderer. Commit the numbers.
  2. **Canvas layer for static content**: map image, grid, walls, lights, darkness.
     Keep the DOM layers behind a flag so the two can be compared.
  3. **Canvas for fog, vision masks, annotations and templates.**
  4. **Remove the replaced DOM layers** and the flag once parity is shown.
  Tokens stay as DOM buttons in this WP: they carry the accessibility and keyboard
  behaviour, and many tests depend on them.
- *Done when*: the step 1 measurements are repeated and meet the goal; the map,
  gridless, keyboard-board and player-preview browser specs pass unchanged; a player
  still cannot see anything the current renderer hides (re-run the privacy specs).
- *Fences*: no change to what is visible to whom. No change to the scene data model.
- *Size*: XL in total.

**Phase 1 gate:** `App.tsx` under 6,000 lines, deep links work, renderer goal met.

---

### Phase 2: table stakes

Each of these adds data. Rules 1 to 4 and 10 in section 2 apply to every one.

#### WP-2.1 Hex grids
- *Goal*: scenes can use flat-top or pointy-top hex grids, with snapping and distance.
- *Steps*: extend `GridType` with `"hex-flat" | "hex-pointy"`; add snapping, distance
  and template coverage in `packages/core`; render the grid; update calibration, the
  scene form, measurement, and the Universal VTT import mapping.
- *Done when*: unit tests cover snap, distance and neighbours for both orientations; a
  browser spec creates a hex scene, moves a token and reads the measured distance; old
  archives load; a square scene behaves exactly as before.
- *Depends on*: WP-1.5 step 2.
- *Size*: L.

#### WP-2.2 Foreground layer
- *Goal*: a layer drawn above tokens (roofs, canopies) that fades for a token under it.
- *Steps*: add `"foreground"` to `TokenLayer` or add scene tiles with a layer field,
  whichever fits the model with fewer special cases; say which you chose and why.
- *Done when*: a player with a token under a roof sees the interior and a player
  outside does not; archive round trip keeps the layer.
- *Size*: M.

#### WP-2.3 Multi-level scenes
- *Goal*: one scene holds several levels, each with its own background, walls and
  lights; tokens have a level; players see their token's level.
- *Steps*: add optional `levels` to `Scene` with a default single level so existing
  scenes are unchanged; add a level switcher for the GM; compute vision per level.
- *Done when*: privacy test proves a player on level 1 receives no level 2 walls,
  lights or tokens; moving a token between levels is one audited, undoable command.
- *Depends on*: WP-2.2.
- *Size*: XL. Split: model and archive; rendering and switcher; vision and privacy.

#### WP-2.4 Rollable tables
- *Goal*: a GM creates a table of weighted results, rolls it, and the result posts to
  chat with the roll attached.
- *Steps*: new `RollTable` record; server-side roll using `packages/dice-engine`;
  results can reference a journal entry, item or actor; GM-only and public visibility.
- *Done when*: rolls are server-rolled and replayable like other rolls; a player
  cannot read a GM-only table; archive round trip.
- *Size*: M. Parallel-safe.

#### WP-2.5 Card decks
- *Goal*: decks, hands and piles with draw, deal, shuffle and discard.
- *Done when*: shuffles are server-side and auditable; a player sees only their own
  hand; archive round trip.
- *Size*: M. Parallel-safe. Lower priority than WP-2.4.

#### WP-2.6 Animated and video maps
- *Goal*: a scene background can be a WebM or MP4 file.
- *Steps*: accept the types in asset upload with a size cap; render in the canvas
  layer; pause when the tab is hidden; honour `prefers-reduced-motion` with a still
  frame.
- *Depends on*: WP-1.5 step 2.
- *Size*: M.

#### WP-2.7 Player display mode
- *Goal*: a read-only, chrome-free view for a TV at an in-person table.
- *Start here*: `player-preview.ts`, `player-preview-panel.tsx`,
  `apps/api/src/player-preview-routes.ts`.
- *Steps*: add a display URL that authenticates as a display-only seat; show the active
  scene full screen with player visibility; let the GM pan and zoom it from their own
  screen; add a physical-size calibration (pixels per inch) so one grid square can be
  one real inch.
- *Done when*: the display receives exactly what a player with no owned token receives
  (privacy test); it follows scene activation within one second.
- *Size*: M.

#### WP-2.8 Phone player sheet, installable and tolerant of bad connections
- *Goal*: a player can run their character from a phone for a whole session.
- *Steps*: a phone-first sheet view (HP, resources, actions, rolls, conditions); a web
  app manifest and a service worker that caches the shell and fonts; queue rolls and
  chat while offline and replay them with the existing idempotency keys.
- *Done when*: a browser spec at 390 by 844 makes an attack roll, loses the network,
  reconnects and shows no duplicate; Lighthouse reports the app as installable.
- *Size*: L.

#### WP-2.9 Voice and video by integration
- *Human decision*: D2.
- *Goal*: a campaign can show an embedded call beside the table.
- *Start here*: `docs/deployment/audio-video-integrations.md`.
- *Steps*: an operator-configured room URL template; a dockable call panel; nothing
  loads unless the operator enabled it and the user clicks join.
- *Done when*: with the feature off, no third-party request is made (assert in a
  browser spec); with it on, the content security policy lists only the configured
  origin.
- *Fences*: do not build media transport.
- *Size*: M.

#### WP-2.10 Finish the action flow
- *Goal*: targeting and conditions without leaving the map.
- *Steps*:
  1. Click-to-target: with an action previewed, clicking a token sets it as the target.
  2. Condition picker: replace the free-text conditions field with toggles for the
     system's defined conditions, keeping free text for custom ones.
  3. Compendium drag-to-map: dropping a monster entry creates the actor and token in
     one atomic, undoable command (see `encounter-monster-placement` for the pattern).
- *Done when*: each has a browser spec; conditions still go through the server's
  condition command; a failed drop leaves no orphan actor.
- *Size*: M. Split into three PRs.

**Phase 2 gate:** a real session has used hex or levels, the phone sheet, and the
display mode without a Critical or High finding.

---

### Phase 3: make switching easy

#### WP-3.1 Finish Universal VTT import
- *Start here*: `packages/core/src/universal-vtt.ts`,
  `apps/api/src/universal-vtt-import.ts`, `apps/web/src/universal-vtt-import-panel.tsx`,
  `docs/verification/competitive-critic-2026-09-06.md` section "Native prepared-map
  import".
- *Done when*: `.uvtt`, `.dd2vtt` and `.df2vtt` import walls, doors, windows and
  lights; malformed input is reported before anything is applied; failure is atomic; an
  independent player session sees the right visibility; the scene survives an archive
  round trip.
- *Size*: M.

#### WP-3.2 Foundry world import (split into 3 PRs)
- *Human decision*: D6.
- *Goal*: a user uploads their own exported Foundry world or adventure and gets scenes,
  walls, lights, journals, tables and D&D actors.
- *Steps*:
  1. Research: document the export formats of the current Foundry version and which
     parts map to this model. Commit the mapping table. No code yet.
  2. Scenes, walls, lights, tiles, journals and tables.
  3. Actors and items for the D&D system, mapped to SRD records where they match and
     kept as custom content with provenance where they do not.
- *Done when*: the import produces a preview batch through the existing content-import
  review flow (`content-import-panel.tsx`), never a direct write; nothing is fetched
  from a network; an unmapped field is listed in the report, not dropped silently.
- *Fences*: user-supplied files only. Do not bundle or redistribute third-party
  content. Do not import code (modules, macros).
- *Size*: XL.

#### WP-3.3 Roll20 import
- *Steps*: first a one-day research note on what a user can export from Roll20 today
  and under which terms. Stop and ask before writing code.
- *Size*: S for the note; the rest depends on it.

#### WP-3.4 Character import
- *Start here*: `apps/web/src/character-import.ts`, `character-import-dialog.tsx`,
  `apps/api/src/character-import-compatibility.test.ts`,
  `docs/dogfood/known-issues.md` (the stated boundary for D&D Beyond).
- *Goal*: import a character from a file the player exported themselves.
- *Done when*: each supported format has fixtures; an imported sheet agrees with the
  server's own calculation or the differences are listed for the player to confirm.
- *Fences*: no scraping, no credentials, no proprietary content.
- *Size*: M.

**Phase 3 gate:** one outside GM has moved a real campaign in and run a session.

---

### Phase 4: AI that earns its place

Rule 5 in section 2 governs this phase. Read `docs/ai/overview.md` first. Every WP
here must also satisfy:

- **Off unless enabled** for the campaign, and usable with AI disabled.
- **Same permissions as the caller.** The agent sees only what the calling user may
  see, and acts only through typed tools.
- **Both modes work.** Manual mode produces a reviewable proposal; automatic mode
  applies it; both are tested with the loopback provider.
- **Generated content is labelled** with provenance on the record.
- **An evaluation exists** before the feature is called done: a fixed set of inputs
  with expected properties, run with the loopback provider in CI and with a real
  provider on demand, with results recorded.

#### WP-4.1 Open agent surface
- *Human decision*: D4.
- *Goal*: any agent or model can drive a table, and a self-hoster can use a local
  model.
- *Steps*:
  1. Document `POST /api/v1/mcp` with a worked example: connect, list tools, read a
     scene, make a proposal. Add it to the docs site.
  2. Add a provider package that speaks the OpenAI-compatible chat API with tool calls,
     configured by base URL, model and key. Follow
     `packages/codex-app-server-provider` for structure.
  3. Keep keys server-side and out of logs, archives and diagnostics exports.
- *Done when*: a contract test runs the same tool-call transcript through the new
  provider and the loopback provider; the security smoke test proves the key never
  appears in an archive or log.
- *Fences*: existing providers and their defaults are unchanged.
- *Size*: M.

#### WP-4.2 Evaluation harness
- *Goal*: one command runs every AI feature against fixed cases and prints a table.
- *Start here*: `GET|POST /api/v1/campaigns/{campaignId}/ai/evaluations`.
- *Done when*: `pnpm ai:eval` runs offline with the loopback provider in CI; a real
  provider can be selected by environment variable; results are written as JSON with
  the provider, model and date.
- *Size*: M. Do this before WP-4.3.

#### WP-4.3 Walls and doors from a map image
- *Goal*: the GM uploads a map image and gets proposed walls, doors and lights to
  accept, edit or discard.
- *Steps*: produce the same plan structure the Universal VTT importer uses, so review
  and apply are shared; show proposals as an overlay on the map; allow per-segment
  delete before apply.
- *Done when*: an evaluation set of at least ten maps with hand-made reference walls
  reports precision and recall; nothing is written until the GM applies; apply is one
  undoable command.
- *Depends on*: WP-3.1, WP-4.2.
- *Size*: L.

#### WP-4.4 Adventure PDF to playable campaign
- *Start here*: `apps/api/src/pdf-content-import.ts`, README section "AI PDF Content
  Import".
- *Goal*: from a user's PDF, propose scenes, encounters placed on those scenes,
  handouts and journal entries, linked to each other.
- *Done when*: output is a preview batch in the existing review flow with page
  citations on each record; rollback removes everything; the user's PDF text is sent
  only to the configured provider, and the disclosure text says so.
- *Fences*: user-provided files only; no bundled third-party content.
- *Size*: L.

#### WP-4.5 Session scribe
- *Human decision*: D5.
- *Goal*: after a session, a recap plus candidate facts (people, places, quests, loot),
  each linked to the chat line, roll or combat event it came from.
- *Start here*: `POST .../ai/session-recap`, `POST .../ai/memory/extract`,
  `campaign-memory-panel.tsx`, `session-recap.ts`.
- *Steps*: text sources first (chat, rolls, combat log, GM notes); candidates enter the
  existing approve or reject memory flow; separate GM-only and public recaps.
- *Done when*: a privacy test proves a public recap contains no whisper, GM note or
  hidden roll; each fact opens its source.
- *Size*: M. Audio transcription is a separate later WP after D5.

#### WP-4.6 Monster tactician
- *Goal*: on a GM-controlled creature's turn, the agent proposes that creature's move
  and action; the GM applies it with one click, or it applies itself in automatic mode.
- *Steps*: a new tool that reads the current combat and the acting creature's actions
  and calls the existing `use_actor_action`; offered only for combatants the caller
  controls; uses only what that creature could perceive.
- *Done when*: evaluation cases cover melee, ranged, a spell with a save, and "no legal
  action"; manual mode leaves a proposal and automatic mode commits with an undo entry;
  a test proves the agent was not sent hidden player data.
- *Depends on*: WP-4.2.
- *Size*: L.

#### WP-4.7 Rules referee with citations
- *Goal*: a player or GM asks a rules question and gets an answer that links to the
  compendium entries it used, or says the answer is not in the loaded rules.
- *Start here*: the `read_compendium` tool.
- *Done when*: an evaluation set of at least 50 questions with reference entries
  reports citation accuracy; every answer has at least one citation or an explicit
  "not found".
- *Size*: M.

**Phase 4 gate:** each feature has a recorded evaluation and has been used in a real
session with AI enabled by choice.

---

### Phase 5: ecosystem

#### WP-5.1 A second rules system through the public SDK
- *Human decision*: D3.
- *Goal*: a second system built only with `declarative-v1` and public packages, with
  no engine source edits.
- *Start here*: `docs/system-sdk/declarative-v1.md`, the "third party cannot deliver a
  playable rules system" section of `docs/verification/competitive-critic-2026-09-06.md`.
- *Steps*: write down every place the format falls short while building it; extend the
  format through separate small PRs rather than special-casing the system in the host.
- *Done when*: an isolated consumer project installs the system under a new ID,
  creates a valid character, rejects invalid state, rolls, spends a resource, and
  survives reload and archive round trip.
- *Fences*: no content without a confirmed licence. Rights review before any text is
  committed.
- *Size*: XL.

#### WP-5.2 Plugin registry
- *Human decision*: D7.
- *Goal*: a user browses, installs, updates and removes plugins from inside the app.
- *Steps*: a signed static index; install by exact version and checksum; show the
  permissions a plugin requests before install (`docs/plugin-sdk/overview.md`).
- *Done when*: tampering with a package fails the checksum; removing a plugin removes
  its storage after confirmation; plugins still cannot touch storage directly.
- *Size*: L.

#### WP-5.3 Translations
- *Goal*: all interface strings come from message catalogues; English plus one
  complete second language.
- *Steps*: pick a small message-format library; extract strings by feature module, not
  in one PR; add a lint rule against new literal UI strings.
- *Depends on*: WP-1.1.
- *Size*: XL. Split by feature module.

#### WP-5.4 Install and release
- *Goal*: a new user is playing within ten minutes on desktop or with one Docker
  command.
- *Start here*: `docs/verification/desktop-packaged-2026-09-06.md`,
  `.github/workflows/desktop-release.yml`, `docs/deployment/self-hosting.md`.
- *Done when*: signed Windows and macOS installers start cleanly on a machine that has
  never run the app; a person other than the implementer follows the self-hosting page
  and reaches a table without help; a public read-only demo exists.
- *Human decision*: signing certificates and a demo host belong to the owner.
- *Size*: L.

---

## 6. Order and tracking

Tick a box in the PR that completes the WP.

| Done | WP | Title | Size | Depends on |
|---|---|---|---|---|
| [x] | 0.1 | Land the PR stack | S | |
| [ ] | 0.2 | Confirm unit suites on Linux and Windows | S | |
| [ ] | 0.3 | Browser suite independent of run order | M | |
| [ ] | 0.4 | Faster, clearer CI | S | |
| [ ] | 0.5 | Three real sessions | M | |
| [ ] | 1.1 | Split `App.tsx` | L | Phase 0 |
| [ ] | 1.2 | URL routing | M | 1.1 |
| [ ] | 1.3 | Chat dock | M | 1.1 |
| [ ] | 1.4 | Type scale and colour tokens | L | Phase 0 |
| [ ] | 1.5 | Board renderer | XL | D1 |
| [ ] | 2.1 | Hex grids | L | 1.5 |
| [ ] | 2.2 | Foreground layer | M | 1.5 |
| [ ] | 2.3 | Multi-level scenes | XL | 2.2 |
| [ ] | 2.4 | Rollable tables | M | Phase 1 |
| [ ] | 2.5 | Card decks | M | Phase 1 |
| [ ] | 2.6 | Animated and video maps | M | 1.5 |
| [ ] | 2.7 | Player display mode | M | Phase 1 |
| [ ] | 2.8 | Phone player sheet | L | 1.1 |
| [ ] | 2.9 | Voice and video by integration | M | D2 |
| [ ] | 2.10 | Finish the action flow | M | 1.1 |
| [ ] | 3.1 | Finish Universal VTT import | M | Phase 0 |
| [ ] | 3.2 | Foundry world import | XL | D6, 2.4 |
| [ ] | 3.3 | Roll20 import research | S | D6 |
| [ ] | 3.4 | Character import | M | D6 |
| [ ] | 4.1 | Open agent surface | M | D4 |
| [ ] | 4.2 | Evaluation harness | M | 4.1 |
| [ ] | 4.3 | Walls from a map image | L | 3.1, 4.2 |
| [ ] | 4.4 | Adventure PDF to campaign | L | 4.2 |
| [ ] | 4.5 | Session scribe | M | 4.2, D5 |
| [ ] | 4.6 | Monster tactician | L | 4.2 |
| [ ] | 4.7 | Rules referee | M | 4.2 |
| [ ] | 5.1 | Second rules system | XL | D3 |
| [ ] | 5.2 | Plugin registry | L | D7 |
| [ ] | 5.3 | Translations | XL | 1.1 |
| [ ] | 5.4 | Install and release | L | Phase 0 |

**What can run in parallel once Phase 0 is done:** WP-1.1 and WP-1.4 touch different
files. WP-3.1, WP-4.1 and WP-5.4 are independent of the web restructure. Inside
Phase 2, WP-2.4, WP-2.5 and WP-2.7 are independent of each other.

**If time is short, the highest value path is:** Phase 0, WP-1.1, WP-1.5, WP-3.1,
WP-4.1, WP-4.2, WP-4.3, WP-2.7, WP-2.8. That gives a fast board, map import, one AI
feature no competitor has, and the two cheapest ways to reach more tables.

## 7. What this plan deliberately leaves out

- A marketplace with payments.
- Building voice or video transport.
- A 3D board.
- Bundling any rules or adventure content beyond the SRD without a confirmed licence.
- High-availability or multi-region hosting.
- Automating every spell and feature. Manual rulings stay first-class and labelled.

## 8. Pull request template

```markdown
## WP-<id>: <title>

## Why
<one or two sentences>

## What changed
<bullets, by behaviour, not by file>

## Decisions
<link to docs/decisions/ file, or "none">

## Verification
- pnpm check: <result>
- Unit: <passed>/<total> per package touched
- Browser: <specs run>, <passed>/<total>
- Failures: <each one, and whether it also fails on the base branch>

## Not in this PR
<anything a reader might assume is included>
```
