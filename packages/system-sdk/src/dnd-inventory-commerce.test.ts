import { createTimestamped, type Actor, type Dnd5eInventoryOwnerRef, type Item } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import {
  DND5E_INVENTORY_METADATA_KEY,
  DND5E_MERCHANT_DATA_KEY,
  DND5E_MERCHANT_ITEM_TYPE,
  dnd5eCurrencyAdd,
  dnd5eCurrencyToCopper,
  dnd5eInventoryApplyPatch,
  dnd5eInventoryAssertGraph,
  dnd5eInventoryGraphIssues,
  dnd5eInventorySummary,
  dnd5eInventoryTransferPlan,
  dnd5eMerchantData,
} from "./dnd-inventory-commerce.js";

const actor = createTimestamped("act", {
  id: "act_inventory",
  campaignId: "camp_inventory",
  systemId: "dnd-5e-srd",
  ownerUserId: "usr_player",
  type: "character",
  name: "Carrier",
  data: { attributes: { strength: 10 }, size: "medium" },
  permissions: {}
}) satisfies Actor;

const actorOwner: Dnd5eInventoryOwnerRef = { kind: "actor", actorId: actor.id };
const stashOwner: Dnd5eInventoryOwnerRef = { kind: "party_stash", stashId: "itm_stash" };

function inventoryItem(id: string, name: string, data: Record<string, unknown>, actorId: string | null = actor.id): Item {
  return createTimestamped("itm", {
    id,
    campaignId: actor.campaignId,
    systemId: actor.systemId,
    actorId: actorId ?? undefined,
    type: "gear",
    name,
    data
  });
}

