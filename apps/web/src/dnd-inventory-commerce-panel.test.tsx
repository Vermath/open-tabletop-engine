import { renderToStaticMarkup } from "react-dom/server";
import type { Actor, Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import {
  DndInventoryCommercePanel,
  dndCurrencyLabel,
  dndInventoryMetadata,
  dndLootData,
  dndMerchantData,
} from "./dnd-inventory-commerce-panel.js";

const actor: Actor = {
  id: "act_inventory_ui",
  campaignId: "camp_inventory_ui",
  systemId: "dnd-5e-srd",
  ownerUserId: "usr_player",
  type: "character",
  name: "Mira",
  data: {},
  permissions: {},
  createdAt: "2026-07-13T00:00:00.000Z",
  updatedAt: "2026-07-13T00:00:00.000Z",
};

function item(data: Record<string, unknown>): Item {
  return {
    id: "itm_inventory_ui",
    campaignId: actor.campaignId,
    systemId: actor.systemId,
    actorId: actor.id,
    type: "gear",
    name: "Field pack",
    data,
    createdAt: actor.createdAt,
    updatedAt: actor.updatedAt,
  };
}

describe("DndInventoryCommercePanel", () => {
  it("renders an accessible loading state before the permission-safe overview resolves", () => {
    const html = renderToStaticMarkup(
      <DndInventoryCommercePanel
        campaignId={actor.campaignId}
        actor={actor}
        canUpdateActor
        canManageCampaign={false}
        canManageCombat={false}
      />,
    );
    expect(html).toContain('aria-label="D&amp;D inventory and commerce"');
    expect(html).toContain('role="status"');
    expect(html).toContain("Loading inventory and commerce");
  });

  it("normalizes typed container, merchant, loot, and currency data for the controls", () => {
    expect(dndInventoryMetadata(item({
      dnd5eInventory: { version: 1, quantity: 3, weightLb: 2, container: { capacityLb: 30, extradimensional: true } },
    }))).toMatchObject({ quantity: 3, weightLb: 2, container: { capacityLb: 30, extradimensional: true } });

    expect(dndMerchantData(item({
      dnd5eMerchant: { version: 1, name: "Quartermaster", description: "", buybackRate: 0.5, catalog: [] },
    }))?.name).toBe("Quartermaster");

    expect(dndLootData(item({
      dnd5eLoot: { version: 1, combatId: "cmb_ui", rewardId: "rwd_ui", status: "claimed" },
    }))?.status).toBe("claimed");

    expect(dndCurrencyLabel({ gp: 4, sp: 2, cp: 0 })).toBe("4 gp, 2 sp");
    expect(dndCurrencyLabel({})).toBe("0 gp");
  });
});
