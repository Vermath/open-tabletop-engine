# Plan: Instant cross-client sync, Loot flow, Session recap

Three independent features, implemented **sequentially in this order** (highest value
first). Complete each part fully — including its verification gate — before starting
the next. If a later part goes badly, earlier parts must still be shippable.

---

## Repo orientation + tripwires (identical rules to PLAN-xp-level-loop.md — reread it)

- Monoliths: `apps/api/src/app.ts` (~24k lines), `apps/web/src/App.tsx` (~18k),
  `apps/web/src/styles.css` (append-only layers at the end),
  `packages/system-sdk/src/index.ts`. Navigate by grep anchors, never line numbers.
- **No new API routes** (route-coverage/auth-matrix gates in `app.test.ts`).
  Extending an existing route's body/response is fine.
- Rebuild the SDK before typechecking api/web if you touch it:
  `pnpm --filter @open-tabletop/system-sdk build` (Parts here should NOT need SDK edits).
- `noUnusedLocals` everywhere. Web must not import `@open-tabletop/system-sdk`.
- CSS: text on dark = `var(--paper)`; `--ink` is the DARK color. Append new layers at
  the end of styles.css with a banner comment.
- Web has source-pinning tests that read App.tsx/styles.css as text. Baseline green:
  SDK 41, API 218 passed/1 skipped, web 152. Only ever add tests.
- Mutation responses get applied to the snapshot locally via the existing helpers
  (`applyActorToSnapshot`, `applyTokensToSnapshot`, `applySceneToSnapshot`) — never
  add blocking `await refresh()` to a new mutation path.
- **CRITICAL — full cross-layer wiring:** the previous agent run implemented a feature
  where the API imported a helper but never added the field to the response, so the
  UI could never receive it, and all tests still passed. After each part, trace one
  request end-to-end (server emits → client consumes → UI renders) and state the
  trace in your notes.
- Do not modify `PLAN-*.md`, `fable_review.md`, or `.claude/`. You cannot write to
  `.git` in this sandbox — do NOT attempt commits; leave the working tree clean and
  print the commit message you would use.

---

# Part 1 — Instant cross-client sync (highest priority, most dangerous)

**Problem:** every websocket event currently triggers a debounced (250ms) full
`loadSnapshot` (~28 requests). Another player's HP change/token move takes ~1s+ to
appear. **Goal:** apply `actor.*` and `token.*` event payloads straight into the
snapshot on arrival, while KEEPING the debounced full refresh as the reconciler.

### Architecture facts you must respect

1. `apps/web/src/realtime-connection.ts` calls `options.onMessage(event.data)` with
   the RAW websocket string. Parsing happens downstream.
2. `apps/web/src/realtime-refresh.ts` — `createRealtimeHandlers(input)` builds
   `onMessage`, which currently: (a) gives `handleBoardCaptureEvent(data)` first
   claim, (b) otherwise debounces `input.refresh()` by 250ms
   (`realtimeRefreshDebounceMs`). It has a test file `realtime-refresh.test.ts`.
3. Server-side redaction (`filterRealtimeEvent` in app.ts): non-privileged clients
   receive **redacted actor payloads** — shape `{ id, campaignId, systemId,
   ownerUserId, type, name, imageAssetId, createdAt, updatedAt, redacted: true }`
   with **no `data` field**. Non-visible token events are converted to
   `scene.updated` with `{ id, redacted: true }`. **Applying a redacted payload
   would WIPE the local actor's sheet data.**
4. Event shape is `EngineEvent`: `{ id, type, campaignId, targetId?, payload?, ... }`.
   Relevant types: `actor.updated`, `token.created`, `token.updated`, `token.deleted`.
5. App.tsx wires handlers in the effect anchored at `createRealtimeHandlers({` and
   holds per-concern refs (`realtimeRefreshRef`, `realtimeBoardCaptureHandlerRef`,
   assigned near the anchor `realtimeBoardCaptureHandlerRef.current =`). Follow that
   ref pattern exactly for the new fast-path handler.
6. The seq guard: `refreshSeqRef` + `invalidateInFlightRefreshes()` in App.tsx.
   The local-apply helpers (`applyActorToSnapshot`, `applyTokensToSnapshot`) already
   call `invalidateInFlightRefreshes()` — reuse those helpers and you inherit the
   correct race behavior for free. Do NOT invent a second sequencing mechanism.

### Implementation

**`realtime-refresh.ts`:** add an optional input
`applyRealtimeEvent?: (data: unknown) => void`. In `onMessage`, after the
board-capture claim, call `input.applyRealtimeEvent?.(data)` and then STILL run the
existing debounced-refresh scheduling unconditionally. The fast path is additive;
the reconciling refresh must keep firing exactly as before.

**App.tsx:** add `const realtimeApplyRef = useRef<(data: unknown) => void>(() => {});`
next to `realtimeBoardCaptureHandlerRef`, pass
`applyRealtimeEvent: (data) => realtimeApplyRef.current(data)` in the
`createRealtimeHandlers({...})` call, and assign the implementation next to the
`realtimeBoardCaptureHandlerRef.current =` anchor:

