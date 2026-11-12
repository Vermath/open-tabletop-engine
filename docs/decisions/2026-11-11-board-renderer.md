# Board renderer: canvas for the map, tokens stay elements

Date: 2026-11-11
Status: adopted

## Decision

The battle map draws its background image on a canvas, along with light glows when the image fills the board. Everything a person can interact with, and everything whose visibility depends on who is looking, stays as DOM and SVG elements: tokens (still `<button>` elements), the grid, walls, fog, vision, annotations and measurement.

The canvas uses the browser's 2D canvas API. No rendering library is added.

## Why

The DOM renderer paints the whole map image, with its colour filter, and every blurred, blended light glow whenever a new part of the board comes into view. That cost grows with the size of the map and the zoom level. A canvas that covers only the visible area plus a margin has a cost bounded by the size of the window.

Tokens stay elements because they carry the board's accessibility and interaction: focus, keyboard movement, screen-reader names, context menus, drag handling and the existing test coverage all depend on them being buttons. Fog, vision and anything else that hides information from players also stays where it is, so this change cannot alter what a player is able to see.

The 2D canvas API was chosen over PixiJS or another WebGL library because it needs no new dependency and is enough for a still image and a few gradients. The renderer lives behind one module (`apps/web/src/board-canvas-layers.tsx`, with its geometry in `board-canvas-geometry.ts`), so a WebGL implementation can replace it without touching the board component.

## How it works

- One canvas sits where the map image was. It covers the visible part of the board plus 256 px on each side, scrolls with the board, and is redrawn only when scrolling comes within 64 px of its edge.
- A zoom step stretches what is already drawn and redraws once, 140 ms after the last step, at the new size.
- A change that does not affect the map or the lights, such as a token moving, does not redraw the canvas.
- The map image keeps its own opacity and colour filter in the stylesheet; the canvas reads them from the element, so there is one place to change the look.
- Maps up to 4096 x 4096 are kept decoded in memory for drawing.
- The original `<img class="scene-map">` and `.light-source` elements stay in the document. The image is hidden when the canvas is active. The glows stay visible on mapless and letterboxed boards so the browser blends them with the board background. The AI board capture shows both sets of elements and leaves out the canvas.

## Measurements

`pnpm perf:board` builds a large scene (4096 x 3072 map, 300 walls, 12 lights, 50 tokens; 857 elements on the board) against a production build and records frame intervals for four interactions. `OTTE_PERF_RENDERER=dom` measures the DOM renderer for comparison, and `OTTE_PERF_TRACE=1` adds a main-thread breakdown.

Measured on 2026-11-11 in headless Chrome at 1440 x 900 with software rasterisation (no GPU), two runs of the DOM renderer and four of the canvas renderer. "Slow frames" are frames longer than 33 ms.

| Interaction | DOM renderer | Canvas renderer |
| --- | --- | --- |
| Pan (right-drag) | median frame 50 ms; 47 to 56 slow frames of about 70 | median frame 16.7 ms; 0 to 4 slow frames of about 125 |
| Wheel zoom | 10 slow frames of about 72; 95th percentile 66.7 ms | 9 to 19 slow frames of about 74; 95th percentile 50 to 66.7 ms |
| Token drag | 2 to 3 slow frames of about 127 | 2 to 3 slow frames of about 130 |
| Keyboard token move | 21 to 24 slow frames | 14 to 23 slow frames |

Panning is where the canvas helps: the same drag produces about 60 frames a second instead of about 20. Zooming, dragging a token and moving a token by keyboard are unchanged within the run-to-run variation; their cost is elsewhere (layout and React rendering), and this change does not address it. A canvas redraw costs roughly 35 to 70 ms without a GPU, almost all of it the colour filter, which is why redraws are kept rare.

These figures come from a machine without a GPU. On a machine with one, both renderers will be faster and the gap may be smaller or larger; run `pnpm perf:board` there before relying on the numbers.

## Known differences from the DOM renderer

- When the canvas draws the glows, they sit under the grid overlay's tint. With the grid overlay on, the centre of a bright light is slightly dimmer (up to 11 levels in 255 in the comparison test).
- The glow falloff is computed from the same gradient and blur the stylesheet uses, but it is drawn as a gradient, not a blurred element, so it is not pixel-identical.
- A browser spec compares screenshots of both renderers on the same scene and fails if they differ by more than 1.6 levels on average.

## Opting out

- The DOM renderer is used automatically where the browser has no 2D canvas or no canvas `filter` support.
- To force it, set `localStorage["otte:boardRenderer"] = "dom"` and reload. Removing the key returns to the canvas.

## Not done here

- Tokens, grid, walls, fog, vision and annotations are not drawn on the canvas.
- No animated or video maps, weather, particles or shader effects. Those are the point at which a WebGL renderer (PixiJS or similar) is worth its dependency; revisit this decision when one of them is scheduled.
- The cost of zooming and of keyboard token moves.
