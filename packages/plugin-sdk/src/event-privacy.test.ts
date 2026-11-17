import { describe, expect, it } from "vitest";
import { isPluginEventType, PLUGIN_EVENT_TYPES } from "./index.js";

describe("plugin event privacy boundary", () => {
  it("keeps record-private asset and dice-macro lifecycle events out of plugin subscriptions", () => {
    for (const type of [
      "asset.created",
      "asset.updated",
      "asset.deleted",
      "dice.macro.created",
      "dice.macro.updated",
      "dice.macro.deleted",
    ]) {
      expect(PLUGIN_EVENT_TYPES).not.toContain(type);
      expect(isPluginEventType(type)).toBe(false);
    }
  });
});