```ts
  realtimeApplyRef.current = (data: unknown) => {
    let event: { type?: string; campaignId?: string; targetId?: string; payload?: Record<string, unknown> };
    try {
      event = typeof data === "string" ? JSON.parse(data) : (data as typeof event);
    } catch {
      return;
    }
    if (!event || typeof event.type !== "string" || event.campaignId !== campaignId) return;
    const payload = event.payload;
    // Redacted payloads have no usable data; the debounced full refresh handles them.
    if (event.type === "actor.updated" && payload && payload.redacted !== true && typeof payload.id === "string" && payload.data && typeof payload.data === "object") {
      applyActorToSnapshot(payload as unknown as Actor);
      return;
    }
    if ((event.type === "token.created" || event.type === "token.updated") && payload && payload.redacted !== true && typeof payload.id === "string" && typeof payload.sceneId === "string") {
      applyTokensToSnapshot([payload as unknown as Token]);
      return;
    }
    if (event.type === "token.deleted") {
      const tokenId = typeof payload?.id === "string" ? (payload.id as string) : event.targetId;
      if (!tokenId) return;
      invalidateInFlightRefreshes();
      setSnapshot((current) => ({ ...current, tokens: current.tokens.filter((token) => token.id !== tokenId) }));
    }
  };
```

Notes:
- Verify the exact payload shapes by reading the broadcast sites (grep
  `type: "token.deleted"` etc. in app.ts) before trusting the sketch above; adjust
  guards to reality.
- If `token.deleted` events carry the full token in `payload`, prefer `payload.id`.
- Do NOT fast-path `scene.updated` (fog/walls/vision polygons need the full snapshot's
  `vision` recompute) and do NOT fast-path chat (out of scope).
- The user's own mutations echo back as events — re-applying identical data is
  harmless; do not special-case them.

**Tests:** extend `apps/web/src/realtime-refresh.test.ts`: `applyRealtimeEvent` is
called with the raw data when provided, the debounced refresh still fires after it,
board-capture claim still short-circuits, and absence of the new input changes
nothing. Also add a source-pin test (new `it` in the new `apps/web/src/realtime-fast-path.test.ts`
or an existing suitable file) pinning: `realtimeApplyRef`, `payload.redacted !== true`,
and that the handler is wired (`applyRealtimeEvent: (data) => realtimeApplyRef.current(data)`).

**Gate:** web typecheck + tests. **Live check (two windows):** with dev servers up
(`pnpm --filter @open-tabletop/api dev` port 4000, `pnpm --filter @open-tabletop/web dev`
port 5173), open TWO agent-browser sessions on `http://localhost:5173` (agent-browser
supports named sessions; if only one session is possible, verify via a second `curl`-
driven mutation instead): sign in as Demo GM in session A, click an HP stepper; in
session B confirm the token HP sliver/rail updates in well under a second (poll the
DOM ~200ms). If agent-browser cannot run two sessions, mutate via curl PATCH to
`/api/v1/actors/:id` with the bearer token from localStorage and watch the single
browser update without a full-second delay.

---

# Part 2 — Loot flow: drag items between actors + party gold splitter

### Facts

- Item drag ALREADY exists inside ActorPanel: `const itemDropMime =
  "application/x-open-tabletop-item"` (module scope), drag sources call
  `dataTransfer.setData(itemDropMime, item.id)`, and ActorPanel has a drop zone
  (`itemDropActive` state, `drop-active` class).
- `assignItemToActor(item, actor)` in App.tsx PATCHes `/api/v1/items/:itemId` with
  `{ actorId }` — but it still ends with a blocking `await refresh()`.
- The party rail rows are in App.tsx: anchor `className={actor.id === selectedActor?.id ? "party-row selected" : "party-row"}`
  (and an equivalent adversary rail just below).
- Actor currency lives at `actor.data.currency` as `{ gp?, sp?, cp?, ep?, pp? }`
  numbers (SRD actors; other systems may lack it — guard with defaults of 0).

### Implementation

1. **Instant item mutations:** add an `applyItemToSnapshot(item: Item)` helper next to
   `applyActorToSnapshot` (same shape: `invalidateInFlightRefreshes()` +
   `setSnapshot(items: map/replace-or-append)`). Convert `assignItemToActor` and
   `updateItemData` to apply their PATCH responses locally instead of `await refresh()`.
2. **Drag to party rail:** make each party-rail row (and adversary-rail row) a drop
   target: `onDragOver` accepts when `event.dataTransfer.types.includes(itemDropMime)`
   (preventDefault + add a `drop-target` class via local state), `onDrop` reads the
   item id, finds it in `snapshot.items`, and calls `assignItemToActor(item, actor)`
   gated on the same permission the existing assign UI uses (grep `assignItemToActor`
   call sites for the gate). Show status "Gave <item> to <actor>".
