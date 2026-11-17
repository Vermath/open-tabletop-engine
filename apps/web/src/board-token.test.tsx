import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { boardRenderCounts } from "./board-render-counts.js";
import { BoardToken, type BoardTokenHandlers, type BoardTokenProps } from "./board-token.js";

const noop = () => undefined;
const handlers: BoardTokenHandlers = { contextMenu: noop, click: noop, keyDown: noop, pointerDown: noop, pointerMove: noop, pointerUp: noop, pointerCancel: noop, lostPointerCapture: noop, resizePointerDown: noop };
const base: BoardTokenProps = {
  id: "tok_hero", name: "Valen Ash", layer: "player", layerLabel: "Player Objects & Tokens", activeLayer: true, disposition: "friendly", imageUrl: undefined,
  selected: false, primarySelected: false, targeted: false, auraCount: 0, dragging: false, turnState: undefined,
  left: 40, top: 37.5, width: 5, height: 6.25, rotation: 0, elevation: 0, hpRatio: undefined, showVitals: false, conditions: "[]",
  readOnly: false, canMove: true, calibrationActive: false, describedBy: "board-help", resizeHandles: undefined, handlers
};
const render = (overrides: Partial<BoardTokenProps> = {}) => renderToStaticMarkup(<BoardToken {...base} {...overrides} />);

// Every prop but the two stable references must be a primitive, or the default memo comparison would not be exact.
type ReferenceProps = { [Key in keyof BoardTokenProps]-?: BoardTokenProps[Key] extends string | number | boolean | undefined ? never : Key }[keyof BoardTokenProps];
const onlyStableReferences: Exclude<ReferenceProps, "handlers" | "resizeHandles"> extends never ? true : false = true;

