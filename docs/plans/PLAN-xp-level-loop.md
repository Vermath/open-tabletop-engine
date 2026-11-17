# Plan: "Earn & Level" — the XP progression loop

**Goal:** Close the play loop. Today HP, conditions, feats, multiclassing, and a full
advancement pipeline all work, but leveling is pure GM fiat and the SRD XP tables sit
in the rules engine with **zero references** anywhere else. After this change: the GM
awards XP (per actor, or split across the party from the combat tracker), players see
an XP bar on their sheet, and when a character crosses a threshold a **glowing
"Level Up" button** appears on the sheet that runs the existing advancement flow.

Stretch goal (Part F): tokens visually show **bloodied** (≤ half HP) and **down**
(0 HP) states on the board.

---

## Repo orientation (read this first)

- pnpm monorepo. Three monolith files hold nearly everything:
  - `packages/system-sdk/src/index.ts` (~22k lines) — rules engine, 4 game systems.
  - `apps/api/src/app.ts` (~24k lines) — every Fastify route.
  - `apps/web/src/App.tsx` (~18k lines) — the whole React UI. `apps/web/src/styles.css` (~11k lines, append-only layers at the end).
- Never use line numbers to navigate — they drift. Use the grep anchors given below.
- The demo login is the "Demo GM" button; demo campaign is `camp_demo`, system `dnd-5e-srd`.

### Tripwires — violating any of these will break the build or tests

1. **Do NOT add new API routes.** `apps/api/src/app.test.ts` has route-coverage,
   auth-matrix, and MCP-classification gates that fail on any new route. Extending an
   existing route's **request body or response shape** is safe and is the established
   pattern here.
2. **Rebuild the SDK before typechecking API or web**: the API resolves the SDK's
   built output. After any `packages/system-sdk` edit run
   `pnpm --filter @open-tabletop/system-sdk build` or the API typecheck will report
   "has no exported member".
3. `noUnusedLocals` is enforced everywhere (lint = `tsc --noEmit`). An unused import
   fails the build.
4. **The web app must not import `@open-tabletop/system-sdk`** (it is not a
   dependency). All SRD data reaches the web through API responses.
