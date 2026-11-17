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

The board's memoised layers count their renders in `window.__otteBoardRenderCounts` (`token`, `walls`, `structureHandles`, `lighting`, `darkness`, `visionMask`, `difficultTerrain`). `tests/e2e/board-render-isolation.spec.ts` uses the counters to assert that moving one token does not render the others and that zooming renders none of them. Read them in the console when a change seems to have made the board slower.

## Findings so far

Recorded 2026-11-16 on a machine without a GPU, headless Chrome, 1440 x 900.

- One keyboard token move causes about five renders of the whole app. Before the board's layers were memoised, each of those re-created and re-diffed every token, wall, handle and vision polygon.
- Memoising them cut JavaScript time for ten moves from 622 ms to 385 ms (React work from 526 ms to 301 ms; one profile each). Slow frames moved from 14, 15, 17 to 13, 7, 18 across three runs each, and the 95th percentile frame from 66.7 ms to 50, 33, 50 ms.
- What is left in a keyboard move is the app outside the board: the five renders themselves, each followed by style, layout, paint and commit. That is the next thing to fix.
- Wheel zoom did not change (8 to 12 slow frames before and after). Its cost is laying out the resized board and redrawing the light glows on the map canvas, about 35 ms a redraw without a GPU, not React.