describe("D&D inventory and commerce rules", () => {
  it("rejects non-container parents, cycles, cross-owner parents, and excessive depth", () => {
    const pouch = inventoryItem("itm_pouch", "Pouch", { capacityLb: 6, weightLb: 1 });
    const stone = dnd5eInventoryApplyPatch(inventoryItem("itm_stone", "Stone", { weightLb: 1 }), { parentItemId: pouch.id });
    expect(() => dnd5eInventoryAssertGraph([pouch, stone])).not.toThrow();

    const cyclePouch = dnd5eInventoryApplyPatch(pouch, { parentItemId: stone.id });
    expect(dnd5eInventoryGraphIssues([cyclePouch, stone]).map((issue) => issue.code)).toContain("container_cycle");

    const notContainer = inventoryItem("itm_not_container", "Not a container", { weightLb: 1 });
    expect(dnd5eInventoryGraphIssues([notContainer, dnd5eInventoryApplyPatch(stone, { parentItemId: notContainer.id })])).toContainEqual(expect.objectContaining({ code: "parent_not_container" }));

    const foreignPouch = dnd5eInventoryApplyPatch(inventoryItem("itm_foreign", "Stash pouch", { capacityLb: 6 }, null), {});
    foreignPouch.data[DND5E_INVENTORY_METADATA_KEY] = { ...foreignPouch.data[DND5E_INVENTORY_METADATA_KEY] as object, storage: { kind: "party_stash", stashId: "itm_stash" } };
    expect(dnd5eInventoryGraphIssues([foreignPouch, dnd5eInventoryApplyPatch(stone, { parentItemId: foreignPouch.id })])).toContainEqual(expect.objectContaining({ code: "foreign_parent" }));

    const nested: Item[] = [];
    for (let index = 0; index < 7; index += 1) {
      nested.push(dnd5eInventoryApplyPatch(inventoryItem(`itm_depth_${index}`, `Bag ${index}`, { capacityLb: 20 }), { parentItemId: index === 0 ? null : `itm_depth_${index - 1}` }));
    }
    expect(dnd5eInventoryGraphIssues(nested)).toContainEqual(expect.objectContaining({ code: "container_depth", itemId: "itm_depth_6" }));
  });

  it("computes quantity-aware carried weight, container warnings, and extradimensional exclusions", () => {
    const backpack = dnd5eInventoryApplyPatch(inventoryItem("itm_backpack", "Backpack", { weightLb: 5, capacityLb: 30 }), {});
    const rations = dnd5eInventoryApplyPatch(inventoryItem("itm_rations", "Rations", { weightLb: 2 }), { quantity: 20, parentItemId: backpack.id });
    const holding = dnd5eInventoryApplyPatch(inventoryItem("itm_holding", "Bag of Holding", { weightLb: 15, capacityLb: 500, extradimensionalStorage: true }), {});
    const armor = dnd5eInventoryApplyPatch(inventoryItem("itm_armor", "Plate", { weightLb: 65 }), { parentItemId: holding.id });
    const summary = dnd5eInventorySummary(actorOwner, [backpack, rations, holding, armor], { actor });

    expect(summary).toMatchObject({ carriedWeightLb: 60, capacityLb: 150, status: "within_capacity" });
    expect(summary.containers.find((container) => container.itemId === backpack.id)).toMatchObject({ contentsWeightLb: 40, overCapacityByLb: 10 });
    expect(summary.warnings).toEqual(expect.arrayContaining([expect.stringContaining("Backpack is 10 lb over capacity"), expect.stringContaining("GM adjudication")]));
  });

  it("splits ordinary stacks and moves a full container subtree transactionally", () => {
    const arrows = dnd5eInventoryApplyPatch(inventoryItem("itm_arrows", "Arrows", { ammunition: "arrow", weightLb: 0.05 }), { quantity: 20 });
    const split = dnd5eInventoryTransferPlan([arrows], arrows.id, 5, stashOwner, { id: "itm_split", createdAt: arrows.createdAt, updatedAt: arrows.updatedAt });
    expect(split.updatedItems[0]!.data.quantity).toBe(15);
    expect(split.createdItem).toMatchObject({ id: "itm_split", actorId: undefined, data: { quantity: 5, dnd5eInventory: { storage: { kind: "party_stash", stashId: "itm_stash" } } } });

    const pack = dnd5eInventoryApplyPatch(inventoryItem("itm_pack", "Pack", { capacityLb: 30, weightLb: 5 }), {});
    const rope = dnd5eInventoryApplyPatch(inventoryItem("itm_rope", "Rope", { weightLb: 10 }), { parentItemId: pack.id });
    expect(() => dnd5eInventoryTransferPlan([pack, rope], pack.id, 0, stashOwner, { id: "unused", createdAt: pack.createdAt, updatedAt: pack.updatedAt })).toThrow();
    const moved = dnd5eInventoryTransferPlan([pack, rope], pack.id, 1, stashOwner, { id: "unused", createdAt: pack.createdAt, updatedAt: pack.updatedAt });
    expect(moved.movedItemIds).toEqual([pack.id, rope.id]);
    expect(moved.updatedItems[0]!.data.dnd5eInventory).toMatchObject({ storage: { kind: "party_stash", stashId: "itm_stash" } });
    expect(moved.updatedItems[1]!.data.dnd5eInventory).toMatchObject({ parentItemId: pack.id });
  });

  it("uses copper-exact currency and validates typed merchant catalogs", () => {
    expect(dnd5eCurrencyToCopper({ gp: 1, sp: 2, cp: 3 })).toBe(123);
    expect(dnd5eCurrencyAdd({ gp: 1 }, -25)).toEqual({ gp: 0, sp: 7, cp: 5 });
    expect(() => dnd5eCurrencyAdd({ cp: 1 }, -2)).toThrow("Insufficient currency");

    const merchant = inventoryItem("itm_merchant", "Quartermaster", {
      [DND5E_MERCHANT_DATA_KEY]: {
        version: 1,
        name: "Quartermaster",
        description: "Field supplies",
        buybackRate: 0.5,
        catalog: [{ id: "arrows", name: "Arrows", type: "gear", unitPriceGp: 0.05, availableQuantity: 40, data: { ammunition: "arrow", weightLb: 0.05 } }]
      }
    }, null);
    merchant.type = DND5E_MERCHANT_ITEM_TYPE;
    expect(dnd5eMerchantData(merchant)).toMatchObject({ buybackRate: 0.5, catalog: [{ id: "arrows", availableQuantity: 40 }] });
  });
});
