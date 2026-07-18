export const boardCaptureMaxPixels = 4_000_000;
export const boardCaptureMaxPixelRatio = 2;

/**
 * Keeps live-agent board captures bounded independently of scene dimensions and
 * browser zoom. The captured element is already viewport-sized; this prevents a
 * high-DPI display or a zoomed board from multiplying its raster cost without
 * bound while retaining enough resolution for visual verification.
 */
export function boundedBoardCapturePixelRatio(
  width: number,
  height: number,
  devicePixelRatio: number,
  maxPixels = boardCaptureMaxPixels
): number {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 1;
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 1;
  const safeDeviceRatio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const safeMaxPixels = Number.isFinite(maxPixels) && maxPixels > 0 ? maxPixels : boardCaptureMaxPixels;
  const pixelBudgetRatio = Math.sqrt(safeMaxPixels / (safeWidth * safeHeight));
  return Math.min(boardCaptureMaxPixelRatio, safeDeviceRatio, pixelBudgetRatio);
}
