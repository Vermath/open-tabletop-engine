import { describe, expect, it } from "vitest";
import { createEvent, type EngineEventType } from "./index.js";

describe("engine lifecycle events", () => {
  it("models asset and dice-macro mutations as first-class events", () => {
    const types = [
      "asset.created",
      "asset.updated",
      "asset.deleted",
      "dice.macro.created",
      "dice.macro.updated",
      "dice.macro.deleted",
    ] satisfies EngineEventType[];

    expect(
      types.map((type) =>
        createEvent({
          campaignId: "camp_events",
          type,
          targetId: "target_events",
          payload: { id: "target_events" },
        }),
      ),
    ).toEqual(
      types.map((type) =>
        expect.objectContaining({
          campaignId: "camp_events",
          type,
          targetId: "target_events",
        }),
      ),
    );
  });
});