3. **Give-to select fallback:** in the ActorPanel loadout item rows (anchor: grep
   `assignItemId`), if there is not already a per-item way to reassign to a DIFFERENT
   actor, add a compact "Give to…" `<select>` per item row listing other actors,
   calling `assignItemToActor`. If an equivalent control already exists, skip this.
4. **Party gold splitter:** in CombatPanel next to the existing "Split XP" form
   (anchor: `party-xp-award`), add an identical "Split GP" form
   (`aria-label="Party gold award"`). App-side `awardPartyGold(totalGp: number)`
   mirrors `awardPartyXp`: same party filter, `share = Math.floor(total / party.length)`,
   per-actor `updateActorData(actor, { currency: { ...existingCurrency, gp: existingGp + share } })`
   (read existing currency defensively: `recordValue`-style — grep how `currency` is
   read elsewhere in App.tsx and copy it; if there is no reader, treat non-object as `{}`
   and non-finite gp as 0). Status: "Split N gp — M gp to each of K party members".
5. CSS: `.party-row.drop-target { border-color / background highlight }` +
   `.xp-award` reuse for the gold form — append to styles.css layer.

**Tests:** new `apps/web/src/loot-flow.test.ts` source-pin: `applyItemToSnapshot`,
`itemDropMime` on party rail (`onDrop`), `awardPartyGold`,
`aria-label="Party gold award"`, `.party-row.drop-target` in styles.
**Gate:** web typecheck + tests. **Live check:** demo GM: drag is hard to simulate —
verify via the Give-to select (or direct `assignItemToActor` through the UI) that an
item moves between actors instantly (items list updates without ~1s lag), and Split
GP from the combat tab updates a party actor's gp (read via snapshot fetch eval).

---

# Part 3 — Session recap generator (client-side, no new routes)

**Goal:** one click produces a readable "session recap" journal entry from data the
client already has. Deterministic — NO AI calls.

### Facts

- Journal create route exists: POST `/api/v1/campaigns/:campaignId/journal` (see
  `createJournal` in App.tsx for the exact body: `{ title, body, visibility, tags }`).
- Available snapshot data: `snapshot.chat` (messages, `createdAt`), `snapshot.rolls`
  (`formula`, `total`, `label?`, `createdAt`), `snapshot.combats` (rounds, combatants,
  active flag, timestamps), `snapshot.combatAudit` (AuditLog[] for the active combat),
  `snapshot.actors` (current hp/level), `snapshot.journals`.
- Do NOT add an audit-log REST route; work only from the snapshot.

### Implementation

1. App-side `generateSessionRecap()` (near `createJournal`):
   - Window: entries since the most recent journal tagged `recap` (grep how tags are
     stored on JournalEntry; default to last 12 hours if none).
   - Compose markdown body with sections (omit empty sections):
     - **Rolls:** count, the highest roll (`label formula = total`), nat-20 count if
       d20 formulas are detectable from `formula` containing "d20".
     - **Combat:** for combats updated in-window: rounds fought, combatant names,
       defeated combatants (flag exists on combatant), pending/confirmed action count
       from `combatAudit`.
     - **Party status:** for each party actor (reuse the party filter from
       `awardPartyXp`): `Name — Level N, HP cur/max, XP if present`.
     - **Chat highlights:** count of messages; last 3 non-command public messages
       truncated to 80 chars.
   - POST via the same shape `createJournal` uses, with
     `title: "Session Recap — <locale date>"`, `tags: ["recap"]`,
     `visibility`: copy the default the journal form uses.
   - Apply result: journals come back in the response — append to
     `snapshot.journals` locally (same local-apply pattern), set status
     "Session recap added to the journal".
2. UI: in JournalPanel (grep `function JournalPanel(props:`), add a
   "Generate session recap" `ghost-button` (aria-label the same) above the create
   form, gated on the same `canCreate` prop the panel already has; wire a new
   `onGenerateRecap()` prop from App at the JournalPanel call site.
3. Number formatting via existing `formatNumber`; dates via `formatDateTime`.

**Tests:** new `apps/web/src/session-recap.test.ts` source-pin:
`generateSessionRecap`, `tags: ["recap"]`, `"Generate session recap"`, and that the
recap body builder references `snapshot.rolls` and party actors.
**Gate:** web typecheck + tests. **Live check:** demo GM → roll dice twice via chat
dice box → Prep workspace → Journal tab → click Generate session recap → a journal
entry titled "Session Recap — …" appears containing the roll count.

---

## Final gate (after all three parts)

```
pnpm --filter @open-tabletop/api typecheck && pnpm --filter @open-tabletop/api test
pnpm --filter @open-tabletop/web typecheck && pnpm --filter @open-tabletop/web test
pnpm --filter @open-tabletop/web build
```

Everything green (API 218/1 skipped; web 152 + your new tests, all passing). Then
print: (a) a per-part summary with the end-to-end wiring trace for each, (b) any live
checks you could not run and why, (c) the commit message you would use (subject +
body + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`). Do not attempt
`git add`/`git commit` — the orchestrator commits after review.
