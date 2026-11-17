# Competitive map and player-preview browser evidence — 2026-09-06

Scope: real-browser map upload, native image edges, calibration, fractional-grid token movement, prepared-scene replacement, and the GM player preview compared with a separately authenticated player. This is feature evidence, not approval of the broader product-comparison goal.

## Completed result

**Six browser cases passed** in the final bounded run: landscape upload/calibration/drag, independently authenticated player comparison, populated-scene preservation and inactive new-scene creation, portrait native edges, square native edges, and prepared-scene acceptance N14.

The before/after fingerprints matched exactly: **725 source/input files and 138 imported workspace/plugin runtime-output files; zero content changes**. The source scope covers API/web sources, workspace package/plugin sources, root manifests, and the selected E2E inputs. The runtime-output scope covers compiled JS/JSON/WASM for the seven workspace dependencies imported by the API and plugin entry files. Desktop/web/API dist and the unrelated multiplayer harness outputs were excluded. These are functional checks; no performance or responsiveness claim is derived from their duration.

- Run log: `output/competitive/map-preview/browser-run-post-fix.log`.
- Exact scope and comparison: `source-stability-post-fix.json` in that directory.
- Complete manifests: `source-before-post-fix.json` and `source-after-post-fix.json`.
- Traces: `output/competitive/map-preview/post-fix-results/`.

## Drag defect reproduced and corrected

At 1280 × 720, a blank scene adopts the landscape fixture's native 1020 × 760 dimensions. Two authored intersections, (23, 17) and (498, 17), ten cells apart, calibrate the square grid to 47.5 px with origin (23, 17).

The original browser run exposed a real gesture defect. A token starting at (213, 207), dragged approximately one grid cell with the inspector hidden, saved at (640.5, 254.5) instead of (260.5, 254.5). Pointer-down captured an offset before immediate selection reopened the inspector and could recenter the map. Subsequent pointer moves then read the changed map rectangle.

`scene-canvas.tsx` now defers pointer selection until final drag/resize coordinates are calculated and suppresses selected-token recentering during active gestures, including already queued callbacks. Motionless clicks still select and open the inspector on release; modifiers and group selection are retained.

The passing browser regression records an unchanged board rectangle during pointer-down: x 477, y 223.34375, width 546, height 407 CSS px. The inspector stays hidden throughout the gesture. The token saves at **(260.5, 254.5)**, remains selected afterward, opens the inspector normally, and reloads at exactly the same coordinates. See `map-metrics.json` and the `offset-grid-*.png` screenshots.

## Native image edges and controls

| Fixture | Native dimensions | Browser evidence |
| --- | --- | --- |
| Landscape, offset grid | 1020 × 760 | Native aspect ratio, all three authored landmarks, exact fractional grid and saved movement |
| Portrait diagnostic map | 760 × 1020 | Native dimensions/aspect, blank content, four corners and four edge landmarks after upload and reload |
| Square diagnostic map | 800 × 800 | Native dimensions/aspect, blank content, four corners and four edge landmarks after upload and reload |

The images preserve their aspect ratios without renderer cropping. Floating workspace controls can still cover authored edge content in the default view. Screenshots and metrics preserve that distinction: they record default controls separately, then the normal **Hide inspector** and **Zoom out to 75%** adjustments. After those recorded adjustments, all tested native landmarks are visible and unobscured. The portrait/square cases close calibration without applying it; fractional calibration is established by the landscape case.

Shape screenshots and per-stage crop/clipping/occlusion measurements are under `output/competitive/map-preview/shapes/`. Visual review confirmed the final full borders and native corner markers. The new portrait/square fixtures are generated geometric diagnostic PNGs, not artwork.

## Prepared-scene preservation

A scene with an existing background is prepared at 1200 × 800 with a 37.5 px grid, origin (8.25, 12.5), and fractional token, wall, light, fog, and drawing coordinates. Through the normal map review, **Keep canvas and replace map** changes its background to the square image while preserving exact canvas/grid/geometry values and token records, including after reload. Unrelated metadata remains and calibration readiness resets.

