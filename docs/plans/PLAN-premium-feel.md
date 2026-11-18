# Plan: make the table feel premium

Written 2026-11-12 against `main` at `2250136`. Sixteen pull requests in six tracks. Each PR is independently mergeable unless a dependency is listed.

**Goal:** a new user who clicks **Explore demo** should see something they want to show a friend, and a table that has played for an hour should feel that the app never made them wait and never looked unfinished.

## What this plan is based on

I ran the app from `main` in headless Chrome at 1440 x 900 and 390 x 800, took screenshots of sign-in, the live table, a dice roll, the command palette, the shortcut sheet, Prep, and Manage, and read the code behind each. Measurements come from the frame-time harness in PR #79.

Already in the app and good, so **not** in this plan: sign-in page, command palette (Ctrl+K), keyboard shortcut sheet (?), two themes (midnight, ember), animated 3D dice with an off switch, token health bars, turn rings and condition chips, map pings, the handout library, first-session steps, token move tweening, reduced-motion support.

What looked or felt unfinished:

| # | Observation | Evidence |
| --- | --- | --- |
| 1 | The demo opens on an empty grid: no map art, tokens are two initials in a circle, one flat yellow disc for light. | Screenshot of Live Table; the seeded campaign has 0 assets. |
| 2 | Light and vision have hard edges and no movement. Doors and walls are thick bars. | Screenshot; no flicker or fade rules in the stylesheet. |
| 3 | Keyboard token moves and zoom drop frames on a large scene. | `pnpm perf:board`: 14 to 24 slow frames per 10 key presses, 9 to 19 per zoom, with either renderer. `scene-canvas.tsx` (2,640 lines) and `App.tsx` (11,244 lines, 166 `useState`) contained no `memo`. |
| 4 | Dice come to rest over the logo, the rail and the inspector tabs, not on the table. One roll is reported in four places (a "Rolling dice..." toast that outlives the roll, a pill on the map, the rail status line, the chat). No sound. | Screenshots 450 ms and 2 s after a roll. `.dice-cast-overlay` is `position: fixed; inset: 0`. |
| 5 | The inspector's tabs wrap to two rows on the live table and three in Prep. Every chat message shows a moderation dropdown. Controls are mostly native `<select>` (27 in `App.tsx` alone). | Screenshots; grep. |
| 6 | The stylesheet has 954 hard-coded colours against 111 variables, 43 distinct font sizes (173 uses of 11px, 136 of 12px), 26 distinct durations, and two stacked `:root` palettes (lines 1 and ~4611). | grep on `apps/web/src/styles.css` (17,463 lines). |
| 7 | Empty states are a line of grey text ("No adversaries yet."). Campaign load is a heading. | Screenshots; `App.tsx` ~8773. |

Not checked: a real GPU, Safari, Firefox, a screen reader pass, or real play with several people. Where a PR's value depends on one of those, it says so.

## Owner decisions needed before the PRs that depend on them

| ID | Decision | Recommendation | Blocks |
| --- | --- | --- | --- |
| P1 | Where the demo's map and portrait art comes from. It must be art the project may redistribute under its licence. | Art you commission or generate yourself, with a notice file. An agent must not download art. | PR 3 |
| P2 | Interface sounds on or off by default. | On, quiet, with a mute in the rail and in preferences. | PR 8 |
| P3 | Minimum text size. Raising 11px text costs some density. | 12px minimum, 13px body, 11px only for uppercase labels. | PR 9 to 12 |
| P4 | Token nameplates: always shown, or on hover and selection. | Hover, selection and "show all" while Alt is held. | PR 4 |

## Rules for every PR

These repeat the tripwires in `docs/plans/PLAN-xp-level-loop.md` and `AGENTS.md`, plus what PRs #71 to #80 learned.

