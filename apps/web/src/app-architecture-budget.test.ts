import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (name: string) => readFileSync(resolve(__dirname, name), "utf8").replace(/\r\n/g, "\n");
const appSource = source("App.tsx");
const audioSource = source("audio-workspace.tsx");
const actorActionSource = source("actor-action-review.ts");
const campaignSetupSource = source("campaign-setup-state.ts");
const workspaceConstantsSource = source("workspace-ui-constants.ts");
const startupStateSource = source("startup-state.ts");

describe("App shell architecture budget", () => {
  it("keeps the application shell below the decomposition budget", () => {
    expect(appSource.trimEnd().split("\n").length).toBeLessThanOrEqual(11_250);
  });

  it("keeps extracted non-AI concerns behind explicit module boundaries", () => {
    expect(appSource).toContain('from "./audio-workspace.js"');
    expect(appSource).toContain('from "./actor-action-review.js"');
    expect(appSource).toContain('from "./campaign-setup-state.js"');
    expect(appSource).toContain('from "./workspace-ui-constants.js"');
    expect(appSource).toContain('from "./startup-state.js"');
    expect(appSource).not.toContain("function AudioPlaybackLayer(");
    expect(appSource).not.toContain("function AudioSoundboard(");
    expect(appSource).not.toContain("interface PreparedActorActionResponse");
    expect(appSource).not.toContain("interface CampaignSetupProgress");
  });

  it("keeps the extracted modules focused and independent of AI behavior", () => {
    for (const extractedSource of [audioSource, actorActionSource, campaignSetupSource, workspaceConstantsSource, startupStateSource]) {
      expect(extractedSource).not.toMatch(/AiAgent|ai-agent|\/ai\//);
    }
  });
});
