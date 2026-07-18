import type { Combat, CoverLevel, Scene, SceneCoverOverride, ScenePathMeasurement, Token, VisionPoint } from "@open-tabletop/core";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { apiDelete, apiGet, apiPatch, apiPost } from "./api.js";
import { isStaleWriteError } from "./shared-mutation.js";

interface TacticalMapAidsProps {
  scene: Scene;
  tokens: Token[];
  canManage: boolean;
  canMoveTokens: boolean;
  combat?: Combat;
  onSceneChange(scene: Scene): void;
  onTokenChange(token: Token): void;
  onStatus(message: string): void;
}

interface RetryableSceneOperation {
  label: string;
  run(): Promise<Scene>;
}

export function terrainRectanglePoints(x: number, y: number, width: number, height: number): VisionPoint[] | undefined {
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return undefined;
  return [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
}

export function coverLevelLabel(level: CoverLevel): string {
  if (level === "three_quarters") return "Three-quarters cover";
  if (level === "half") return "Half cover";
  if (level === "total") return "Total cover";
  return "No cover";
}

export function sceneCoverOverrideBetween(scene: Scene | undefined, sourceTokenId: string | undefined, targetTokenId: string | undefined): SceneCoverOverride | undefined {
  if (!scene || !sourceTokenId || !targetTokenId) return undefined;
  return (scene.coverOverrides ?? []).find((cover) => cover.sourceTokenId === sourceTokenId && cover.targetTokenId === targetTokenId);
}

export function TacticalMapAids({ scene, tokens, canManage, canMoveTokens, combat, onSceneChange, onTokenChange, onStatus }: TacticalMapAidsProps) {
  const [terrainLabel, setTerrainLabel] = useState("Difficult terrain");
  const [terrainX, setTerrainX] = useState("0");
  const [terrainY, setTerrainY] = useState("0");
  const [terrainWidth, setTerrainWidth] = useState(String(scene.gridSize * 2));
  const [terrainHeight, setTerrainHeight] = useState(String(scene.gridSize * 2));
  const [terrainColor, setTerrainColor] = useState("#d97706");
  const [sourceTokenId, setSourceTokenId] = useState(tokens[0]?.id ?? "");
  const [targetTokenId, setTargetTokenId] = useState(tokens.find((token) => token.id !== tokens[0]?.id)?.id ?? "");
  const [coverLevel, setCoverLevel] = useState<CoverLevel>("half");
  const [coverNote, setCoverNote] = useState("");
  const [measurement, setMeasurement] = useState<ScenePathMeasurement>();
  const [movementReviewOpen, setMovementReviewOpen] = useState(false);
  const [opportunityReviewed, setOpportunityReviewed] = useState(false);
  const [operationStatus, setOperationStatus] = useState<{ kind: "pending" | "success" | "error"; message: string }>();
  const retryRef = useRef<RetryableSceneOperation | undefined>(undefined);
  const sceneTokens = tokens.filter((token) => token.sceneId === scene.id);
  const selectedSourceTokenId = sceneTokens.some((token) => token.id === sourceTokenId) ? sourceTokenId : sceneTokens[0]?.id ?? "";
  const selectedTargetTokenId = sceneTokens.some((token) => token.id === targetTokenId && token.id !== selectedSourceTokenId)
    ? targetTokenId
    : sceneTokens.find((token) => token.id !== selectedSourceTokenId)?.id ?? "";
  const latestRuler = [...(scene.annotations ?? [])].reverse().find((annotation) => annotation.kind === "ruler" && annotation.points.length >= 2);
  const sourceToken = sceneTokens.find((token) => token.id === selectedSourceTokenId);
  const destination = latestRuler?.points.at(-1);
  const potentialOpportunityReactors = sourceToken && combat?.active
    ? sceneTokens.filter((token) => token.id !== sourceToken.id && token.disposition !== "neutral" && sourceToken.disposition !== "neutral" && token.disposition !== sourceToken.disposition && tokenIsAdjacent(scene, sourceToken, token))
    : [];
  const busy = operationStatus?.kind === "pending";

  useEffect(() => {
    setMovementReviewOpen(false);
    setOpportunityReviewed(false);
  }, [latestRuler?.id, selectedSourceTokenId, scene.id]);

  async function runSceneOperation(operation: RetryableSceneOperation): Promise<void> {
    retryRef.current = operation;
    setOperationStatus({ kind: "pending", message: `${operation.label}…` });
    try {
      const updated = await operation.run();
      onSceneChange(updated);
      retryRef.current = undefined;
      setOperationStatus({ kind: "success", message: `${operation.label} complete` });
      onStatus(`${operation.label} complete`);
    } catch (error) {
      if (isStaleWriteError(error)) {
        const latestScene = await apiGet<Scene>(`/api/v1/scenes/${encodeURIComponent(scene.id)}`);
        onSceneChange(latestScene);
        retryRef.current = undefined;
        const message = `${operation.label} was not applied because the scene changed. Review the latest scene and submit again.`;
        setOperationStatus({ kind: "error", message });
        onStatus(message);
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      setOperationStatus({ kind: "error", message: `${operation.label} failed: ${message}` });
      onStatus(`${operation.label} failed: ${message}`);
    }
  }

  function createTerrain(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const points = terrainRectanglePoints(Number(terrainX), Number(terrainY), Number(terrainWidth), Number(terrainHeight));
    if (!points) {
      setOperationStatus({ kind: "error", message: "Create difficult terrain failed: width and height must be positive numbers" });
      return;
    }
    const expectedUpdatedAt = scene.updatedAt;
    const idempotencyKey = newIdempotencyKey();
    void runSceneOperation({
      label: `Create ${terrainLabel.trim() || "difficult terrain"}`,
      run: () => apiPost<Scene>(
        `/api/v1/scenes/${encodeURIComponent(scene.id)}/difficult-terrain`,
        { label: terrainLabel.trim() || "Difficult terrain", points, color: terrainColor, expectedUpdatedAt },
        { idempotencyKey }
      )
    });
  }

  function measureLatestRuler(): void {
    if (!latestRuler) return;
    setOperationStatus({ kind: "pending", message: "Measuring latest ruler…" });
    apiPost<ScenePathMeasurement>(`/api/v1/scenes/${encodeURIComponent(scene.id)}/path-measurement`, { points: latestRuler.points })
      .then((result) => {
        setMeasurement(result);
        setMovementReviewOpen(true);
        setOperationStatus({ kind: "success", message: "Latest ruler measured" });
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        setOperationStatus({ kind: "error", message: `Measure latest ruler failed: ${message}` });
      });
  }

  async function moveTokenAlongLatestRuler(): Promise<void> {
    if (!sourceToken || !destination || !measurement || !canMoveTokens) return;
    if (potentialOpportunityReactors.length > 0 && !opportunityReviewed) {
      setOperationStatus({ kind: "error", message: "Review potential opportunity reactions before committing movement." });
      return;
    }
    const idempotencyKey = newIdempotencyKey();
    const expectedUpdatedAt = sourceToken.updatedAt;
    setOperationStatus({ kind: "pending", message: `Moving ${sourceToken.name}...` });
    try {
      const updated = await apiPatch<Token>(`/api/v1/tokens/${encodeURIComponent(sourceToken.id)}`, {
        x: Math.max(0, destination.x - sourceToken.width / 2),
        y: Math.max(0, destination.y - sourceToken.height / 2),
        expectedUpdatedAt
      }, { idempotencyKey });
      onTokenChange(updated);
      setMovementReviewOpen(false);
      setOpportunityReviewed(false);
      setOperationStatus({ kind: "success", message: `${updated.name} moved after terrain and reaction review.` });
      onStatus(`${updated.name} moved ${formatDistance(measurement.movementCostDistance, measurement.unit)} of movement cost`);
    } catch (error) {
      const stale = isStaleWriteError(error);
      if (stale) onTokenChange(await apiGet<Token>(`/api/v1/tokens/${encodeURIComponent(sourceToken.id)}`));
      const message = stale ? "Token changed before movement was committed. Latest position loaded; measure and review again." : error instanceof Error ? error.message : String(error);
      setOperationStatus({ kind: "error", message });
      onStatus(message);
    }
  }

  function saveCover(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!selectedSourceTokenId || !selectedTargetTokenId) {
      setOperationStatus({ kind: "error", message: "Save cover ruling failed: choose two different scene tokens" });
      return;
    }
    const expectedUpdatedAt = scene.updatedAt;
    const idempotencyKey = newIdempotencyKey();
    void runSceneOperation({
      label: "Save cover ruling",
      run: () => apiPost<Scene>(`/api/v1/scenes/${encodeURIComponent(scene.id)}/cover-overrides`, {
        sourceTokenId: selectedSourceTokenId,
        targetTokenId: selectedTargetTokenId,
        level: coverLevel,
        note: coverNote.trim() || undefined,
        expectedUpdatedAt
      }, { idempotencyKey })
    });
  }

  function deleteTerrain(regionId: string, label: string): void {
    const expectedUpdatedAt = scene.updatedAt;
    const idempotencyKey = newIdempotencyKey();
    const query = new URLSearchParams({ expectedUpdatedAt });
    void runSceneOperation({
      label: `Delete ${label}`,
      run: () => apiDelete<Scene>(
        `/api/v1/scenes/${encodeURIComponent(scene.id)}/difficult-terrain/${encodeURIComponent(regionId)}?${query.toString()}`,
        { idempotencyKey }
      )
    });
  }

  function deleteCover(overrideId: string): void {
    const expectedUpdatedAt = scene.updatedAt;
    const idempotencyKey = newIdempotencyKey();
    const query = new URLSearchParams({ expectedUpdatedAt });
    void runSceneOperation({
      label: "Delete cover ruling",
      run: () => apiDelete<Scene>(
        `/api/v1/scenes/${encodeURIComponent(scene.id)}/cover-overrides/${encodeURIComponent(overrideId)}?${query.toString()}`,
        { idempotencyKey }
      )
    });
  }

  return (
    <details className="tactical-map-aids">
      <summary>Terrain &amp; cover</summary>
      <div className="tactical-map-aids-body">
        <section aria-label="Path measurement assistance">
          <h3>Path assistance</h3>
          <p>Measure difficult-terrain cost, review nearby enemy reactions, then commit the ruler endpoint as an explicit token move. Walls and collisions remain board rulings.</p>
          <label><span>Moving token</span><select aria-label="Token movement source" value={selectedSourceTokenId} disabled={busy} onChange={(event) => setSourceTokenId(event.target.value)}>{sceneTokens.map((token) => <option key={token.id} value={token.id}>{token.name}</option>)}</select></label>
          <button className="ghost-button small" type="button" disabled={!latestRuler || busy} onClick={measureLatestRuler}>
            Measure latest ruler
          </button>
          {measurement && (
            <dl className="tactical-measurement" aria-label="Terrain path measurement" aria-live="polite">
              <div><dt>Normal</dt><dd>{formatDistance(measurement.normalDistance, measurement.unit)}</dd></div>
              <div><dt>Difficult</dt><dd>{formatDistance(measurement.difficultTerrainDistance, measurement.unit)}</dd></div>
              <div><dt>Movement cost</dt><dd>{formatDistance(measurement.movementCostDistance, measurement.unit)}</dd></div>
            </dl>
          )}
          {movementReviewOpen && measurement && sourceToken && destination && (
            <div className="tactical-movement-review" role="region" aria-label="Reviewed token movement">
              <strong>Review {sourceToken.name}'s move</strong>
              <span>Endpoint {Math.round(destination.x)}, {Math.round(destination.y)} - movement cost {formatDistance(measurement.movementCostDistance, measurement.unit)}</span>
              {potentialOpportunityReactors.length > 0 ? (
                <>
                  <p><strong>Potential opportunity reactions:</strong> {potentialOpportunityReactors.map((token) => token.name).join(", ")}. Resolve or decline these reactions at the table before movement commits.</p>
                  <label className="inline-check"><input type="checkbox" checked={opportunityReviewed} onChange={(event) => setOpportunityReviewed(event.target.checked)} /><span>Opportunity reactions reviewed</span></label>
                </>
              ) : <p>No adjacent hostile token was detected at the starting position.</p>}
              <button className="primary-button small" type="button" disabled={!canMoveTokens || busy || (potentialOpportunityReactors.length > 0 && !opportunityReviewed)} onClick={() => void moveTokenAlongLatestRuler()}>Commit reviewed move</button>
            </div>
          )}
        </section>

        <section aria-label="Difficult terrain authoring">
          <h3>Difficult terrain</h3>
          <form className="tactical-grid-form" onSubmit={createTerrain}>
            <label><span>Label</span><input value={terrainLabel} maxLength={80} disabled={!canManage || busy} onChange={(event) => setTerrainLabel(event.target.value)} /></label>
            <label><span>X</span><input type="number" min={0} value={terrainX} disabled={!canManage || busy} onChange={(event) => setTerrainX(event.target.value)} /></label>
            <label><span>Y</span><input type="number" min={0} value={terrainY} disabled={!canManage || busy} onChange={(event) => setTerrainY(event.target.value)} /></label>
            <label><span>Width</span><input type="number" min={1} value={terrainWidth} disabled={!canManage || busy} onChange={(event) => setTerrainWidth(event.target.value)} /></label>
            <label><span>Height</span><input type="number" min={1} value={terrainHeight} disabled={!canManage || busy} onChange={(event) => setTerrainHeight(event.target.value)} /></label>
            <label><span>Color</span><input type="color" value={terrainColor} disabled={!canManage || busy} onChange={(event) => setTerrainColor(event.target.value)} /></label>
            <button className="ghost-button small" type="submit" disabled={!canManage || busy}>Add rectangle</button>
          </form>
          <ul className="tactical-aid-list">
            {(scene.difficultTerrain ?? []).map((region) => (
              <li key={region.id}>
                <span className="tactical-color" style={{ backgroundColor: region.color ?? "#d97706" }} aria-hidden="true" />
                <span>{region.label}</span>
                <button className="ghost-button small" type="button" disabled={!canManage || busy} onClick={() => deleteTerrain(region.id, region.label)}>Delete</button>
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="Manual cover rulings">
          <h3>Manual cover</h3>
          <p>Cover is an explicit ruling for one source-target pair; no geometry is inferred.</p>
          <form className="tactical-grid-form" onSubmit={saveCover}>
            <label><span>Source</span><select value={selectedSourceTokenId} disabled={!canManage || busy} onChange={(event) => setSourceTokenId(event.target.value)}>{sceneTokens.map((token) => <option key={token.id} value={token.id}>{token.name}</option>)}</select></label>
            <label><span>Target</span><select value={selectedTargetTokenId} disabled={!canManage || busy} onChange={(event) => setTargetTokenId(event.target.value)}>{sceneTokens.filter((token) => token.id !== selectedSourceTokenId).map((token) => <option key={token.id} value={token.id}>{token.name}</option>)}</select></label>
            <label><span>Cover</span><select value={coverLevel} disabled={!canManage || busy} onChange={(event) => setCoverLevel(event.target.value as CoverLevel)}><option value="none">None</option><option value="half">Half</option><option value="three_quarters">Three-quarters</option><option value="total">Total</option></select></label>
            <label className="tactical-note"><span>Note</span><input value={coverNote} maxLength={500} disabled={!canManage || busy} onChange={(event) => setCoverNote(event.target.value)} /></label>
            <button className="ghost-button small" type="submit" disabled={!canManage || busy || sceneTokens.length < 2}>Save ruling</button>
          </form>
          <ul className="tactical-aid-list">
            {(scene.coverOverrides ?? []).map((cover) => (
              <li key={cover.id}>
                <span>{tokenName(sceneTokens, cover.sourceTokenId)} → {tokenName(sceneTokens, cover.targetTokenId)}: {coverLevelLabel(cover.level)}{cover.note ? ` — ${cover.note}` : ""}</span>
                <button className="ghost-button small" type="button" disabled={!canManage || busy} onClick={() => deleteCover(cover.id)}>Delete</button>
              </li>
            ))}
          </ul>
        </section>

        {operationStatus && (
          <div className={`tactical-operation ${operationStatus.kind}`} role={operationStatus.kind === "error" ? "alert" : "status"}>
            <span>{operationStatus.message}</span>
            {operationStatus.kind === "error" && retryRef.current && <button className="ghost-button small" type="button" onClick={() => retryRef.current && void runSceneOperation(retryRef.current)}>Retry</button>}
          </div>
        )}
      </div>
    </details>
  );
}

function formatDistance(distance: number, unit: ScenePathMeasurement["unit"]): string {
  return `${Number.isInteger(distance) ? distance.toFixed(0) : distance.toFixed(1)}${unit === "feet" ? " ft" : " units"}`;
}

function tokenName(tokens: readonly Token[], tokenId: string): string {
  return tokens.find((token) => token.id === tokenId)?.name ?? tokenId;
}

function newIdempotencyKey(): string {
  return globalThis.crypto.randomUUID();
}

function tokenIsAdjacent(scene: Scene, source: Token, candidate: Token): boolean {
  if (scene.gridType !== "square" || scene.gridSize <= 0) return false;
  const sourceX = source.x + source.width / 2;
  const sourceY = source.y + source.height / 2;
  const candidateX = candidate.x + candidate.width / 2;
  const candidateY = candidate.y + candidate.height / 2;
  const gridDistance = Math.max(Math.abs(sourceX - candidateX), Math.abs(sourceY - candidateY)) / scene.gridSize;
  return gridDistance <= 1.5;
}