1. One PR per item below, branched from `main`, opened against `main`. Do not combine items.
2. Do not modify, restrict or redesign AI agent behaviour. None of these PRs needs to. The AI board capture snapshots the board's DOM; if you change what is in the board, run the capture and compare.
3. Player privacy is not a styling concern. Do not change what is rendered for a player: fog, vision, hidden tokens, GM-only vitals (`showTokenVitals` in `scene-canvas.tsx`).
4. `App.tsx` must stay at or under 11,250 lines (`app-architecture-budget.test.ts`). It has almost no room. New code goes in new modules with a one or two line hook-up.
5. About 46 unit tests read source files as text. When code moves, repoint the test to the new file. Never weaken or delete an assertion.
6. `styles.css` is layered: later blocks override earlier ones for the same selector. Do not reorder it. New feature CSS goes in its own file imported by its component (as `initiative-strip.css` does).
7. `--ink` is the dark colour. Text on dark surfaces uses `var(--paper)`; muted text uses `var(--muted)`.
8. Lint is `tsc --noEmit` with `noUnusedLocals`. The web app must not import `@open-tabletop/system-sdk`, and must not import runtime values from `@open-tabletop/api-contracts` (types only).
9. No new API routes unless the PR says so. A new route needs the OpenAPI contract, the client, and the access and coverage matrices in `apps/api/src/app.test.ts`.
10. Respect `prefers-reduced-motion` and the user's reduced-motion preference in anything that moves, and the `saveData` check the dice already use.
11. Every PR states what was measured or screenshotted, on what machine, and what was not checked.

Verification for every PR: `pnpm lint`, `pnpm typecheck`, `pnpm e2e:typecheck`, `pnpm --filter @open-tabletop/web test`, the browser specs named in the PR, then `pnpm e2e`. Known noise: `tests/e2e/ai-provider-concurrency.spec.ts` fails about one run in four on `main` and takes later specs with it; re-run before concluding a failure is yours, and say so in the PR.

## Order

```
Track A  responsiveness      PR 1 -> PR 2
Track B  first impression    PR 3 (needs P1), PR 4 (needs P4)
Track C  light               PR 5 -> PR 6
Track D  dice and sound      PR 7 -> PR 8 (needs P2)
Track E  one hand            PR 9 (needs P3) -> PR 10, 11, 12 in any order; PR 13 after PR 9
Track F  flow                PR 14, PR 15 (after PR 9), PR 16
```

Tracks are independent of each other. PR #79 must be merged first for Tracks A and C. If only five get done, do PR 1, 3, 5, 9 and 14.

---

## Track A: responsiveness

### PR 1: stop the board re-rendering when nothing on it changed

**Why.** A token move or a zoom step re-renders the whole board component: every token, 300 wall lines, fog, vision, annotations. Children are positioned in percentages and SVG `viewBox` units, so a zoom changes only the board container's size and should not re-render them at all.

**Scope fence.** `apps/web/src/scene-canvas.tsx`, new modules beside it, their tests. No `App.tsx` changes beyond stabilising callbacks passed to the board.

**Steps.**
1. Record a baseline: `OTTE_PERF_TRACE=1 pnpm perf:board` (three runs), and a React Profiler recording of one keyboard move and one zoom step. Put the numbers in the PR.
2. Extract the token button (around line 1982) into a memoised `BoardToken` component in its own file. Its props must be primitives or stable references; derive per-token values (`selected`, turn state, vitals, conditions) in the parent and pass them as scalars.
3. Extract the static layers into memoised components keyed on the data they draw: walls, lighting and darkness polygons, fog, annotations, grid.
4. Make the handlers the board passes down stable (`useCallback` with refs for changing values, as the gesture code already does).
5. Confirm with the profiler that a zoom step renders the board container only, and a token move renders that token only.

**Done when.** On the PR #79 fixture, three runs each: keyboard move at most 5 slow frames (now 14 to 24); wheel zoom at most 5 (now 9 to 19); pan and token drag no worse. `map-controls`, `board-canvas-renderer`, `accessibility`, `gridless-scenes`, `competitive-map-*` and `mobile` specs pass unchanged. The VM-extracted tests (`scene-canvas-pointer-lifecycle.test.ts`, `board-keyboard.test.ts`) pass with their harness repointed if code moved.

**Outcome (2026-11-16).** Done as far as the board goes; the frame targets were not met, because the premise was only partly right. Profiling showed one keyboard move causes about five renders of the whole app, and the board was a little over 40% of the React work in them. Memoising tokens and static layers cut JavaScript time for ten moves from 622 ms to 385 ms, and one move now renders the moved token alone instead of all of them (144 token renders before, on a 24-token scene in a development build), but slow frames only moved from 14, 15, 17 to 13, 7, 18 on a machine without a GPU. Zoom did not change: its cost is layout and redrawing light glows on the canvas, not React. The targets move to PR 2. Details are in `docs/engineering/board-performance.md`.

