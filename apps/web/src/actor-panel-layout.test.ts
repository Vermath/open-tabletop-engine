import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");
const stylesSource = readFileSync(resolve(__dirname, "styles.css"), "utf8");

describe("actor panel layout", () => {
  it("keeps dense actor and token details collapsed in the inspector and exposes a wide sheet surface", () => {
    expect(appSource).toContain("actor-sidebar-summary");
    expect(appSource).toContain("actor-detail-disclosure");
    expect(appSource).toContain("actor-token-editor");
    expect(stylesSource).toContain(".actor-sheet-dialog");
    expect(stylesSource).toContain(".actor-sidebar-summary");
  });
});
