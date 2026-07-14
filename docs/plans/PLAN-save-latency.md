# Plan B: Measure and cut server mutation latency

**Context:** live measurement showed a cross-client update takes ~400ms end-to-end,
and most of it is server-side. Every mutation route calls `store.save()` (214 call
sites in `apps/api/src/app.ts`). `SqliteStateStore` (`apps/api/src/sqlite-store.ts`)
does dirty-diff upserts per save; `FileStateStore` (`apps/api/src/store.ts`) writes
the whole state JSON via temp+rename+fsync per save. **Goal:** measure precisely
where PATCH latency goes, then make mutations meaningfully faster without losing
durability guarantees that tests rely on.

**Scope fence:** you may modify files under `apps/api/` ONLY (plus its tests). Do
not touch `apps/web/`, `packages/`, or configs outside apps/api. Another agent is
refactoring `apps/web/` concurrently. **Do not start long-lived dev servers on any
port** — all measurement must be in-process (see below). Ignore any web dev server
you notice running.

## Tripwires

- The tripwires in PLAN-xp-level-loop.md apply verbatim (no new routes; noUnusedLocals;
  route-coverage gates in `app.test.ts`; you cannot write `.git` — no commits).
- Do not change any route's request/response shape or status codes.
- Baseline green: API 218 passed / 1 skipped. Finish ≥ that, plus your new tests.
- Persistence semantics matter: some tests build a store, mutate, reopen, and assert
  the data survived. Grep the store tests first (`apps/api/src/*store*.test.ts` or
  wherever `SqliteStateStore` is tested) and understand the current contract before
  changing when writes hit disk.

## Step 1 — Benchmark harness (in-process, committed)

Create `apps/api/src/save-benchmark.ts` — a standalone script (NOT matching the
`*.test.ts` glob) that:
1. Builds the app in-process exactly the way `app.test.ts` does (`buildApp(...)` from
   `./app.js`; copy the test's options for store/seed).
2. Warms up, then measures with `performance.now()`:
   - 200 sequential `app.inject` PATCH `/api/v1/tokens/:tokenId` position moves,
   - 100 sequential PATCH `/api/v1/actors/:actorId` HP changes,
   reporting p50 / p95 / max per route.
3. Separately times `store.save()` alone (wrap or call directly) to attribute cost:
   route total vs save vs everything else (vision recompute, broadcast, JSON).
4. Runs for BOTH store backends if `buildApp` lets you choose (sqlite and file); if
   only one is wired in tests, benchmark that one and say so.
Find how the repo runs TS directly (check `apps/api/package.json` dev script — tsx,
ts-node, or compiled) and document the exact command at the top of the file.
Record the BASELINE numbers before touching anything.

## Step 2 — Optimize (in order of safety; stop when p50 route latency is < half baseline or you exhaust safe options)

1. **Coalesce saves.** 214 sites call `save()` synchronously per mutation. Introduce
   write-behind coalescing INSIDE the store implementations (not at call sites):
   `save()` marks dirty and schedules a flush (~25–50ms trailing debounce); add a
   synchronous `flush()`; flush on process shutdown hooks and at the end of
   `buildApp`'s close/dispose path. CRITICAL: find every place that READS the
   persisted form (store re-open in tests, archive/export routes, backup jobs) and
   make them flush first. If existing tests assert durability immediately after a
   mutation, either flush on those paths or adjust the store tests to call `flush()`
   explicitly — do not weaken what they prove (data survives reopen).
2. **SQLite pragmas.** If not already set: WAL journal mode, `synchronous = NORMAL`.
   Measure before/after; keep only what moves the number.
3. **Dirty-diff scope.** Verify the sqlite dirty-diff actually skips untouched
   collections on a token move; if a token PATCH rewrites unrelated tables, tighten it.
4. **Everything else** (vision recompute, broadcast serialization) — only if Step 1
   attribution shows save() is NOT the dominant cost; report findings rather than
   doing risky surgery on vision math.

## Step 3 — Tests

Add tests for the new semantics: (a) coalesced writes flush within the debounce
window (fake timers or waiting), (b) `flush()` forces durability synchronously,
(c) close/dispose flushes, (d) a store reopened after flush contains the mutation.
Run the FULL api suite; all 218 must still pass.

## Report

(a) baseline vs final p50/p95 per route with the attribution split, (b) exactly what
changed and the durability contract now in force (worst-case data-loss window),
(c) anything you measured but chose not to change and why, (d) the commit message
(with the `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer).