**Not in scope.** Changing how state is stored. Drawing tokens on canvas.

**Size.** Medium. The risk is the source-text tests, not the logic.

### PR 2: keep app-wide re-renders away from the board and the inspector

**Why.** `App()` owns the snapshot and 166 pieces of state, so any change re-renders the root and everything that is not memoised. PR 1 protects the board; this protects the rest and removes the cost at its source.

**Depends on.** PR 1 merged. Read `docs/plans/PLAN-split-app.md` first; this continues it.

**What PR 1's profile already shows.** After PR 1, ten keyboard moves spend about 300 ms in React over roughly fifty renders of `App()`. The largest named costs are `ScenePartyPlacementControl` (36 ms; it recomputes party placements on every render), `ActorPanel` (31 ms), the `App` function body itself (24 ms) and attribute diffing for everything outside the board (48 ms). Each render is then followed by style, layout, paint and commit, which together cost more than the JavaScript.

**Steps.**
0. Count the renders one action causes and remove the ones that change nothing: an optimistic update, the mutation's response, the realtime echo and the reconciling reload each set state separately. Apply server reconciliation inside `startTransition` so it is time-sliced and never blocks a frame; keep the optimistic update urgent.
1. Profile again after PR 1 and list the five most expensive components on a token move, a chat message, and an HP change.
2. Move the snapshot into a small store module with `useSyncExternalStore` selectors (`useSnapshot(selector)`). `App()` keeps a setter; panels subscribe to the slice they draw. No library.
3. Convert the five components from step 1 to selectors and `memo`. Stop there.
4. Add a unit test that a token position change does not notify a subscriber that selected only chat messages.

**Done when.** The same harness shows keyboard move at most 5 slow frames and long-task time under 50 ms, and one keyboard move causes at most two renders of `App()`. Zoom is a separate problem (layout-based zoom and canvas glow redraws) and is not a target here. A profiler recording of a chat message arriving shows the board not rendering. `App.tsx` is shorter than before.

**Outcome (2026-11-16).** Deduplication came first, followed by a profile of keyboard moves, incoming chat, and HP changes. Vision reconciliation now has a scene- and user-scoped store with selectors for the board and layer controls. The full snapshot stays in React state so urgent updates retain React's batching. Stable props isolate Chat and Actors, and party placement reuses its calculation when its inputs are unchanged. See [the measurements](../engineering/board-performance.md#snapshot-reconciliation-and-panel-renders).

**Not in scope.** Converting every panel. URL routing. A state library.

**Size.** Large. Do it in the smallest slices that keep the suite green; open the PR as soon as the store and the first converted component work.

---

## Track B: first impression

### PR 3: a demo scene worth exploring (needs P1)

**Why.** **Explore demo** is the product's shop window and it shows an empty grid.

**Steps.**
1. The owner supplies, under the chosen licence: one battle map (about 2800 x 2100, WebP), four to six token portraits (512 px, transparent), and a `NOTICE` describing their origin.
2. Find how demo data is seeded (`packages/core/src/state.ts`, `camp_demo`) and how an upload becomes an asset (the upload route and its renditions). Seed the demo's assets through that same ingestion path at first start, so hashes, renditions and quotas are real. Do not hand-write asset records.
3. Give the seeded scene the map as its background with a calibrated grid, walls and two doors traced to the map, three lights (one coloured), fog over the unexplored half, portraits on the party tokens, and three adversaries placed and added to a ready encounter.
4. Make the seed idempotent and keep it out of production: it runs only where the demo seed already runs.
5. Update tests and docs that state the demo's contents (the e2e suite assumes specific tokens and counts; search for `camp_demo`, `Valen Ash`, `scn_vault_entry`).

**Done when.** A fresh start, **Explore demo**, shows the map, lit, with portraits, in under two seconds on a local machine. Archive export and import of the demo campaign round-trips the assets. `pnpm e2e` passes; any spec that changed says why. Repository size grows by less than 3 MB.

**Not in scope.** An art pipeline, a marketplace, generating art at runtime.

**Size.** Medium, most of it in keeping the e2e suite's assumptions true. Expect many specs to depend on the demo's exact contents; prefer adding to the demo over changing what is there.

