# Measuring the board

`pnpm perf:board` serves a production build, builds a large scene (4096 x 3072 map, 300 walls, 12 lights, 50 tokens) and records frame intervals for four interactions: wheel zoom, right-drag pan, token drag, and ten keyboard token moves. It writes `output/board-performance/latest.json` and prints a `BOARD_PERF` line.

Frame figures vary from run to run (keyboard moves by plus or minus five slow frames on the same build). Take three runs of each thing you compare, on the same machine, in the same session.

## Options

| Variable | Effect |
| --- | --- |
| `OTTE_PERF_BROWSER_CHANNEL=chrome` | Use an installed Chrome instead of the bundled Chromium. |
| `OTTE_PERF_OUTPUT=path.json` | Where to write the report. |
| `OTTE_PERF_RENDERER=dom` | Measure the DOM map renderer instead of the canvas one. |
| `OTTE_PERF_MAP_WIDTH`, `_MAP_HEIGHT`, `_WALLS`, `_LIGHTS`, `_TOKENS` | Change the fixture. |
| `OTTE_PERF_TRACE=1` | Add a main-thread breakdown per interaction to the report. Tracing slows the run; do not compare traced and untraced frame counts. |
| `OTTE_PERF_TRACE_DIR=dir` | With tracing on, also save the raw trace per interaction. Open it in the browser's Performance panel. |
| `OTTE_PERF_CPU_PROFILE_DIR=dir` | Save a JavaScript CPU profile per interaction (`.cpuprofile`). |
| `OTTE_PERF_SOURCEMAP=1` | Build with source maps, so the profile's minified frames can be mapped back to source files. |
| `OTTE_PERF_CSS="..."` | Inject a stylesheet before measuring, for what-if tests such as `.token { transition: none !important }`. |

## Reading the result

- `over33` is the number of frames longer than 33 ms, out of `frames`. It is the headline, and the noisiest figure.
- `longTaskMs` is time in main-thread tasks over 50 ms.
- `canvasDraws` and `canvasDrawMs` are redraws of the map canvas.
- A CPU profile is steadier than frame counts for judging a change to rendering code: compare the time under `performWorkOnRoot` (all React work) and under the component you changed.

The harness machine matters. Without a GPU, painting and compositing dominate and JavaScript improvements move the frame counts less than they will on a real graphics card. Say which you measured on.

## What re-renders

The scene component and its memoised layers count their renders in `window.__otteBoardRenderCounts` (`scene`, `token`, `walls`, `structureHandles`, `lighting`, `darkness`, `visionMask`, `difficultTerrain`). `tests/e2e/board-render-isolation.spec.ts` uses the counters to assert that moving one token does not render the others and that zooming renders none of them. Read them in the console when a change seems to have made the board slower.

## Findings so far

Recorded 2026-11-16 on a machine without a GPU, headless Chrome, 1440 x 900.

- One keyboard token move causes about five renders of the whole app. Before the board's layers were memoised, each of those re-created and re-diffed every token, wall, handle and vision polygon.
- Memoising them cut JavaScript time for ten moves from 622 ms to 385 ms (React work from 526 ms to 301 ms; one profile each). Slow frames moved from 14, 15, 17 to 13, 7, 18 across three runs each, and the 95th percentile frame from 66.7 ms to 50, 33, 50 ms.
- What is left in a keyboard move is the app outside the board: the five renders themselves, each followed by style, layout, paint and commit. That is the next thing to fix.
- Wheel zoom did not change (8 to 12 slow frames before and after). Its cost is laying out the resized board and redrawing the light glows on the map canvas, about 35 ms a redraw without a GPU, not React.


## Snapshot reconciliation and panel renders

The token move response and socket event deliver the same revision. The second delivery now preserves the snapshot and any in-flight refresh. Actor updates use the same check. Realtime vision is compared by content and published to the live board and the layer stack. The board subscribes to the vision snapshot and the layer stack subscribes to the fog flag. The vision update is scoped to its full snapshot, scene, and user.

These were the largest named render costs sampled after deduplication, before changing the panel boundaries. Sampled call stacks can include an entry in its parent’s time.

| Profile | Largest named render costs |
| --- | --- |
| Ten keyboard moves | Party placement, App, Actor Panel, Scene Canvas, Board Token |
| Eight incoming chat messages | Chat Rail, party placement, App, Chat Message Item, Scene Canvas |
| Four HP changes | Party placement, App, Actor Panel, Scene Canvas, Campaign Webhooks Panel |

Party placement now reuses the calculation until its inputs change. The board, Chat, and Actors receive stable event handlers and can skip renders while their data is unchanged. The Actors inspector still reads the selected token’s coordinates for its editor.

In the sampled runs, the board committed 8 times for 8 incoming messages after deduplication and 0 times after the panel changes. Four HP changes went from 17 board commits to 4. Temporary layout-effect markers counted commits and Chrome CPU profiles identified the render costs. The browser regression checks that incoming chat leaves the scene component alone. A separate two-client test checks that the player sees the moved token and its updated vision.

Three fresh runs of the standard fixture used headless Chromium at 1440 × 900 on Windows with an i9-9900K. The browser built 301 walls, 13 lights, and 50 tokens on each run. Each column lists the three keyboard samples in order.

| Ten keyboard moves | After #81 | After snapshot reconciliation and panel changes |
| --- | --- | --- |
| App commits | 31, 34, 33 | 24, 24, 24 |
| Scene Canvas commits | 57, 60, 61 | 40, 41, 40 |
| Frames over 33.4 ms | 0, 0, 0 | 0, 0, 1 |
| Long-task time | 0, 0, 0 ms | 0, 0, 0 ms |

The original harness selected a different token on its first key press. With the token already selected, nine extra moves took two App commits each to apply the token revision and record its undo entry.

Undo and redo history now lives in refs read by the keyboard handler. The movement response records history alongside the saved position. The updated harness starts with a selected token and checks the successful API response for every move. On the same Windows machine and fixture, a production Chromium run measured one App render for each of ten moves, zero intervals over 33.4 ms, and zero long-task time.
