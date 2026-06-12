import { describe, expect, it } from "vitest";
import { makeArchive, seedState } from "./state.js";
import type { Scene } from "./types.js";

describe("campaign archives", () => {
  it("uses one campaign scene collection to archive scenes and tokens", () => {
    const state = seedState();
    const campaign = state.campaigns.find((item) => item.id === "camp_demo")!;
    const baseScene = state.scenes.find((item) => item.id === "scn_vault_entry")!;
    const baseToken = state.tokens.find((item) => item.id === "tok_valen")!;
    state.campaigns.push({ ...campaign, id: "camp_other", name: "Other Campaign" });
    state.scenes.push(
      { ...baseScene, id: "scn_side_room", name: "Side Room", active: false, sortOrder: 2 },
      { ...baseScene, id: "scn_other_campaign", campaignId: "camp_other", name: "Other Campaign Scene", active: false, sortOrder: 1 }
    );
    state.tokens.push(
      { ...baseToken, id: "tok_side_room", sceneId: "scn_side_room" },
      { ...baseToken, id: "tok_other_campaign", sceneId: "scn_other_campaign" },
      { ...baseToken, id: "tok_missing_scene", sceneId: "scn_missing" }
    );
    let sceneFilterCalls = 0;
    state.scenes = new Proxy(state.scenes, {
      get(target, property, receiver) {
        if (property === "filter") {
          return (predicate: (scene: Scene, index: number, scenes: Scene[]) => boolean, thisArg?: unknown): Scene[] => {
            sceneFilterCalls += 1;
            return target.filter(predicate, thisArg);
          };
        }
        return Reflect.get(target, property, receiver);
      }
    });

    const archive = makeArchive(state, "camp_demo");

    expect(archive.data.scenes.map((scene) => scene.id).sort()).toEqual(["scn_side_room", "scn_vault_entry"]);
    expect(archive.data.tokens.map((token) => token.id).sort()).toEqual(["tok_side_room", "tok_valen"]);
    expect(sceneFilterCalls).toBe(1);
  });
});