### PR 4: tokens that look finished (needs P4)

**Why.** A token without art is two letters in a flat circle with square resize handles. Condition chips are text.

**Scope fence.** `BoardToken` (or the token block in `scene-canvas.tsx` if PR 1 has not landed), a new `board-token.css`, tests. No data model change.

**Steps.**
1. Frame: a ring coloured by disposition around the portrait or monogram, a soft drop shadow, and a 2 px selection ring in place of the box outline. Resize handles appear only when the token is selected and the user can resize.
2. No-art fallback: a deterministic gradient from the token id behind the monogram, so a board of artless tokens is still told apart at a glance.
3. Health: keep the bar's rules exactly (`showTokenVitals`), restyle it as an arc on the ring.
4. Conditions: an icon per known condition with the name in the accessible description and the tooltip, text chip fallback for unknown ones, "+N" overflow kept.
5. Nameplates per P4.
6. Keep every `aria-*` attribute and the button element.

**Done when.** Screenshots at 50%, 100% and 300% zoom on both themes, with and without art, for party, adversary and neutral tokens, in the PR. Contrast of ring against map checked on a light and a dark map. `accessibility`, `map-controls`, `mobile` and `board-canvas-renderer` specs pass. The player view shows no vitals it did not show before (add a browser assertion).

**Not in scope.** Token art upload, animated tokens, rotation handles.

**Size.** Medium.

---

## Track C: light

### PR 5: soft light and fades (visual only)

**Why.** Light is where a virtual tabletop looks expensive or cheap. Today the visible light area is a hard-edged polygon and fog changes snap.

**Depends on.** PR #79 merged.

**Steps.**
1. Feather the edge of the lighting and darkness polygons (`.lighting-layer`, `.darkness-layer`, `scene-canvas.tsx` ~1735) with an SVG blur or gradient mask, a few pixels wide in screen space. Measure pan and zoom before and after; a filter over a full-board SVG is exactly what PR #79 removed for the map, so if the harness regresses, draw the feathered polygons on the canvas layer instead.
2. Fade fog reveal and hide over about 200 ms.
3. Doors: draw a door glyph at the door's midpoint with open, closed and locked states in place of the bar-and-knob.
4. Do not change which pixels are hidden from a player. The feather must sit inside the lit area, not extend vision.

**Done when.** `pnpm perf:board` pan and zoom are within noise of before. A browser test proves a token just outside a player's vision is still not rendered. Before and after screenshots in the PR. Reduced motion removes the fades.

**Not in scope.** New light types, coloured shadows, changes to the vision algorithm.

**Size.** Medium.

### PR 6: light that flickers

**Why.** A torch that breathes sells the scene more than any other single effect.

**Depends on.** PR 5.

**Steps.**
1. Add `animation?: "none" | "flicker" | "pulse"` to `LightSource` in `packages/core`, the OpenAPI schema, validation, and the archive round trip. Default absent means none, so existing data is unchanged.
2. Add the choice to the light editor.
3. Animate only the glow's radius and opacity on the canvas layer, on `requestAnimationFrame`, paused when the tab is hidden, when no animated light is in view, and under reduced motion. Do not animate vision polygons.
4. Cap the cost: one canvas redraw of the glow layer per frame at most; measure with the harness with 12 animated lights.

**Done when.** Idle frame time with 12 flickering lights in view stays under 16.7 ms median on the harness machine, and zero work happens with none in view. Contract, client and archive tests cover the new field.

**Not in scope.** Sound, particle effects, per-light colour cycling.

**Size.** Medium. This is the only PR in the plan that changes the data model.

---

## Track D: dice and sound

### PR 7: dice land on the table and report once

**Why.** The dice exist and look good, but they rest on top of the navigation and the roll is announced four times.

**Scope fence.** `apps/web/src/dice-3d.ts`, the dice cast overlay markup and CSS (`styles.css` ~11010), the effect in `App.tsx` ~2387, tests.

