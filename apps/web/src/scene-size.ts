export type SceneSizePresetId = "standard" | "large" | "huge" | "square";

export interface SceneSizeCells {
  columns: number;
  rows: number;
}

export interface SceneSizePreset extends SceneSizeCells {
  id: SceneSizePresetId;
  label: string;
  description: string;
}

export const sceneSizePresets: SceneSizePreset[] = [
  { id: "standard", label: "24 x 16", description: "Default", columns: 24, rows: 16 },
  { id: "large", label: "48 x 32", description: "Large", columns: 48, rows: 32 },
  { id: "huge", label: "72 x 48", description: "Huge", columns: 72, rows: 48 },
  { id: "square", label: "60 x 60", description: "Square", columns: 60, rows: 60 }
];

export function sceneDimensionsFromCells(size: SceneSizeCells, gridSize: number): { width: number; height: number } {
  const safeGridSize = normalizeSceneSizeValue(gridSize, 50);
  return {
    width: normalizeSceneSizeValue(size.columns, 24) * safeGridSize,
    height: normalizeSceneSizeValue(size.rows, 16) * safeGridSize
  };
}

export function sceneGridCellSummary(width: number, height: number, gridSize: number): string {
  const safeGridSize = normalizeSceneSizeValue(gridSize, 50);
  const columns = Math.max(1, Math.round(normalizeSceneSizeValue(width, 1200) / safeGridSize));
  const rows = Math.max(1, Math.round(normalizeSceneSizeValue(height, 800) / safeGridSize));
  return `${columns} x ${rows} squares`;
}

export function normalizeSceneSizeValue(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
}
