import type { Scene, VisionPolygon } from "@open-tabletop/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  BoardDarknessLayer, BoardDifficultTerrainLayer, BoardLightingLayer, BoardStructureHandles, BoardVisionMaskLayer, BoardWallLayer,
  lightPolygonClassName, polygonPoints, titleCaseWallKind, visionPolygonClassName, type BoardStructureHandlers
} from "./board-layers.js";
import { boardRenderCounts } from "./board-render-counts.js";

const polygon = (id: string, extra: Partial<VisionPolygon> = {}): VisionPolygon =>
  ({ id, source: "light", points: [{ x: 0, y: 0 }, { x: 10.5, y: 0 }, { x: 10.5, y: 20 }], ...extra }) as VisionPolygon;
const wall = (id: string, extra: Partial<Scene["walls"][number]> = {}) => ({ id, x1: 100, y1: 200, x2: 300, y2: 200, ...extra }) as Scene["walls"][number];
const light = (id: string) => ({ id, x: 250, y: 100, radius: 200, color: "#ffd27a" }) as Scene["lights"][number];
const handlers: BoardStructureHandlers = { selectWall: () => undefined, togglePortal: () => undefined, selectLight: () => undefined, setLightAnimation: () => undefined };
const memoType = Symbol.for("react.memo");

describe("polygon helpers", () => {
  it("formats points for an SVG polygon", () => {
    expect(polygonPoints(polygon("a"))).toBe("0,0 10.5,0 10.5,20");
    expect(polygonPoints(polygon("empty", { points: [] }))).toBe("");
  });

  it("returns the same text for the same polygon object and separate text for separate objects", () => {
    const shape = polygon("a");
    expect(polygonPoints(shape)).toBe(polygonPoints(shape));
    expect(polygonPoints(polygon("b", { points: [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }] }))).toBe("1,2 3,4 5,6");
  });

  it("names polygon and wall kinds", () => {
    expect(lightPolygonClassName(polygon("a", { lightLevel: "dim" }))).toBe("light-polygon dim");
    expect(lightPolygonClassName(polygon("a"))).toBe("light-polygon");
    expect(visionPolygonClassName(polygon("a", { source: "token", lightLevel: "bright" }))).toBe("vision-outline token bright");
    expect([titleCaseWallKind("terrain"), titleCaseWallKind("door"), titleCaseWallKind("window"), titleCaseWallKind("wall"), titleCaseWallKind(undefined)]).toEqual(["Terrain wall", "Door", "Window", "Wall", "Wall"]);
  });
});

