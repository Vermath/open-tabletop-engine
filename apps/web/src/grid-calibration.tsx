import type { Scene, VisionPoint } from "@open-tabletop/core";
import { Check, Crosshair, RotateCcw, X } from "lucide-react";
import { useMemo, useState } from "react";
import { formatNumber } from "./sheet-format.js";

export interface GridCalibrationResult {
  distance: number;
  cellsBetween: number;
  gridSize: number;
}

export function gridCalibrationResult(points: VisionPoint[], cellsBetween: number): GridCalibrationResult | undefined {
  if (points.length !== 2 || !Number.isFinite(cellsBetween) || cellsBetween <= 0) return undefined;
  const [start, end] = points;
  if (!start || !end) return undefined;
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  if (!Number.isFinite(distance) || distance < 2) return undefined;
  const gridSize = Math.max(2, Math.round((distance / cellsBetween) * 100) / 100);
  return { distance, cellsBetween, gridSize };
}

export function appendGridCalibrationPoint(points: VisionPoint[], point: VisionPoint): VisionPoint[] {
  const rounded = { x: Math.round(point.x * 100) / 100, y: Math.round(point.y * 100) / 100 };
  return points.length >= 2 ? [rounded] : [...points, rounded];
}

export function GridCalibrationPanel(props: {
  scene: Scene;
  points: VisionPoint[];
  onPointsChange(points: VisionPoint[]): void;
  onApply(gridSize: number): Promise<void>;
  onClose(): void;
}) {
  const [cellsBetween, setCellsBetween] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const result = useMemo(() => gridCalibrationResult(props.points, Number(cellsBetween)), [cellsBetween, props.points]);

  function updatePoint(index: number, axis: "x" | "y", value: string) {
    const coordinate = Number(value);
    if (!Number.isFinite(coordinate)) return;
    const fallback = index === 0 ? { x: 0, y: 0 } : { x: props.scene.gridSize, y: 0 };
    const next = [...props.points];
    next[index] = { ...(next[index] ?? fallback), [axis]: coordinate };
    props.onPointsChange(next.slice(0, 2));
  }

  async function apply() {
    if (!result || busy) return;
    setBusy(true);
    setError("");
    try {
      await props.onApply(result.gridSize);
      props.onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="grid-calibration-panel" aria-labelledby="grid-calibration-title">
      <header className="operator-heading">
        <div>
          <div className="section-title">Grid calibration</div>
          <h2 id="grid-calibration-title">Match the map grid</h2>
        </div>
        <button className="icon-button" type="button" aria-label="Close grid calibration" disabled={busy} onClick={props.onClose}><X size={15} /></button>
      </header>
      <p><Crosshair size={14} aria-hidden="true" /> Select two matching grid lines on the board, then enter how many cells lie between them.</p>
      <div className="grid-calibration-coordinates">
        {[0, 1].map((index) => (
          <fieldset key={index}>
            <legend>{index === 0 ? "First line" : "Second line"}</legend>
            <label><span>X</span><input aria-label={`${index === 0 ? "First" : "Second"} calibration point X`} type="number" value={props.points[index]?.x ?? ""} onChange={(event) => updatePoint(index, "x", event.target.value)} /></label>
            <label><span>Y</span><input aria-label={`${index === 0 ? "First" : "Second"} calibration point Y`} type="number" value={props.points[index]?.y ?? ""} onChange={(event) => updatePoint(index, "y", event.target.value)} /></label>
          </fieldset>
        ))}
      </div>
      <label className="grid-calibration-cell-count">
        <span>Cells between lines</span>
        <input aria-label="Grid cells between calibration points" type="number" min={1} step={1} value={cellsBetween} onChange={(event) => setCellsBetween(event.target.value)} />
      </label>
      <div className="grid-calibration-review" role="status" aria-live="polite">
        {result ? (
          <>
            <span>Measured {formatNumber(result.distance)} scene pixels</span>
            <strong>Recommended grid: {formatNumber(result.gridSize)} px</strong>
            <span>Current grid: {formatNumber(props.scene.gridSize)} px</span>
          </>
        ) : <span>Select both points to calculate a grid size.</span>}
      </div>
      {error && <p className="creator-error" role="alert">Calibration failed: {error}</p>}
      <div className="button-row wrap">
        <button className="ghost-button" type="button" disabled={busy || props.points.length === 0} onClick={() => props.onPointsChange([])}><RotateCcw size={14} /> Clear points</button>
        <button className="primary-button" type="button" disabled={busy || !result} onClick={() => void apply()}><Check size={14} /> {busy ? "Applying..." : "Apply square grid"}</button>
      </div>
    </section>
  );
}
