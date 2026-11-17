# Plan A: Split App.tsx into feature modules (zero behavior change)

**Goal:** `apps/web/src/App.tsx` is ~18.5k lines and every feature lands in it. Split
it into feature modules so future work (human or agent) can happen in parallel files.
This is a **pure restructure**: code moves verbatim, imports/exports added, nothing
else changes. If you find a bug while moving code, note it in your report — do NOT
fix it in this pass.

**Scope fence:** you may modify files under `apps/web/src/` ONLY. Do not touch
`apps/api/`, `packages/`, or any config. Another agent is working in `apps/api/`
concurrently — if an API test or dev-server port behaves oddly, ignore it; your
gates are web-only.

## Tripwires (in addition to those in PLAN-xp-level-loop.md, which apply verbatim)

- `noUnusedLocals` is enforced: every move must carry exactly the imports it needs.
- Web must not import `@open-tabletop/system-sdk`.
- **Source-pinning tests** (they read source files as text) will break as code moves.
  Update them by REPOINTING the file they read to the new module — never weaken or
  delete an assertion. Affected test files include (verify by grepping
  `readFileSync` in `apps/web/src/*.test.ts`): `desktop-layout-regressions.test.ts`,
  `actor-panel-layout.test.ts`, `chat-layout.test.ts`, `character-creator.test.ts`,
  `xp-progression.test.ts`, `loot-flow.test.ts`, `session-recap.test.ts`,
  `realtime-fast-path.test.ts`. Some assert ORDERING within one file (e.g.
  chat-layout checks index positions) — keep the moved code's internal order intact
  so those still hold within the new file.
- `styles.css` is OUT OF SCOPE. Do not split or reorder CSS.
- Baseline green: web 163 tests / 29 files, typecheck clean, build clean. Finish at
  163+ (same tests, possibly reorganized reads), never fewer assertions.
- You cannot write to `.git`. No commits — leave the tree ready for review, print
  the commit message you would use (with the `Co-Authored-By: Claude Fable 5
  <noreply@anthropic.com>` trailer).

## File conventions (match the existing repo style)

Flat files in `apps/web/src/`, kebab-case. Components in `.tsx`, pure helpers in
`.ts`. Existing examples to imitate: `actor-rails.ts`, `board-geometry.ts`,
`realtime-refresh.ts`. Named exports only. Keep each component's props type in the
component's file, exported if App.tsx needs it.

## Method — staged, gated extraction

**Stage 0 — inventory.** Build a map of App.tsx: every module-scope declaration
(`^function`, `^const`, `^type`, `^interface` outside the App component), its line
span, and which components use it. A small node/python script over the file is fine
(write it to the scratch/tmp dir, not the repo). Decide the dependency order from
this inventory, not from guesses.

**Stage 1 — shared pure helpers and types.** Move module-scope helpers used by 2+
components into topic files, e.g.:
- `sheet-format.ts` — `formatNumber`, `formatDateTime`, `titleCaseLabel`,
  `prettyOriginId`, `slugId`, `errorMessage`, and similar pure formatters.
- `actor-sheet-data.ts` — `actorHitPoints`, `actorConditionLabels`,
  `actorResourceLabels`, `formatActorConditions`, `parseActorConditions`,
  `quickActorConditionIds`, damage-trait helpers, action-option helpers.
- `token-drag.ts` — `itemDropMime`, `writeItemDropData`, `readItemDropData`,
  `hasItemDropData`, token drop mime/payload helpers.
Group by cohesion; 2–4 helper files is right, 10 is too many. Gate after this stage:
typecheck + full web tests (update pins that referenced moved code).

**Stage 2 — leaf components, smallest first.** One file per component (plus its
private helpers that nothing else uses). Suggested targets and names:
- `hp-bar.tsx` (HpBar)
- `character-creator-dialog.tsx` (CharacterCreatorDialog + prettyOriginId if private)
- `journal-panel.tsx` (JournalPanel)
- `combat-panel.tsx` (CombatPanel + nextCombatTurnPosition + combat formatters)
- `chat-rail.tsx` (ChatRail, ChatComposer, ChatMessageItem, RollMessageCard —
  keep them together in one file to preserve chat-layout.test.ts ordering pins)
- `sdk-panel.tsx` (SdkPanel)
- `content-import-panel.tsx` (ContentImportPanel)
- `actor-panel.tsx` (ActorPanel)
- `scene-canvas.tsx` (SceneCanvas and its internal drag/resize/annotation logic —
  this is the biggest move; do it LAST)
- `ai-panel.tsx`, plus any admin/manage panel components you find.
Gate after EVERY component move: `pnpm --filter @open-tabletop/web typecheck` and
the full web test run. Never move two components between gates until you've done
three consecutive clean moves; then you may batch two small ones.

**Stage 3 — what stays in App.tsx.** The `App()` component itself: state, effects,
mutation functions (`refresh`, the `apply*ToSnapshot` helpers, `updateActor*`,
board sync, realtime wiring), and the JSX composition roots. Hooks like
`useMovablePanel` may move to `use-movable-panel.ts` if trivially separable.

**Size targets:** App.tsx ≤ 9,000 lines; no new module > 3,500 lines. If a target
forces an awkward split, prefer the awkward line count and say so in the report.

## Verification

After the final stage: typecheck, full web tests, `pnpm --filter @open-tabletop/web build`,
then a live smoke with agent-browser (dev servers per prior plans — the API on 4000
may be restarted by the other agent; retry once if the login fails): sign in as Demo
GM, confirm the board renders tokens, click a token (selection frame appears), open
the sheet (Sheet button), click an HP stepper (value changes), switch to Chat and
Combat tabs (no blank panels), open the character creator and close it. Any console
error visible in `agent-browser network console` that did not exist before the split
is a blocker.

## Report

(a) before/after line counts for App.tsx and each new module, (b) list of pin tests
repointed, (c) any bugs noticed-but-not-fixed, (d) the commit message.