describe("board token", () => {
  it("is memoised with the default comparison over primitive props", () => {
    const component = BoardToken as unknown as { $$typeof: symbol; compare: unknown };
    expect(component.$$typeof).toBe(Symbol.for("react.memo"));
    expect(component.compare).toBeNull();
    expect(onlyStableReferences).toBe(true);
  });

  it("is a button positioned in scene percentages, named for assistive technology", () => {
    const markup = render();
    expect(markup).toMatch(/^<button class="token layer-player active-layer friendly +" data-token-id="tok_hero" aria-haspopup="menu" style="left:40%;top:37\.5%;width:5%;height:6\.25%;--token-tint:var\(--[a-z]+\)"/);
    expect(markup.match(/class="([^"]*)"/)![1]!.split(" ").filter(Boolean)).toEqual(["token", "layer-player", "active-layer", "friendly"]);
    expect(markup).toContain('aria-label="Player Objects &amp; Tokens token Valen Ash"');
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain('aria-describedby="board-help"');
    expect(markup).toContain('aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"');
    expect(markup).toContain('title="Arrow keys move; Shift moves 1 px; right-click for token actions"');
    expect(markup).toContain('<span class="token-visual" style="transform:rotate(0deg)" aria-hidden="true"><span class="token-label">VA</span></span><span class="token-nameplate" aria-hidden="true">Valen Ash</span>');
    expect(markup).not.toContain("tabindex");
  });

  it("carries every state class in the same order the stylesheet and tests expect", () => {
    const markup = render({ layer: "gm", activeLayer: false, disposition: "hostile", imageUrl: "blob:art", selected: true, primarySelected: true, targeted: true, auraCount: 2, dragging: true, turnState: "current", hpRatio: 0.4 });
    expect(markup).toContain('class="token layer-gm inactive-layer hostile has-image selected primary-selected targeted has-aura dragging turn-current  bloodied"');
    expect(markup).toContain('data-turn-state="current"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('<img class="token-image" src="blob:art" alt="" draggable="false"/>');
    expect(markup).toContain('<small class="token-aura-count">2</small>');
    expect(markup).toContain('<span class="token-turn-ring current" aria-hidden="true"></span>');
  });

  it("marks the next turn without colour alone and says so in the name", () => {
    const markup = render({ turnState: "next" });
    expect(markup).toContain("turn-next");
    expect(markup).toContain('data-turn-state="next"');
    expect(markup).toContain('aria-label="Player Objects &amp; Tokens token Valen Ash, up next"');
    expect(markup).toContain('<span class="token-turn-ring next" aria-hidden="true"></span>');
    expect(render({ turnState: "current" })).toContain("token Valen Ash, current turn");
  });

  it("shows the bloodied and down looks from the ratio but the bar only to those allowed to see it", () => {
    const hidden = render({ hpRatio: 0.5, showVitals: false });
    expect(hidden).toContain(" bloodied");
    expect(hidden).not.toContain("token-hp");
    const shown = render({ hpRatio: 0.5, showVitals: true });
    expect(shown).toContain('<span class="token-hp warning" aria-hidden="true"><span style="--token-hp-fill:50%"></span></span>');
    expect(render({ hpRatio: 0.2, showVitals: true })).toContain('class="token-hp danger"');
    expect(render({ hpRatio: 0.9, showVitals: true })).toContain('class="token-hp healthy"');
    expect(render({ hpRatio: 0, showVitals: true })).toContain(' down"');
    expect(render({ hpRatio: 0.9 })).not.toMatch(/bloodied|down/);
    expect(render({ hpRatio: undefined, showVitals: true })).toContain('class="token-hp "');
  });

  it("states elevation in the name and on the token", () => {
    const above = render({ elevation: 10 });
    expect(above).toContain("token Valen Ash at 10 feet above ground");
    expect(above).toContain('<small class="token-elevation" aria-hidden="true" title="10 feet above ground">+10 ft</small>');
    const below = render({ elevation: -5, turnState: "current" });
    expect(below).toContain("token Valen Ash at 5 feet below ground, current turn");
    expect(below).toContain('title="5 feet below ground">-5 ft</small>');
    expect(render()).not.toContain("token-elevation");
  });

  it("shows up to three conditions and counts the rest", () => {
    expect(render()).not.toContain("token-conditions");
    const two = render({ conditions: JSON.stringify(["Prone", "Poisoned"]) });
    expect(two).toContain('title="Prone, Poisoned"');
    expect(two).toContain('title="Prone"><svg');
    expect(two).toContain('title="Poisoned"><svg');
    const descriptionId = two.match(/<span class="token-condition-description" id="([^"]+)">Prone, Poisoned/)?.[1];
    expect(descriptionId).toBeDefined();
    expect(two).toContain('aria-describedby="board-help ' + descriptionId + '"');
    const five = render({ conditions: JSON.stringify(["A", "B", "C", "D", "E"]) });
    expect(five).toContain('title="A, B, C, D, E"');
    expect(five.match(/token-condition-chip"/g)).toHaveLength(3);
    expect(five).toContain('<small class="token-condition-chip overflow">+2</small>');
    expect(render({ conditions: JSON.stringify(['Odd "name", with, commas']) })).toContain("Odd &quot;name&quot;, with, commas");
  });

  it("uses distinct icons for charmed, stunned, grappled and restrained", () => {
    const icons = (conditions: string[]) => render({ conditions: JSON.stringify(conditions) });
    expect(icons(["Charmed", "Stunned"])).toMatch(/title="Charmed"><svg[^>]+lucide-sparkles.*title="Stunned"><svg[^>]+lucide-zap/);
    expect(icons(["Grappled", "Restrained"])).toMatch(/title="Grappled"><svg[^>]+lucide-link.*title="Restrained"><svg[^>]+lucide-lock-keyhole/);
  });

  it("rotates only the artwork", () => {
    const markup = render({ rotation: 45, imageUrl: "blob:art" });
    expect(markup).toContain('<span class="token-visual" style="transform:rotate(45deg)" aria-hidden="true">');
    expect(markup).toContain("left:40%;top:37.5%;width:5%;height:6.25%");
  });

  it("is inert and plainly titled for a read-only viewer", () => {
    const markup = render({ readOnly: true });
    expect(markup).toContain('tabindex="-1"');
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).toContain('title="Valen Ash"');
    expect(markup).not.toContain("aria-haspopup");
  });

  it("explains a missing move permission and drops the arrow-key hint", () => {
    const markup = render({ canMove: false });
    expect(markup).toContain('title="Token movement requires token.move"');
    expect(markup).not.toContain("aria-keyshortcuts");
  });

  it("lets pointer input through during grid calibration", () => {
    const markup = render({ calibrationActive: true });
    expect(markup).toContain("pointer-events:none");
    expect(markup).toContain('tabindex="-1"');
  });

  it("shows resize corners only when given handles", () => {
    expect(render()).not.toContain("token-selection-frame");
    const markup = render({ selected: true, resizeHandles: [{ id: "ne", label: "Resize from top right" }, { id: "sw", label: "Resize from bottom left" }] });
    expect(markup).toContain('<span class="token-selection-frame" aria-hidden="true"></span><span class="token-resize-corner handle-ne" title="Resize from top right"></span><span class="token-resize-corner handle-sw" title="Resize from bottom left"></span>');
  });

  it("counts its renders", () => {
    const before = boardRenderCounts.token;
    render();
    expect(boardRenderCounts.token).toBe(before + 1);
  });
});