**Steps.**
1. Throw dice into the board's visible rectangle when a board is on screen, and into the centre of the main column otherwise. Compute the target rectangle from the board viewport element; keep `pointer-events: none`.
2. One result callout: dice settle, the total appears beside them with the formula, then both fade. Remove the "Rolling dice..." toast for rolls that are cast, and keep the rail status line and chat entry as the record.
3. A natural 20 or natural 1 on a d20 (use `rollHighlight` in `dice-insights.ts`) gets a distinct colour and a slightly longer hold. No screen shake.
4. Keep the limits: at most the two newest rolls cast, reduced motion and `saveData` show the callout without animation, the "text-only dice" setting disables it.
5. Private and GM-only rolls must cast only for those allowed to see them. Add a browser test with a GM and a player page.

**Done when.** Screenshots at 450 ms and 2 s after a roll show dice inside the board rectangle on desktop and phone. A roll produces at most one transient message. The two-page privacy test passes.

**Not in scope.** Physics simulation, dice skins, sound (PR 8).

**Size.** Small to medium.

### PR 8: interface sounds (needs P2)

**Why.** Sound is half of what makes dice feel like dice, and a quiet chime on "your turn" is something players notice when it is missing elsewhere.

**Steps.**
1. A small `interface-sounds.ts` that synthesises sounds with the Web Audio API (noise bursts and short tones). No audio files, so no licences and no downloads.
2. Three cues only: dice settle, your turn begins, a ping lands. Each under 400 ms.
3. A preference (`interfaceSounds`, with volume) stored with the other profile preferences, a mute toggle in the rail, default per P2. Nothing plays before the first user gesture, and nothing plays in a hidden tab.
4. Route volume through the same master control the soundboard uses, if there is one, so a GM's music and the cues do not fight.

**Done when.** Unit tests cover the preference and "no sound before a gesture". A browser test asserts no `AudioContext` is created while sounds are off. Listened to on speakers and headphones by a person; say who in the PR.

**Not in scope.** Ambient audio, per-user sound packs, sounds for chat.

**Size.** Small.

---

## Track E: looks like one hand made it

### PR 9: design tokens and a ratchet (needs P3)

**Why.** 954 literal colours and 43 font sizes are why screens feel slightly different from each other, and why a third theme would be painful.

**Steps.**
1. Add `apps/web/src/design-tokens.css`, imported first: a colour scale per role (surface 0 to 3, line, line-strong, text, text-muted, accent, success, warning, danger, info), a type scale of seven steps, spacing on a 4 px grid, three radii, three elevations, and motion (three durations, two easings). Define both themes there.
2. Map the existing variables (`--ink`, `--paper`, `--muted`, `--line`, and the rest) to the new tokens so nothing changes visually yet. Merge the two `:root` blocks' intent into the token file without reordering `styles.css`.
3. Add `design-token-budget.test.ts`: counts literal colours, distinct `font-size` values and distinct durations across the web CSS, and fails if any count rises above the number recorded in the test. Each later PR lowers the recorded numbers.
4. Document the tokens in `docs/engineering/design-tokens.md`: what each is for, with a rule for choosing.

**Done when.** No screenshot differs from `main` by more than rounding (compare sign-in, live table, Prep, Manage, both themes, desktop and phone). The budget test passes at the current counts.

**Not in scope.** Converting existing rules. A third theme. A component library.

**Size.** Small. It is the foundation for PR 10 to 13 and PR 15.

### PR 10, 11, 12: adopt the tokens, one area per PR

- **PR 10: inspector and sheets** (`actor-panel`, sheets, compendium, chat rail).
- **PR 11: board chrome and rail** (toolbar, dock, top bar, rail, initiative strip, toasts, floating panels).
- **PR 12: Manage, Prep, dialogs and sign-in.**

**Steps for each.** Replace literal colours, font sizes, radii, shadows and durations in that area's rules with tokens. Where two near-identical values exist, pick the token and accept the one-pixel change. Apply P3 to text sizes. Lower the numbers in the budget test.

**Done when (each).** Before and after screenshots of every screen in the area on both themes and two widths. Text contrast at least 4.5:1 for body text, checked with the browser's accessibility tooling on the screens touched. The budget numbers go down and the PR states by how much. Target after all three: under 150 literal colours, 8 font sizes, 5 durations.

**Size.** Each medium and mechanical. Suitable for a cheaper agent with the token document in hand; review the screenshots, not the diff.

### PR 13: one look for dropdowns and form controls

**Why.** Native `<select>` elements with the operating system's chrome sit beside custom buttons throughout.

**Depends on.** PR 9.

