import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { deferredPanelImporters, DeferredPanelErrorBoundary } from "./deferred-panels.js";

describe("deferred workspace panels", () => {
  it("resolves every direct-navigation module without the App entry eagerly importing it", async () => {
    const importers = Object.values(deferredPanelImporters);
    const modules = await Promise.all(importers.map((load) => load()));

    expect(modules.map((module) => Object.values(module).some((value) => typeof value === "function"))).toEqual(Array(importers.length).fill(true));
  }, 60_000);

  it("offers explicit recovery when a deferred chunk fails", () => {
    const boundary = new DeferredPanelErrorBoundary({ label: "AI Studio", children: null });
    boundary.state = DeferredPanelErrorBoundary.getDerivedStateFromError();
    const html = renderToStaticMarkup(boundary.render());

    expect(html).toContain('role="alert"');
    expect(html).toContain("The AI Studio could not be loaded.");
    expect(html).toContain("Reload workspace");
  });
});
