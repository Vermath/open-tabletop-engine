# Plan C: Player-seat polish — reachable Level Up, overlay ghost, seat audit

**Prerequisite:** runs AFTER the App.tsx split (PLAN-split-app.md) has landed. The
web code now lives in feature modules (`sdk-panel.tsx`, `scene-canvas.tsx`,
`actor-sheet-data.ts`, etc.). NOTE: the `ActorPanel` component itself still lives in
`App.tsx` (App.tsx is ~8.9k lines: the App() root plus ActorPanel). Confirm the
split exists before starting (App.tsx ≤ ~9k lines); if it does not, STOP and report.

**Scope fence:** `apps/web/src/` only. All tripwires from PLAN-xp-level-loop.md
apply (no SDK imports in web, noUnusedLocals, `--paper` not `--ink`, source-pin
tests, no `.git` writes/commits, baseline: all web tests green before you start —
record the count).

## Part 1 — Level Up reachable from the sheet for everyone

Today the sheet's glowing Level Up button does `setWorkspaceMode("prep")` +
`setTab("plugins")`, and players without prep access just get a status message
telling them to ask the GM. Fix properly:

1. Extract the Advancement section out of `SdkPanel` (the block anchored by the
   `"Actor advancement choices"` aria-label: option select, level-up/multiclass
   segmented control, feat picker, review + confirm step, advance button) into a
   reusable component `advancement-flow.tsx` with an explicit props type
   (advancementOptions, advancementGrantsFeat, advancementFeats, multiclassOptions,
   onAdvanceActor, canAdvanceActor, actor). SdkPanel renders `<AdvancementFlow …/>`
   in place — zero behavior change there (repoint any source-pin tests that
   referenced this code in sdk-panel).
2. Change the sheet's Level Up button to open a centered modal
   (`modal-backdrop`/`modal-dialog` pattern, like the character creator) hosting the
   same `<AdvancementFlow/>`, for ALL users gated on the existing
   `canUpdateSelectedActor`-derived prop. Remove the prep-workspace redirect and the
   "Ask the GM" fallback. Closing the modal (X, backdrop click) does not advance.
   After a successful advance, close the modal.
3. The advancement state (options/feats/multiclass/xp) already lives in App and
   refetches on `selectedActor?.updatedAt` — reuse it; do not add new fetches.

## Part 2 — the persisted Manage-overlay ghost

Observed bug: after some interaction sequence, the Manage view/overlay ("Manage
<campaign> … Close / Archive Campaign …") stayed open ACROSS full page reloads and
blocked the right inspector. First reproduce: open the Manage workspace/dialog as
Demo GM, reload the page, observe what state returns. Investigate what persists it —
check every `localStorage` write with an `otte:` key and any state initialized from
storage (grep `initialStoredPanelFlag`, `otte:`). Then fix by principle:
**transient UI (dialogs, overlays, workspace mode) must not persist across
reloads** unless clearly intentional (mapDockOpen-style layout prefs are fine).
Also add: pressing Escape closes the Manage overlay/dialog (follow the existing
shortcut-overlay Escape handling pattern). Add a regression pin or unit test for
whatever you fix. If you genuinely cannot reproduce the stuck overlay, say so in the
report, still add the Escape-to-close behavior, and ensure reloads land in Live
Table mode by default.

## Part 3 — player-seat audit of the recent features

Live-check AS THE PLAYER (the login screen has a Demo Player button — find its
aria-label; the demo player owns/co-owns at least one actor). Audit and fix:

- **XP:** the player sees their own XP bar; the Award XP form only renders when the
  seat can update the actor (players should NOT see it unless they have
  actor.update/updateOwned per existing gates — verify the gate is the right one,
  not `hasPermission("actor.update")` alone if owned-actor editing is allowed).
- **Level Up:** with Part 1 done, a player who can edit their own actor can complete
  a level-up entirely from the sheet modal. Verify live end-to-end once as player
  (give the player's actor enough XP as GM first, restore after).
- **Loot:** rail drag/Give-to are gated on `hasPermission("actor.update")` — decide
  whether owned-actor players should be able to give away THEIR OWN items (if the
  existing item-assign UI allowed it for owned actors, match that; otherwise leave
  GM-only and note it).
- **Recap:** the Generate-session-recap button must not render for seats without
  journal.create (verify).
- **Conditions/HP:** spot-check the player can adjust their own HP and toggle their
  own conditions (existing behavior — just confirm nothing regressed).

Fix what fails, leave what passes, and list each check with its result. Restore all
demo data you mutate (HP, XP where feasible — note: XP awards to the player's actor
for testing can be left if reverting is awkward, but say so).

## Gates + report

Full web typecheck + tests (repointed pins included) + build, plus the live checks
above. Report: per-part summary, audit table (check → pass/fail → fix), commit
message with the `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer.