describe("static board layers", () => {
  it("are memoised with the default comparison, so equal props skip the layer", () => {
    for (const layer of [BoardLightingLayer, BoardDarknessLayer, BoardDifficultTerrainLayer, BoardWallLayer, BoardStructureHandles, BoardVisionMaskLayer]) {
      const component = layer as unknown as { $$typeof: symbol; compare: unknown };
      expect(component.$$typeof).toBe(memoType);
      expect(component.compare).toBeNull();
    }
  });

  it("draws light polygons with their colour and opacity, and nothing without any", () => {
    const markup = renderToStaticMarkup(<BoardLightingLayer width={1200} height={800} polygons={[polygon("a", { color: "#7ad1ff", opacity: 0.4, lightLevel: "bright" }), polygon("b")]} />);
    expect(markup).toMatch(/<svg class="lighting-layer" viewBox="0 0 1200 800" aria-hidden="true" style="--light-feather:url\(#[^)]*\)">/);
    expect(markup).toContain('<feGaussianBlur stdDeviation="2"></feGaussianBlur><feComposite in2="SourceGraphic" operator="in">');
    expect(markup).toMatch(/class="light-polygon bright" points="0,0 10.5,0 10.5,20" filter="url\(#[^)]*\)" style="fill:#7ad1ff;opacity:0.4"/);
    expect(markup).toMatch(/class="light-polygon" points="0,0 10.5,0 10.5,20" filter="url\(#[^)]*\)" style="fill:#facc15;opacity:0.22"/);
    expect(renderToStaticMarkup(<BoardLightingLayer width={1200} height={800} polygons={[]} />)).toBe("");
    const invalidLight = renderToStaticMarkup(<BoardLightingLayer width={1200} height={800} polygons={[polygon("c", { color: "url(#other-element)" })]} />);
    expect(invalidLight).toContain("fill:#facc15");
    expect(invalidLight).not.toContain("other-element");
  });

  it("masks mundane and magical darkness separately, with the senses that see through each", () => {
    const markup = renderToStaticMarkup(
      <BoardDarknessLayer width={1200} height={800} present mundane={[polygon("m")]} magical={[polygon("g")]} mundaneBypass={[polygon("dv")]} magicalBypass={[polygon("ts")]} mundaneMaskId="mask-mundane" magicalMaskId="mask-magical" />
    );
    expect(markup).toContain('<mask id="mask-mundane" maskUnits="userSpaceOnUse"><rect width="1200" height="800" fill="black"></rect><polygon points="0,0 10.5,0 10.5,20" fill="white" filter=');
    expect(markup).toContain('<polygon points="0,0 10.5,0 10.5,20" fill="black"></polygon></mask>');
    expect(markup).toContain('<mask id="mask-magical" maskUnits="userSpaceOnUse">');
    expect(markup).toContain('<rect class="darkness-fill mundane" width="1200" height="800" mask="url(#mask-mundane)"></rect>');
    expect(markup).toContain('<rect class="darkness-fill magical" width="1200" height="800" mask="url(#mask-magical)"></rect>');
  });

  it("fills only the kinds of darkness that are present, and is absent without darkness", () => {
    const mundaneOnly = renderToStaticMarkup(<BoardDarknessLayer width={10} height={10} present mundane={[polygon("m")]} magical={[]} mundaneBypass={[]} magicalBypass={[]} mundaneMaskId="a" magicalMaskId="b" />);
    expect(mundaneOnly).toContain("darkness-fill mundane");
    expect(mundaneOnly).not.toContain("darkness-fill magical");
    expect(renderToStaticMarkup(<BoardDarknessLayer width={10} height={10} present={false} mundane={[]} magical={[]} mundaneBypass={[]} magicalBypass={[]} mundaneMaskId="a" magicalMaskId="b" />)).toBe("");
  });

  it("draws every wall as one line in one layer", () => {
    const markup = renderToStaticMarkup(<BoardWallLayer width={1200} height={800} walls={[wall("a"), wall("b", { kind: "door", open: true }), wall("c", { kind: "window" })]} />);
    expect(markup).toContain('<svg class="wall-layer" viewBox="0 0 1200 800" aria-hidden="true"><line class="wall closed" x1="100" y1="200" x2="300" y2="200"></line><line class="door open" x1="100" y1="200" x2="300" y2="200"></line><line class="window closed" x1="100" y1="200" x2="300" y2="200"></line>');
    expect(markup).toContain('<g class="door-glyph open" transform="translate(200 200)">');
    expect(renderToStaticMarkup(<BoardWallLayer width={1200} height={800} walls={[]} />)).toBe("");
  });

  it("labels difficult terrain and is absent without any", () => {
    const regions = [{ id: "r", label: "Rubble", points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }] }] as NonNullable<Scene["difficultTerrain"]>;
    expect(renderToStaticMarkup(<BoardDifficultTerrainLayer width={100} height={50} regions={regions} />)).toBe('<svg class="difficult-terrain-layer" viewBox="0 0 100 50" aria-label="Authored difficult terrain"><polygon points="0,0 5,0 5,5" style="fill:#d97706"><title>Rubble</title></polygon></svg>');
    expect(renderToStaticMarkup(<BoardDifficultTerrainLayer width={100} height={50} regions={[]} />)).toBe("");
  });

  it("gives each wall and light a named handle at its midpoint and marks the selected one", () => {
    const markup = renderToStaticMarkup(
      <BoardStructureHandles width={1000} height={800} walls={[wall("a"), wall("d", { kind: "door", open: true }), wall("t", { kind: "terrain" })]} lights={[light("l")]} selectedWallId="d" selectedLightId={undefined} handlers={handlers} />
    );
    expect(markup).toContain('<div class="annotation-handles structure-handles" aria-label="Wall and light handles">');
    expect(markup).toContain('<button class="structure-handle wall-handle closed " type="button" style="left:20%;top:25%" aria-label="Select wall" title="Wall - click to select, Delete to remove"></button>');
    expect(markup).toContain('<button class="structure-handle door-handle open selected" type="button" style="left:20%;top:25%" aria-label="Select door" title="Door (open) - double-click to close - click to select, Delete to remove"></button>');
    expect(markup).toContain('aria-label="Select terrain wall" title="Terrain wall - click to select, Delete to remove"');
    expect(markup).toContain('<button class="structure-handle light-handle " type="button" style="left:25%;top:12.5%" aria-label="Select light" title="Light - click to select, Delete to remove"></button>');
    const lightSelected = renderToStaticMarkup(<BoardStructureHandles width={1000} height={800} walls={[]} lights={[light("l")]} selectedWallId={undefined} selectedLightId="l" handlers={handlers} />);
    expect(lightSelected).toContain('class="structure-handle light-handle selected"');
  });

  it("dims everything outside revealed areas and outlines revealed and hidden fog", () => {
    const markup = renderToStaticMarkup(<BoardVisionMaskLayer width={1200} height={800} maskId="vision-mask-scene" revealed={[polygon("r", { source: "token", lightLevel: "bright" })]} hidden={[polygon("h", { source: "fog" })]} />);
    expect(markup).toContain('<mask id="vision-mask-scene"><rect width="1200" height="800" fill="white"></rect><polygon points="0,0 10.5,0 10.5,20" fill="black"></polygon><polygon points="0,0 10.5,0 10.5,20" fill="white"></polygon></mask>');
    expect(markup).toContain('<rect class="vision-dim" width="1200" height="800" mask="url(#vision-mask-scene)"></rect>');
    expect(markup).toContain('<polygon class="vision-outline token bright" points="0,0 10.5,0 10.5,20"></polygon>');
    expect(markup).toContain('<polygon class="vision-outline hide" points="0,0 10.5,0 10.5,20"></polygon>');
  });

  it("counts its renders for the tests that check what re-renders", () => {
    const before = { ...boardRenderCounts };
    renderToStaticMarkup(<BoardWallLayer width={10} height={10} walls={[wall("a")]} />);
    renderToStaticMarkup(<BoardLightingLayer width={10} height={10} polygons={[]} />);
    expect(boardRenderCounts.walls).toBe(before.walls + 1);
    expect(boardRenderCounts.lighting).toBe(before.lighting + 1);
    expect(boardRenderCounts.token).toBe(before.token);
  });
});
