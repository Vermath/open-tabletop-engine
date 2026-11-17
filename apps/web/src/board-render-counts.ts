/**
 * How many times each memoised board layer has rendered. Read by the board
 * performance harness and by the browser test that asserts a token move does
 * not re-render the rest of the board; nothing in the app depends on it.
 */
export const boardRenderCounts = {
  token: 0,
  lighting: 0,
  darkness: 0,
  difficultTerrain: 0,
  walls: 0,
  structureHandles: 0,
  visionMask: 0
};

export type BoardRenderLayer = keyof typeof boardRenderCounts;

declare global {
  interface Window { __otteBoardRenderCounts?: typeof boardRenderCounts }
}

if (typeof window !== "undefined") window.__otteBoardRenderCounts = boardRenderCounts;