5. **CSS theme gotcha:** `--ink` is the DARK color (#08070d, same as the surface).
   Text on dark surfaces uses `var(--paper)` (#ece9f7); muted text `var(--muted)`.
   Add new CSS as an appended layer at the END of `styles.css` with a banner comment,
   matching the existing "Character creator wizard" layer.
6. Several web tests are **source-pinning tests** (they read `App.tsx`/`styles.css`
   as text and assert substrings). Run `pnpm --filter @open-tabletop/web test` after
   every edit; if a pin fails because you intentionally changed design, update the pin.
7. `updateActorData` in App.tsx already applies the PATCH response to the snapshot
   locally (instant UI). Do **not** add `await refresh()` calls to new mutation paths.
8. Baseline green state: SDK **40** tests, API **218 passed / 1 skipped**, web **148**
   tests, all typechecks clean. Your work should only ever add tests.
9. Git: LF/CRLF warnings are noise, ignore them. Never commit `.claude/` or
   `fable_review.md` (leave untracked). Commit messages end with:
   `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

---

## Part A — SDK: XP progress helper

File: `packages/system-sdk/src/index.ts`

Anchor: `export function dnd5eSrdXpForNextLevel` (already exists, near
`dnd5eSrdXpThresholds` and `dnd5eSrdLevelForXp`). Insert directly after it:

```ts
export interface Dnd5eSrdXpProgress {
  xp: number;
  level: number;
  levelForXp: number;
  nextLevelXp?: number;
  previousLevelXp: number;
  readyToLevel: boolean;
}

export function dnd5eSrdXpProgress(actor: Actor): Dnd5eSrdXpProgress {
  const xp = Math.max(0, Math.floor(numericValue(actor.data.xp, 0)));
  const level = Math.max(1, Math.min(20, Math.floor(numericValue(actor.data.level, 1))));
  const levelForXp = dnd5eSrdLevelForXp(xp);
  const nextLevelXp = level >= 20 ? undefined : dnd5eSrdXpThresholds[level];
  const previousLevelXp = dnd5eSrdXpThresholds[level - 1] ?? 0;
  return { xp, level, levelForXp, nextLevelXp, previousLevelXp, readyToLevel: levelForXp > level };
}
```

Notes:
- `numericValue` is an existing internal helper — it is already in scope, do not import.
- `dnd5eSrdXpThresholds[level]` is the total XP needed for `level + 1` (the array is
  cumulative totals indexed by `level - 1`). 5e XP is cumulative — it never resets on
  level-up.

Tests: in `packages/system-sdk/src/index.test.ts`, add `dnd5eSrdXpProgress` to the
big import from `./index.js` (anchor: `dnd5eSrdLevelForXp,`), then add one `it` block
inside the `"dnd 5.5e srd rules"` describe (anchor: any existing `it(` in that block —
find one via `dnd5eSrdLevelForXp`):

```ts
it("reports xp progress toward the next level", () => {
  const level3 = { ...srdActor, data: { ...srdActor.data, level: 3, xp: 900 } };
  expect(dnd5eSrdXpProgress(level3)).toEqual({ xp: 900, level: 3, levelForXp: 3, nextLevelXp: 2700, previousLevelXp: 900, readyToLevel: false });
  const ready = { ...srdActor, data: { ...srdActor.data, level: 3, xp: 2700 } };
  expect(dnd5eSrdXpProgress(ready).readyToLevel).toBe(true);
  const capped = { ...srdActor, data: { ...srdActor.data, level: 20, xp: 999999 } };
  expect(dnd5eSrdXpProgress(capped).nextLevelXp).toBeUndefined();
  expect(dnd5eSrdXpProgress(capped).readyToLevel).toBe(false);
  const blank = { ...srdActor, data: { ...srdActor.data, level: 1 } };
  expect(dnd5eSrdXpProgress(blank).xp).toBe(0);
});
```

(`srdActor` is an existing fixture in that file.)

**Verify:** `pnpm --filter @open-tabletop/system-sdk typecheck` (0 errors),
`pnpm --filter @open-tabletop/system-sdk test` (41 passing), then
`pnpm --filter @open-tabletop/system-sdk build`.

---

## Part B — API: expose XP progress on the advancement GET

File: `apps/api/src/app.ts`

1. Add `dnd5eSrdXpProgress` to the big system-sdk import (anchor:
   `dnd5eSrdMulticlassPrerequisites,` in the import at the top of the file).
2. Anchor: `grantsFeat: typeof nextValue === "number"` — this is inside the SRD
   branch of the GET `/advancement` route, which already returns
   `{ actorId, options, grantsFeat, feats, multiclassOptions }`. Add one field to that
   returned object:

```ts
      xp: dnd5eSrdXpProgress(actor),
```

No other API changes. Do not touch the POST `/advance` route.

Optional API test: in `apps/api/src/app.test.ts`, find the existing assertion on the
advancement GET (grep `grantsFeat` or `/advancement`) and add:
`expect(response.json().xp).toEqual(expect.objectContaining({ level: expect.any(Number), readyToLevel: expect.any(Boolean) }));`
If no existing test hits that route with an SRD actor, skip the API test — the web
tests and live verification cover it.

**Verify:** `pnpm --filter @open-tabletop/api typecheck` (0 errors),
`pnpm --filter @open-tabletop/api test` (218 passing / 1 skipped — or 219 if you added
the assertion to an existing test, count unchanged either way).

---

## Part C — Web: XP state, XP bar, Award XP, glowing Level Up

File: `apps/web/src/App.tsx`

### C1. Type + state

Anchor: `type AdvancementOptionInfo = {`. Below that type block add:

```ts
type XpProgressInfo = {
  xp: number;
  level: number;
  levelForXp: number;
  nextLevelXp?: number;
  previousLevelXp: number;
  readyToLevel: boolean;
};
```

Anchor: `const [multiclassOptions, setMulticlassOptions]`. Below it add:

```ts
  const [xpProgress, setXpProgress] = useState<XpProgressInfo | undefined>(undefined);
```

### C2. Fetch + staleness fix

Anchor: `const resetAdvancement = () => {` — this is the advancement fetch effect.
- Add `setXpProgress(undefined);` inside `resetAdvancement`.
- Widen the `apiGet<...>` response type with `xp?: XpProgressInfo;`.
- In the `.then`, add `setXpProgress(result.xp);` next to `setMulticlassOptions(...)`.
- **Staleness fix (intentional, include it):** the effect's dependency array is
  currently `[blankCanvasDemoOpen, campaignId, selectedActor?.id, selectedActor?.systemId, tab]`.
  Add `selectedActor?.updatedAt` so XP awards and level-ups refetch the advancement
  payload. Without this the Level Up button never appears until you switch actors.

### C3. Award XP helper (App scope)

Anchor: `function toggleActorCondition(` — insert this sibling function ABOVE it:

```ts
  async function awardActorXp(actor: Actor, amount: number) {
    if (!Number.isFinite(amount) || amount === 0) return;
    const currentXp = Math.max(0, Math.floor(numericValue(actor.data.xp, 0)));
    const nextXp = Math.max(0, currentXp + Math.floor(amount));
    applyActorToSnapshot(await apiPatch<Actor>(`/api/v1/actors/${actor.id}`, { data: { ...actor.data, xp: nextXp } }));
    setStatus(`${actor.name} ${amount > 0 ? "gained" : "lost"} ${formatNumber(Math.abs(Math.floor(amount)))} XP`);
  }
```

Check that a `numericValue` helper exists in App.tsx (grep `function numericValue`);
if it does not, inline `typeof actor.data.xp === "number" ? actor.data.xp : Number(actor.data.xp) || 0`
instead. `applyActorToSnapshot`, `apiPatch`, `formatNumber`, `setStatus` all exist.

### C4. Thread props into ActorPanel

ActorPanel has ONE call site and one props type. Follow the exact precedent of
`adjustActorHp` (grep it to see both spots):

- Props type (anchor: `adjustActorHp(actor: Actor, delta: number): void;`): append
  `awardActorXp(actor: Actor, amount: number): void; xpProgress?: XpProgressInfo; advancementReady: boolean; onLevelUp(): void;`
- Call site (anchor: `adjustActorHp={adjustActorHp}`): append
  `awardActorXp={awardActorXp} xpProgress={xpProgress} advancementReady={Boolean(xpProgress?.readyToLevel && advancementOptions.length > 0)} onLevelUp={() => { setTab("plugins"); setStatus("Choose an advancement option to level up"); }}`

`setTab("plugins")` opens the SDK panel tab, which contains the full existing
advancement UI (option select, feat picker at ASI levels, multiclass toggle, review +
confirm). Reusing it keeps this change small; do NOT duplicate that flow in the sheet.

### C5. Sheet UI — XP bar + Award XP + Level Up button

Anchor: `<div className="condition-quick-chips"` — the vitals area of the sheet. The
HpBar render is just above it. Insert the XP block between the HP row and the
condition chips:

```tsx
          {props.xpProgress && (
            <div className="xp-row">
              <div className="xp-bar" role="meter" aria-label={`Experience ${props.xpProgress.xp}${props.xpProgress.nextLevelXp ? ` of ${props.xpProgress.nextLevelXp}` : ""}`} aria-valuemin={props.xpProgress.previousLevelXp} aria-valuemax={props.xpProgress.nextLevelXp ?? props.xpProgress.xp} aria-valuenow={props.xpProgress.xp}>
                <div className="xp-bar-fill" style={{ width: `${props.xpProgress.nextLevelXp ? Math.max(0, Math.min(100, Math.round(((props.xpProgress.xp - props.xpProgress.previousLevelXp) / Math.max(1, props.xpProgress.nextLevelXp - props.xpProgress.previousLevelXp)) * 100))) : 100}%` }} />
                <span className="xp-bar-value">XP {formatNumber(props.xpProgress.xp)}{props.xpProgress.nextLevelXp !== undefined ? ` / ${formatNumber(props.xpProgress.nextLevelXp)}` : ""}</span>
              </div>
              {props.advancementReady && (
                <button className="ghost-button level-up-button" type="button" onClick={() => props.onLevelUp()}>
                  <ChevronUp size={14} /> Level Up
                </button>
              )}
              {props.canUpdateActor && (
                <form className="xp-award" onSubmit={(event) => { event.preventDefault(); const input = event.currentTarget.elements.namedItem("xp-award-amount") as HTMLInputElement; const amount = Number(input.value); if (Number.isFinite(amount) && amount !== 0) { props.awardActorXp(props.actor!, amount); input.value = ""; } }}>
                  <input name="xp-award-amount" aria-label="Award XP amount" type="number" placeholder="XP" />
                  <button className="ghost-button small" type="submit">Award</button>
                </form>
              )}
            </div>
          )}
```

`ChevronUp` is already imported from lucide-react (check the import on line ~4; if
missing, add it — but it is used elsewhere already). `formatNumber` is module scope.

### C6. Combat tracker — split XP across the party

App scope, anchor `async function awardActorXp` (the function you just added). Below it:

```ts
  function awardPartyXp(total: number) {
    const party = snapshot.actors.filter((actor) => actor.type === "pc");
    if (party.length === 0 || !Number.isFinite(total) || total <= 0) {
      setStatus("No party actors to award XP");
      return;
    }
    const share = Math.floor(total / party.length);
    if (share <= 0) return;
    void Promise.all(party.map((actor) => awardActorXp(actor, share)))
      .then(() => setStatus(`Awarded ${formatNumber(share)} XP to each of ${party.length} party members`))
      .catch((error) => setStatus(errorMessage(error)));
  }
```

First check how "party" is derived elsewhere: grep `partyActors` in App.tsx and reuse
that exact filter expression instead of `actor.type === "pc"` if it differs (it likely
uses a helper like `!isAdversaryActor(actor, snapshot.tokens)` — copy whatever the
party rail uses so the two agree).

Thread into CombatPanel exactly like ActorPanel: grep `onEnd={endCombat}` for the
call site; add `onAwardPartyXp={awardPartyXp} canAwardXp={hasPermission("actor.update")}`
and matching entries in the CombatPanel props type (grep `function CombatPanel(props:`).
In CombatPanel's JSX, next to the End-combat button (grep `onEnd` inside the
component), add a small form identical in shape to the sheet's `xp-award` form
(number input `aria-label="Party XP award"` + button "Split XP"), gated on
`props.canAwardXp`.

### C7. Threshold toast

In `awardActorXp`, after `applyActorToSnapshot(...)`: the response actor's data has
the new xp. Compute readiness client-side without the SDK: fetch is wrong here — the
advancement effect refetches automatically via the `updatedAt` dep (C2), and
`xpProgress.readyToLevel` drives the button. For the toast, keep it simple: after the
apply, if `xpProgress?.nextLevelXp !== undefined && nextXp >= xpProgress.nextLevelXp`
(only valid when the awarded actor IS the selected actor — check
`actor.id === selectedActor?.id`), then
`setStatus(`${actor.name} has enough XP to level up!`)`. The status→toast channel
turns that into a toast automatically.

---

## Part D — CSS layer

File: `apps/web/src/styles.css` — append at the very end, after the token-condition
chip layer:

```css
/* -------------------------------------------------------------------------
   XP progression: sheet XP bar, award form, glowing Level Up
   ------------------------------------------------------------------------- */
.xp-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.xp-bar {
  position: relative;
  overflow: hidden;
  flex: 1;
  height: 16px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface-0);
}

.xp-bar-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, rgba(240, 198, 116, 0.35), rgba(240, 198, 116, 0.75));
  transition: width 0.25s ease;
}

.xp-bar-value {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--paper);
  font-size: 10.5px;
  font-weight: 600;
}

.xp-award {
  display: flex;
  gap: 4px;
}

.xp-award input {
  width: 64px;
}

.level-up-button {
  border-color: rgba(240, 198, 116, 0.7);
  color: var(--paper);
  animation: level-up-pulse 1.6s ease-in-out infinite;
}

@keyframes level-up-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(240, 198, 116, 0.45); }
  50% { box-shadow: 0 0 10px 3px rgba(240, 198, 116, 0.25); }
}
```

If `var(--surface-0)` or `var(--line)` fail to resolve (check any existing appended
layer for the exact token names used there), copy whatever the `.creator-card` rule
uses.

---

## Part E — Web tests

New file `apps/web/src/xp-progression.test.ts`, copying the structure of
`apps/web/src/character-creator.test.ts` (source-pinning style):

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");
const stylesSource = readFileSync(resolve(__dirname, "styles.css"), "utf8");

describe("xp progression", () => {
  it("surfaces xp progress from the advancement endpoint", () => {
    expect(appSource).toContain("type XpProgressInfo");
    expect(appSource).toContain("setXpProgress(result.xp)");
    expect(appSource).toContain("selectedActor?.updatedAt");
  });

  it("lets the GM award xp from the sheet and split from combat", () => {
    expect(appSource).toContain("async function awardActorXp");
    expect(appSource).toContain("function awardPartyXp");
    expect(appSource).toContain('aria-label="Award XP amount"');
  });

  it("shows a glowing level up button when a threshold is crossed", () => {
    expect(appSource).toContain("level-up-button");
    expect(appSource).toContain("advancementReady");
    expect(stylesSource).toContain("@keyframes level-up-pulse");
    expect(stylesSource).toContain(".xp-bar-fill");
  });
});
```

**Verify:** `pnpm --filter @open-tabletop/web typecheck` (0 errors) and
`pnpm --filter @open-tabletop/web test` (151 passing: 148 + 3 new).

---

## Part F (stretch) — bloodied / down token states

File: `apps/web/src/App.tsx`, anchor `const tokenHpTone =` inside the SceneCanvas
token map. `tokenHpRatio` is already computed there. On the token `<button
className={...}>` (anchor: `token layer-${layer}`), append to the template string:
`${tokenHpRatio !== undefined && tokenHpRatio <= 0 ? "down" : tokenHpRatio !== undefined && tokenHpRatio <= 0.5 ? "bloodied" : ""}`.

CSS (same appended layer as Part D):

```css
.token.bloodied .token-image,
.token.bloodied .token-fallback {
  box-shadow: inset 0 0 0 2px rgba(214, 69, 69, 0.65);
  filter: saturate(1.1);
}

.token.down .token-image,
.token.down .token-fallback {
  filter: grayscale(0.9) brightness(0.6);
}

.token.down::after {
  content: "✕";
  position: absolute;
  inset: 0;
  z-index: 5;
  display: grid;
  place-items: center;
  color: rgba(214, 69, 69, 0.9);
  font-size: 18px;
  font-weight: 700;
  pointer-events: none;
}
```

Check the actual inner element class names first (grep `token-image` in App.tsx; the
fallback initials element may be named differently — adjust selectors to match). Add
a fourth `it` to the new test file pinning `.token.down::after` and `bloodied`.

---

## Live verification protocol (required before committing)

Start servers as background tasks if not running:
`pnpm --filter @open-tabletop/api dev` (port 4000) and
`pnpm --filter @open-tabletop/web dev` (port 5173). Wait for both to return 200.

Use the `agent-browser` CLI (NOT synthetic DOM events for clicks — they bypass
hit-testing; `agent-browser click` does real clicks. For `<select>`/inputs driven from
`eval`, set values via the native setter + `dispatchEvent(new Event("change"|"input", { bubbles: true }))`).

1. `agent-browser open http://localhost:5173`, wait for networkidle, click
   `"[aria-label='Demo GM']"`, sleep ~4s.
2. Select the Target token/actor (it has HP 12 and low level). Confirm the XP bar
   renders: eval `document.querySelector('.xp-bar-value')?.textContent` → expect
   `XP 0 / 300`-style text.
3. Type 300 into `[aria-label="Award XP amount"]` (native setter + input event),
   submit the form. Within ~1s expect: XP bar text updates, a toast appears, and the
   glowing `.level-up-button` renders (poll for up to 3s — the advancement refetch is
   async).
4. Click the Level Up button → the SDK panel tab opens with the Advancement section.
   Complete the existing flow (select option → Review advancement → confirm checkbox →
   advance). Verify the actor's level incremented (re-read the sheet) and the Level Up
   button disappeared after the advancement refetch.
5. Combat split: open Combat tab, start combat if needed, enter 200 in
   `[aria-label="Party XP award"]`, submit; verify toast "Awarded 100 XP to each of 2
   party members" (demo has 2 party actors) and that a party actor's xp increased
   (check via the snapshot fetch eval used in prior sessions or by selecting them).
6. Part F: set the selected actor's HP to ~50% via the sheet steppers → token gets
   `bloodied` class (eval `document.querySelector('.token.bloodied')`); set HP to 0 →
   `down` class + ✕ overlay. Restore HP afterwards (heal back up) to leave demo data
   tidy.
7. Take one screenshot of the sheet with the XP bar + Level Up glow for the report.

## Final gate + commit

```
pnpm --filter @open-tabletop/system-sdk typecheck && pnpm --filter @open-tabletop/system-sdk test
pnpm --filter @open-tabletop/system-sdk build
pnpm --filter @open-tabletop/api typecheck && pnpm --filter @open-tabletop/api test
pnpm --filter @open-tabletop/web typecheck && pnpm --filter @open-tabletop/web test
pnpm --filter @open-tabletop/web build
```

All green → stage ONLY the files you edited (never `git add -A`; `.claude/` and
`fable_review.md` stay untracked), commit with a message describing the XP loop
(imperative subject, body explaining GM award → XP bar → glowing Level Up → existing
advancement flow), ending with the co-author trailer above. Push to `origin main`.
