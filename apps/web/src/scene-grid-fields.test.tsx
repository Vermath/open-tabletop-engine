import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { normalizeSceneGridType, SceneGridFields, sceneGridFormSummary, sceneGridSummary } from "./scene-grid-fields.js";

const noop = () => undefined;

describe("scene grid fields", () => {
  it("falls back legacy or missing grid types to square", () => {
    expect(normalizeSceneGridType(undefined)).toBe("square");
    expect(normalizeSceneGridType("hex")).toBe("square");
    expect(normalizeSceneGridType("gridless")).toBe("gridless");
  });

  it("hides square fields in gridless mode and restores their valid value", () => {
    const gridless = renderToStaticMarkup(<SceneGridFields mode="create" gridType="gridless" gridSize={70} onGridTypeChange={noop} onGridSizeChange={noop} />);
    expect(gridless).toContain('aria-label="Scene grid type"');
    expect(gridless).not.toContain('aria-label="Scene grid size"');
    expect(gridless).toContain("Distance, reach, and area placement require a manual ruling");

    const square = renderToStaticMarkup(<SceneGridFields mode="create" gridType="square" gridSize={70} onGridTypeChange={noop} onGridSizeChange={noop} />);
    expect(square).toContain('aria-label="Scene grid size"');
    expect(square).toContain('value="70"');
  });

  it("serializes accessible edit and setup controls and suppresses hidden overlay state", () => {
    const edit = renderToStaticMarkup(<SceneGridFields mode="edit" gridType="square" gridSize={50} overlayVisible onGridTypeChange={noop} onGridSizeChange={noop} onOverlayVisibleChange={noop} />);
    expect(edit).toContain('aria-label="Edit scene grid type"');
    expect(edit).toContain('name="sceneEditGridType"');
    expect(edit).toContain('name="sceneEditGridSize"');
    expect(edit).toContain("Show VTT grid overlay");

    const gridless = renderToStaticMarkup(<SceneGridFields mode="edit" gridType="gridless" gridSize={50} overlayVisible onGridTypeChange={noop} onGridSizeChange={noop} onOverlayVisibleChange={noop} />);
    expect(gridless).not.toContain("sceneEditGridSize");
    expect(gridless).not.toContain("sceneEditGridOverlayVisible");

    const setup = renderToStaticMarkup(<SceneGridFields mode="setup" gridType="square" gridSize={50} onGridTypeChange={noop} onGridSizeChange={noop} />);
    expect(setup).toContain('aria-label="Setup scene grid type"');
    expect(setup).toContain('aria-label="Setup scene grid size"');
  });

  it("reports truthful square and gridless summaries", () => {
    expect(sceneGridFormSummary("square", 1200, 800, 50)).toBe("24 x 16 squares");
    expect(sceneGridFormSummary("gridless", 1200, 800, 50)).toBe("1200 x 800 px canvas");
    expect(sceneGridSummary({ width: 1200, height: 800, gridType: "gridless", gridSize: 50 })).toBe("1200 x 800 / gridless");
  });
});
