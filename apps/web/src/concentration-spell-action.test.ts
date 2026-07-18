import type { Actor, Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";

import { actorActionOptions, actorConcentrationLabel } from "./actor-sheet-data.js";

const timestamp = "2026-07-15T00:00:00.000Z";

const actor: Actor = {
  id: "act_concentrating_bard",
  campaignId: "camp_concentration",
  systemId: "dnd-5e-srd",
  type: "character",
  name: "Mira Embervoice",
  data: {},
  permissions: {},
  createdAt: timestamp,
  updatedAt: timestamp,
};

const dancingLights: Item = {
  id: "itm_dancing_lights",
  campaignId: actor.campaignId,
  systemId: actor.systemId,
  actorId: actor.id,
  type: "spell",
  name: "Dancing Lights",
  data: { level: 0, prepared: true, concentration: true, duration: "1 minute" },
  createdAt: timestamp,
  updatedAt: timestamp,
};

describe("concentration spell action", () => {
  it("exposes an owned prepared concentration-only spell through the public action sheet", () => {
    expect(actorActionOptions(actor, [dancingLights])).toContainEqual({
      rollId: "spell-itm_dancing_lights-effect",
      label: "Dancing Lights Effect",
      description: "Dancing Lights Effect: concentration",
      actionKind: "action",
    });

    expect(actorActionOptions(actor, [{ ...dancingLights, data: { ...dancingLights.data, prepared: false } }])).not.toContainEqual(
      expect.objectContaining({ rollId: "spell-itm_dancing_lights-effect" }),
    );
    expect(actorActionOptions(actor, [{ ...dancingLights, data: { ...dancingLights.data, damageFormula: "1d8" } }])).not.toContainEqual(
      expect.objectContaining({ rollId: "spell-itm_dancing_lights-effect" }),
    );
  });

  it("reads the persisted resolver label for the active-concentration badge", () => {
    expect(actorConcentrationLabel({
      ...actor,
      data: { rulesEngine: { concentration: { rollId: "spell-itm_dancing_lights-effect", label: "Dancing Lights Effect" } } },
    })).toBe("Dancing Lights Effect");
  });
});