**Steps.** Style native selects, inputs, checkboxes and textareas once (`appearance: none`, token colours, a chevron, focus ring, disabled state) in a `form-controls.css`. Keep them native elements: keyboard and screen-reader behaviour stays the platform's. Remove per-screen overrides that the shared rules replace.

**Done when.** Screenshots of the session switcher, dice visibility, saved formulas, campaign settings and the character creator on Chrome and, if available, Firefox and Safari. `accessibility.spec.ts` passes.

**Not in scope.** A custom listbox component.

**Size.** Small.

---

## Track F: flow

### PR 14: an inspector that does not wrap

**Why.** Seven tabs on two rows, ten on three, and a moderation control on every chat message are the busiest part of the screen.

**Scope fence.** `workspace-navigation.tsx` (the tab list at ~192), `chat-rail.tsx`, their CSS and tests.

**Steps.**
1. One row of tabs. Show as many as fit, with icons and labels; the rest go into a "More" menu that remembers the last one chosen. The active tab is always visible. Keep `role="tablist"` semantics and arrow-key movement; the More menu is a menu button whose items activate tabs.
2. Chat: move moderation, reply and delete into one "more actions" menu on the message; show the moderation state as a small badge only when it is not the default.
3. Ability rows: keep both actions, but as one compact control per row so the list reads as a list.

**Done when.** At 1440, 1280 and 1024 wide, in Live Table and Prep, tabs are on one row (screenshots). Every tab is reachable by keyboard and named for screen readers. `accessibility.spec.ts` and the chat and layout source tests pass with updates explained.

**Not in scope.** Reordering or removing panels. A chat dock.

**Size.** Medium.

### PR 15: one motion language

**Depends on.** PR 9.

**Steps.** Use the motion tokens for the things that appear and disappear: floating panels, menus, toasts, dialogs, the palette, tab content. One enter (fade and 4 px rise, short), one exit (fade, shorter), no bounce. Replace the 26 ad hoc durations where they are in these components. All of it off under reduced motion.

**Done when.** A screen recording in the PR. No interaction waits on an animation (nothing blocks input for its duration). The budget test's duration count goes down.

**Size.** Small.

### PR 16: empty and loading states

**Steps.**
1. One `EmptyState` component: icon, one sentence, one primary action. Use it for the lists that are empty in a new campaign (adversaries, assets, journal, handouts, encounters, chat). The action must be the real next step ("Add from compendium"), and must respect permissions: a player without the permission sees the sentence and no button.
2. Campaign load: show the app frame (rail, top bar, panel outlines) with placeholders in place of the heading-only screen, and keep the existing error and offline messages.
3. Scene switch: keep the previous scene visible until the next is ready, with a thin progress line, so the board never flashes empty.

**Done when.** Screenshots of each empty state for a GM and a player. Loading placeholders do not shift layout when content arrives (measure cumulative layout shift on load in the browser spec; it should be under 0.05).

**Size.** Medium.

---

## Tracking

| PR | Title | Needs | Status |
| --- | --- | --- | --- |
| 1 | Board does not re-render when nothing on it changed | #79 | Opened 2026-11-16; frame targets moved to PR 2 |
| 2 | Deduplicate snapshot writes and isolate panels | PR 1 | Implemented with scoped vision selectors |
| 3 | Demo scene worth exploring | P1 | |
| 4 | Tokens that look finished | P4 | |
| 5 | Soft light and fades | #79 | |
| 6 | Light that flickers | PR 5 | |
| 7 | Dice land on the table and report once | | |
| 8 | Interface sounds | P2 | |
| 9 | Design tokens and a ratchet | P3 | |
| 10 | Tokens: inspector and sheets | PR 9 | |
| 11 | Tokens: board chrome and rail | PR 9 | |
| 12 | Tokens: Manage, Prep, dialogs, sign-in | PR 9 | |
| 13 | Form controls | PR 9 | |
| 14 | Inspector that does not wrap | | |
| 15 | One motion language | PR 9 | |
| 16 | Empty and loading states | | |

## PR description template

```
## What this does
## What it looked or measured like before (screenshot or numbers, machine)
## What it looks or measures like after
## What stays the same (privacy, AI capture, accessibility)
## Verification (commands run and results; failures and whether they reproduce on main)
## Not checked
## Not done
```