The same review's **Create new scene at image size** choice then creates an empty 760 × 1020 portrait scene with `active: false`. The original scene and token records remain byte-for-byte equal to their captured state, and the campaign's active scene IDs remain unchanged after reload. The screenshot shows **Draft preview**. See `populated-map-metrics.json` and `populated-map-*.png`.

N14 separately reviews the existing prepared Vault Entry, chooses **Keep canvas and replace map**, calibrates it, and confirms the first-session checklist is ready.

## Player-view comparison

The passing case uses two independent browser contexts and verifies each cookie-authenticated user ID from its API snapshot. The player's actual table and GM preview have matching rendered token names and HP bars. The owned hero has 7/13 HP (54%); an unowned NPC's private actor data and HP bar are redacted. Actual rendered chat matches, including a message sent through the player's UI and a GM whisper. Public handout content is checked in both interfaces. A hidden GM token, GM-only chat, and GM-only handout remain absent.

The GM first moves and selects a token to establish real undo history. Delete and Control+Z while the preview is open leave authoritative token records unchanged. Exiting retains the selected token and saved scene, actor, and user workspace identities. See `preview-metrics.json`, `authenticated-player-*.png`, and `gm-player-preview-*.png`.

## Focused validation and preserved failure

- Gesture validation: **39 tests passed** across `scene-canvas-pointer-lifecycle.test.ts`, `scene-canvas-pointer.test.ts`, `scene-canvas-keyboard.test.ts`, `player-preview.test.tsx`, and `token-transform-ui.test.ts`.
- Web TypeScript, aggregate E2E TypeScript, and scoped diff whitespace checks passed. Final six-case E2E TypeScript output is `output/competitive/map-preview/typecheck-final.log`.
- Test sources: `tests/e2e/competitive-map-preview.spec.ts`, `competitive-map-shapes.spec.ts`, and N14 in `final-browser-acceptance.spec.ts`.
- Fixtures: `tests/e2e/fixtures/offset-grid.png`, `map-portrait.png`, and `map-square.png`.
- Isolated ports: API 4260, web 5324, test control 6260. No user development server was reused.
- The original failing run and screenshots remain under `output/competitive/map-preview/drag-failure-before-fix/`, with explicit `failure.json`. Its trace remains under `final-results/`.
- The older 1600 px map metrics are explicitly retained as `map-metrics-stale-earlier-1600.json`; they are not the final 1280 px result.

## Adjacent screenshot finding

The completed screenshots also revealed an existing actor-inspector binding defect: selecting an unlinked token displayed the fallback Valen Ash actor and labeled the token as linked. The original behavior remains visible in `offset-grid-token-reloaded.png`. The six cases above do not assert actor-editor binding.

`actorForSelection` now receives the selected token object and resolves only its actual linked actor. An unlinked token or unavailable linked actor remains actorless. With no selected token, deliberate actor selection and the existing fallback remain. `ActorPanel` also rejects mismatched actor/token props before its hooks, and reuses its existing full token-settings editor for standalone tokens; it does not display unrelated actor statistics or actions.

The follow-up fix passed 44 focused resolver, real-panel rendering, editor, layout, action, and token-transform tests, plus web TypeScript and the dedicated E2E TypeScript check. Focused regression files are `apps/web/src/actor-rails.test.ts` and `actor-panel-scale.test.tsx`. No actor permissions, AI behavior, core, or API logic changed. The dedicated real-browser case passed 1/1: an unlinked token was renamed without actor/vital controls or changes to either actor, deliberate actor selection remained available, and a linked token opened its actual actor. The root visually inspected `unlinked-token-editor.png` and `linked-token-actor-editor.png`. `browser-run-unlinked.log`, `unlinked-token-metrics.json`, and `source-stability-unlinked.json` retain the result: 721 source inputs and 138 imported runtime outputs stayed unchanged. This result is separate from the six-case run above.
