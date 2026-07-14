import type {
  Actor,
  Dnd5eCarryingSummary,
  Dnd5eContainerSummary,
  Dnd5eInventoryMetadata,
  Dnd5eInventoryOwnerRef,
  Dnd5eLootData,
  Dnd5eMerchantCatalogEntry,
  Dnd5eMerchantData,
  Dnd5ePartyStashData,
  Item,
} from "@open-tabletop/core";

export const DND5E_INVENTORY_MAX_CONTAINER_DEPTH = 5;
export const DND5E_PARTY_STASH_ITEM_TYPE = "dnd5e-party-stash";
export const DND5E_MERCHANT_ITEM_TYPE = "dnd5e-merchant";
export const DND5E_INVENTORY_METADATA_KEY = "dnd5eInventory";
export const DND5E_PARTY_STASH_DATA_KEY = "dnd5ePartyStash";
export const DND5E_MERCHANT_DATA_KEY = "dnd5eMerchant";
export const DND5E_LOOT_DATA_KEY = "dnd5eLoot";

const DND5E_SYSTEM_ID = "dnd-5e-srd";

export interface Dnd5eInventoryGraphIssue {
  code:
    | "missing_parent"
    | "foreign_parent"
    | "parent_not_container"
    | "container_cycle"
    | "container_depth"
    | "missing_ammunition"
    | "foreign_ammunition"
    | "ammunition_mismatch";
  itemId: string;
  message: string;
}

export interface Dnd5eInventoryPatchInput {
  quantity?: number;
  weightLb?: number;
  parentItemId?: string | null;
  containerCapacityLb?: number | null;
  extradimensional?: boolean;
  ammunitionSourceItemId?: string | null;
}

export interface Dnd5eInventoryTransferPlan {
  sourceOwner: Dnd5eInventoryOwnerRef;
  destinationOwner: Dnd5eInventoryOwnerRef;
  updatedItems: Item[];
  createdItem?: Item;
  movedItemIds: string[];
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function nonNegativeNumber(value: unknown): number | undefined {
  const number = finiteNumber(value);
  return number !== undefined && number >= 0 ? number : undefined;
}

function positiveNumber(value: unknown): number | undefined {
  const number = finiteNumber(value);
  return number !== undefined && number > 0 ? number : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function sameOwner(left: Dnd5eInventoryOwnerRef | undefined, right: Dnd5eInventoryOwnerRef | undefined): boolean {
  if (!left || !right || left.kind !== right.kind) return false;
  return left.kind === "actor"
    ? left.actorId === (right as Extract<Dnd5eInventoryOwnerRef, { kind: "actor" }>).actorId
    : left.stashId === (right as Extract<Dnd5eInventoryOwnerRef, { kind: "party_stash" }>).stashId;
}

function inventoryRecord(item: Item): Record<string, unknown> {
  return recordValue(item.data[DND5E_INVENTORY_METADATA_KEY]);
}

export function dnd5eInventoryOwner(item: Item): Dnd5eInventoryOwnerRef | undefined {
  if (item.actorId) return { kind: "actor", actorId: item.actorId };
  const storage = recordValue(inventoryRecord(item).storage);
  const stashId = storage.kind === "party_stash" ? nonEmptyString(storage.stashId) : undefined;
  return stashId ? { kind: "party_stash", stashId } : undefined;
}

export function dnd5eInventoryMetadata(item: Item): Dnd5eInventoryMetadata {
  const source = inventoryRecord(item);
  const storage = recordValue(source.storage);
  const stashId = storage.kind === "party_stash" ? nonEmptyString(storage.stashId) : undefined;
  const parentItemId = nonEmptyString(source.parentItemId);
  const ammunitionSourceItemId = nonEmptyString(source.ammunitionSourceItemId);
  const sourceContainer = recordValue(source.container);
  const legacyCapacity = positiveNumber(item.data.capacityLb);
  const capacityLb = positiveNumber(sourceContainer.capacityLb) ?? legacyCapacity;
  const quantity = Math.max(0, Math.floor(nonNegativeNumber(source.quantity) ?? nonNegativeNumber(item.data.quantity) ?? 1));
  const weightLb = nonNegativeNumber(source.weightLb) ?? nonNegativeNumber(item.data.weightLb) ?? 0;
  return {
    version: 1,
    quantity,
    weightLb,
    ...(stashId ? { storage: { kind: "party_stash", stashId } as const } : {}),
    ...(parentItemId ? { parentItemId } : {}),
    ...(capacityLb !== undefined ? { container: { capacityLb, ...(sourceContainer.extradimensional === true || item.data.extradimensionalStorage === true ? { extradimensional: true } : {}) } } : {}),
    ...(ammunitionSourceItemId ? { ammunitionSourceItemId } : {})
  };
}

export function dnd5eInventoryItemData(item: Item, metadata: Dnd5eInventoryMetadata): Record<string, unknown> {
  return {
    ...item.data,
    quantity: metadata.quantity,
    weightLb: metadata.weightLb,
    [DND5E_INVENTORY_METADATA_KEY]: metadata
  };
}

export function dnd5eInventoryApplyPatch(item: Item, input: Dnd5eInventoryPatchInput): Item {
  const current = dnd5eInventoryMetadata(item);
  const quantity = input.quantity === undefined ? current.quantity : input.quantity;
  const weightLb = input.weightLb === undefined ? current.weightLb : input.weightLb;
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 999_999) throw new Error("quantity must be an integer from 0 to 999999");
  if (!Number.isFinite(weightLb) || weightLb < 0 || weightLb > 1_000_000) throw new Error("weightLb must be from 0 to 1000000");
  const parentItemId = input.parentItemId === undefined ? current.parentItemId : input.parentItemId || undefined;
  const ammunitionSourceItemId = input.ammunitionSourceItemId === undefined ? current.ammunitionSourceItemId : input.ammunitionSourceItemId || undefined;
  const capacityLb = input.containerCapacityLb === undefined ? current.container?.capacityLb : input.containerCapacityLb ?? undefined;
  if (capacityLb !== undefined && (!Number.isFinite(capacityLb) || capacityLb <= 0 || capacityLb > 1_000_000)) {
    throw new Error("containerCapacityLb must be greater than 0 and no more than 1000000");
  }
  if (input.extradimensional === true && capacityLb === undefined) throw new Error("An extradimensional item must define containerCapacityLb");
  const metadata: Dnd5eInventoryMetadata = {
    version: 1,
    quantity,
    weightLb,
    ...(current.storage ? { storage: current.storage } : {}),
    ...(parentItemId ? { parentItemId } : {}),
    ...(capacityLb !== undefined ? { container: { capacityLb, ...(input.extradimensional ?? current.container?.extradimensional ? { extradimensional: true } : {}) } } : {}),
    ...(ammunitionSourceItemId ? { ammunitionSourceItemId } : {})
  };
  return { ...item, data: dnd5eInventoryItemData(item, metadata) };
}

export function dnd5eInventoryWithOwner(item: Item, owner: Dnd5eInventoryOwnerRef, options: { clearParent?: boolean } = {}): Item {
  const current = dnd5eInventoryMetadata(item);
  const metadata: Dnd5eInventoryMetadata = {
    ...current,
    ...(owner.kind === "party_stash" ? { storage: { kind: "party_stash", stashId: owner.stashId } as const } : { storage: undefined }),
    ...(options.clearParent ? { parentItemId: undefined } : {})
  };
  return {
    ...item,
    actorId: owner.kind === "actor" ? owner.actorId : undefined,
    data: dnd5eInventoryItemData(item, metadata)
  };
}

export function dnd5eInventoryItemsForOwner(items: Item[], owner: Dnd5eInventoryOwnerRef): Item[] {
  const nonInventoryTypes = new Set(["spell", "feat", "feature", "class-feature", "condition", "talent", "ritual", "clue", DND5E_PARTY_STASH_ITEM_TYPE, DND5E_MERCHANT_ITEM_TYPE]);
  return items.filter((item) => item.systemId === DND5E_SYSTEM_ID && !nonInventoryTypes.has(item.type) && sameOwner(dnd5eInventoryOwner(item), owner));
}

function ammunitionKind(item: Item): string | undefined {
  return nonEmptyString(item.data.ammunition);
}

function parentDepth(item: Item, byId: Map<string, Item>): { depth: number; cycle: boolean } {
  let depth = 0;
  let current: Item | undefined = item;
  const seen = new Set<string>([item.id]);
  while (current) {
    const parentId = dnd5eInventoryMetadata(current).parentItemId;
    if (!parentId) break;
    if (seen.has(parentId)) return { depth, cycle: true };
    seen.add(parentId);
    current = byId.get(parentId);
    if (!current) break;
    depth += 1;
  }
  return { depth, cycle: false };
}

export function dnd5eInventoryGraphIssues(items: Item[]): Dnd5eInventoryGraphIssue[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const issues: Dnd5eInventoryGraphIssue[] = [];
  for (const item of items) {
    const metadata = dnd5eInventoryMetadata(item);
    const owner = dnd5eInventoryOwner(item);
    if (metadata.parentItemId) {
      const parent = byId.get(metadata.parentItemId);
      if (!parent) {
        issues.push({ code: "missing_parent", itemId: item.id, message: `${item.name} references a missing parent container` });
      } else if (!sameOwner(owner, dnd5eInventoryOwner(parent))) {
        issues.push({ code: "foreign_parent", itemId: item.id, message: `${item.name} and its parent container must share an inventory owner` });
      } else if (!dnd5eInventoryMetadata(parent).container) {
        issues.push({ code: "parent_not_container", itemId: item.id, message: `${parent.name} is not a container` });
      }
    }
    const depth = parentDepth(item, byId);
    if (depth.cycle) issues.push({ code: "container_cycle", itemId: item.id, message: `${item.name} would create a container cycle` });
    else if (depth.depth > DND5E_INVENTORY_MAX_CONTAINER_DEPTH) {
      issues.push({ code: "container_depth", itemId: item.id, message: `${item.name} exceeds the ${DND5E_INVENTORY_MAX_CONTAINER_DEPTH}-level container limit` });
    }
    if (metadata.ammunitionSourceItemId) {
      const ammunition = byId.get(metadata.ammunitionSourceItemId);
      if (!ammunition) {
        issues.push({ code: "missing_ammunition", itemId: item.id, message: `${item.name} references a missing ammunition stack` });
      } else if (!sameOwner(owner, dnd5eInventoryOwner(ammunition))) {
        issues.push({ code: "foreign_ammunition", itemId: item.id, message: `${item.name} and its ammunition must share an inventory owner` });
      } else {
        const requiredKind = ammunitionKind(item);
        const suppliedKind = ammunitionKind(ammunition);
        if (!requiredKind || suppliedKind !== requiredKind) {
          issues.push({ code: "ammunition_mismatch", itemId: item.id, message: `${ammunition.name} does not match ${item.name}'s ammunition type` });
        }
      }
    }
  }
  return issues.filter((issue, index) => issues.findIndex((candidate) => candidate.code === issue.code && candidate.itemId === issue.itemId) === index);
}

export function dnd5eInventoryAssertGraph(items: Item[]): void {
  const issues = dnd5eInventoryGraphIssues(items);
  if (issues.length > 0) throw new Error(issues[0]!.message);
}

function ancestorIds(item: Item, byId: Map<string, Item>): string[] {
  const ids: string[] = [];
  const seen = new Set<string>([item.id]);
  let current = item;
  while (true) {
    const parentId = dnd5eInventoryMetadata(current).parentItemId;
    if (!parentId || seen.has(parentId)) return ids;
    const parent = byId.get(parentId);
    if (!parent) return ids;
    ids.push(parentId);
    seen.add(parentId);
    current = parent;
  }
}

function actorCapacity(actor: Actor | undefined): { capacityLb?: number; warnings: string[] } {
  if (!actor) return { warnings: ["Carrying capacity needs an actor or a manual capacity"] };
  const override = positiveNumber(actor.data.carryingCapacityLb);
  if (override !== undefined) return { capacityLb: override, warnings: ["Carrying capacity uses the actor's manual override"] };
  const attributes = recordValue(actor.data.attributes);
  const strength = positiveNumber(attributes.strength);
  if (strength === undefined) return { warnings: ["Strength is missing, so carrying capacity requires manual review"] };
  const size = (nonEmptyString(actor.data.size) ?? nonEmptyString(recordValue(actor.data.species).size) ?? "medium").toLowerCase();
  const sizeMultiplier = size === "tiny" ? 0.5 : size === "large" ? 2 : size === "huge" ? 4 : size === "gargantuan" ? 8 : 1;
  const countsAsLarger = actor.data.countsAsOneSizeLargerForCarrying === true;
  return {
    capacityLb: strength * 15 * sizeMultiplier * (countsAsLarger ? 2 : 1),
    warnings: countsAsLarger ? ["Carrying capacity includes the actor's one-size-larger carrying trait"] : []
  };
}

export function dnd5eInventorySummary(
  owner: Dnd5eInventoryOwnerRef,
  items: Item[],
  options: { actor?: Actor; capacityLb?: number } = {}
): Dnd5eCarryingSummary {
  const owned = dnd5eInventoryItemsForOwner(items, owner);
  const byId = new Map(owned.map((item) => [item.id, item]));
  const graphIssues = dnd5eInventoryGraphIssues(owned);
  const itemWeight = (item: Item): number => dnd5eInventoryMetadata(item).quantity * dnd5eInventoryMetadata(item).weightLb;
  const carriedWeightLb = owned.reduce((total, item) => {
    const insideExtradimensional = ancestorIds(item, byId).some((id) => dnd5eInventoryMetadata(byId.get(id)!).container?.extradimensional === true);
    return total + (insideExtradimensional ? 0 : itemWeight(item));
  }, 0);
  const containers: Dnd5eContainerSummary[] = owned.flatMap((container) => {
    const metadata = dnd5eInventoryMetadata(container);
    if (!metadata.container) return [];
    const contentsWeightLb = owned.reduce((total, candidate) => ancestorIds(candidate, byId).includes(container.id) ? total + itemWeight(candidate) : total, 0);
    const remaining = metadata.container.capacityLb - contentsWeightLb;
    return [{
      itemId: container.id,
      name: container.name,
      capacityLb: metadata.container.capacityLb,
      contentsWeightLb,
      remainingCapacityLb: Math.max(0, remaining),
      overCapacityByLb: Math.max(0, -remaining),
      depth: parentDepth(container, byId).depth,
      extradimensional: metadata.container.extradimensional === true
    }];
  });
  const derivedCapacity = owner.kind === "actor" ? actorCapacity(options.actor) : { capacityLb: options.capacityLb, warnings: [] as string[] };
  const capacityLb = options.capacityLb ?? derivedCapacity.capacityLb;
  const remaining = capacityLb === undefined ? undefined : capacityLb - carriedWeightLb;
  const warnings = [
    ...graphIssues.map((issue) => issue.message),
    ...derivedCapacity.warnings,
    ...containers.filter((container) => container.overCapacityByLb > 0).map((container) => `${container.name} is ${container.overCapacityByLb} lb over capacity`),
    ...containers.filter((container) => container.extradimensional).map((container) => `${container.name} uses extradimensional storage; nesting and rupture hazards require GM adjudication`)
  ];
  return {
    owner,
    itemCount: owned.length,
    totalQuantity: owned.reduce((total, item) => total + dnd5eInventoryMetadata(item).quantity, 0),
    carriedWeightLb,
    ...(capacityLb !== undefined ? { capacityLb, remainingCapacityLb: Math.max(0, remaining ?? 0) } : {}),
    overCapacityByLb: Math.max(0, -(remaining ?? 0)),
    status: capacityLb === undefined || graphIssues.length > 0 ? "manual_review" : (remaining ?? 0) < 0 ? "over_capacity" : "within_capacity",
    containers,
    warnings: [...new Set(warnings)]
  };
}

export function dnd5eInventoryTransferPlan(
  items: Item[],
  itemId: string,
  quantity: number,
  destinationOwner: Dnd5eInventoryOwnerRef,
  create: { id: string; createdAt: string; updatedAt: string }
): Dnd5eInventoryTransferPlan {
  const item = items.find((candidate) => candidate.id === itemId);
  if (!item) throw new Error("Inventory item not found");
  const sourceOwner = dnd5eInventoryOwner(item);
  if (!sourceOwner) throw new Error("Item is not in an actor inventory or party stash");
  if (sameOwner(sourceOwner, destinationOwner)) throw new Error("Source and destination inventories must differ");
  const metadata = dnd5eInventoryMetadata(item);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > metadata.quantity) throw new Error(`quantity must be from 1 to ${metadata.quantity}`);
  const sourceItems = dnd5eInventoryItemsForOwner(items, sourceOwner);
  dnd5eInventoryAssertGraph(sourceItems);
  const childItems = sourceItems.filter((candidate) => ancestorIds(candidate, new Map(sourceItems.map((owned) => [owned.id, owned]))).includes(item.id));
  if (quantity < metadata.quantity && (metadata.container || childItems.length > 0)) throw new Error("Containers can only be transferred with their full quantity and contents");
  if (quantity === metadata.quantity) {
    const moved = [item, ...childItems].map((candidate) => dnd5eInventoryWithOwner(candidate, destinationOwner, { clearParent: candidate.id === item.id }));
    const candidateItems = items.map((candidate) => moved.find((replacement) => replacement.id === candidate.id) ?? candidate);
    dnd5eInventoryAssertGraph(dnd5eInventoryItemsForOwner(candidateItems, sourceOwner));
    dnd5eInventoryAssertGraph(dnd5eInventoryItemsForOwner(candidateItems, destinationOwner));
    return { sourceOwner, destinationOwner, updatedItems: moved, movedItemIds: moved.map((candidate) => candidate.id) };
  }
  const updatedSource = dnd5eInventoryApplyPatch(item, { quantity: metadata.quantity - quantity });
  const splitMetadata: Dnd5eInventoryMetadata = { ...metadata, quantity, parentItemId: undefined, ammunitionSourceItemId: undefined };
  const createdItem = dnd5eInventoryWithOwner({ ...item, id: create.id, createdAt: create.createdAt, updatedAt: create.updatedAt, data: dnd5eInventoryItemData(item, splitMetadata) }, destinationOwner, { clearParent: true });
  return { sourceOwner, destinationOwner, updatedItems: [updatedSource], createdItem, movedItemIds: [createdItem.id] };
}

export function dnd5eCurrencyToCopper(value: unknown): number {
  const currency = recordValue(value);
  const amount = (key: string): number => Math.max(0, Math.floor(nonNegativeNumber(currency[key]) ?? 0));
  return amount("cp") + amount("sp") * 10 + amount("ep") * 50 + amount("gp") * 100 + amount("pp") * 1000;
}

export function dnd5eCurrencyFromCopper(value: number): Record<string, number> {
  const copper = Math.max(0, Math.floor(value));
  const gp = Math.floor(copper / 100);
  const sp = Math.floor((copper % 100) / 10);
  const cp = copper % 10;
  return { gp, sp, cp };
}

export function dnd5eCurrencyAdd(value: unknown, copper: number): Record<string, number> {
  if (!Number.isInteger(copper)) throw new Error("Currency changes must use whole copper pieces");
  const next = dnd5eCurrencyToCopper(value) + copper;
  if (next < 0) throw new Error("Insufficient currency");
  return dnd5eCurrencyFromCopper(next);
}

export function dnd5ePartyStashData(item: Item): Dnd5ePartyStashData | undefined {
  if (item.type !== DND5E_PARTY_STASH_ITEM_TYPE || item.systemId !== DND5E_SYSTEM_ID || item.actorId) return undefined;
  const source = recordValue(item.data[DND5E_PARTY_STASH_DATA_KEY]);
  const name = nonEmptyString(source.name);
  if (!name) return undefined;
  const capacityLb = positiveNumber(source.capacityLb);
  return { version: 1, name, ...(capacityLb !== undefined ? { capacityLb } : {}), currency: dnd5eCurrencyFromCopper(dnd5eCurrencyToCopper(source.currency)) };
}

export function dnd5eMerchantData(item: Item): Dnd5eMerchantData | undefined {
  if (item.type !== DND5E_MERCHANT_ITEM_TYPE || item.systemId !== DND5E_SYSTEM_ID || item.actorId) return undefined;
  const source = recordValue(item.data[DND5E_MERCHANT_DATA_KEY]);
  const name = nonEmptyString(source.name);
  const description = typeof source.description === "string" ? source.description.trim() : "";
  const buybackRate = finiteNumber(source.buybackRate);
  if (!name || buybackRate === undefined || buybackRate < 0 || buybackRate > 1 || !Array.isArray(source.catalog)) return undefined;
  const catalog: Dnd5eMerchantCatalogEntry[] = [];
  const ids = new Set<string>();
  for (const raw of source.catalog) {
    const entry = recordValue(raw);
    const id = nonEmptyString(entry.id);
    const entryName = nonEmptyString(entry.name);
    const type = nonEmptyString(entry.type);
    const unitPriceGp = nonNegativeNumber(entry.unitPriceGp);
    const sellPriceGp = nonNegativeNumber(entry.sellPriceGp);
    const availableQuantity = entry.availableQuantity === undefined ? undefined : nonNegativeNumber(entry.availableQuantity);
    if (!id || ids.has(id) || !entryName || !type || unitPriceGp === undefined || (availableQuantity !== undefined && !Number.isInteger(availableQuantity))) return undefined;
    ids.add(id);
    catalog.push({
      id,
      name: entryName,
      type,
      unitPriceGp,
      ...(sellPriceGp !== undefined ? { sellPriceGp } : {}),
      ...(availableQuantity !== undefined ? { availableQuantity } : {}),
      ...(nonEmptyString(entry.compendiumEntryId) ? { compendiumEntryId: nonEmptyString(entry.compendiumEntryId)! } : {}),
      data: recordValue(entry.data)
    });
  }
  return {
    version: 1,
    name,
    description,
    buybackRate,
    ...(source.currency === undefined ? {} : { currency: dnd5eCurrencyFromCopper(dnd5eCurrencyToCopper(source.currency)) }),
    catalog
  };
}

export function dnd5eAssertMerchantData(data: Dnd5eMerchantData): void {
  if (!data.name.trim() || data.name.length > 120) throw new Error("Merchant name must be 1 to 120 characters");
  if (data.description.length > 1_000) throw new Error("Merchant description must be 1000 characters or fewer");
  if (!Number.isFinite(data.buybackRate) || data.buybackRate < 0 || data.buybackRate > 1) throw new Error("buybackRate must be from 0 to 1");
  if (data.catalog.length > 200) throw new Error("Merchant catalogs support at most 200 entries");
  const ids = new Set<string>();
  for (const entry of data.catalog) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/.test(entry.id) || ids.has(entry.id)) throw new Error("Merchant catalog entry ids must be unique URL-safe identifiers");
    ids.add(entry.id);
    if (!entry.name.trim() || entry.name.length > 160) throw new Error("Merchant catalog names must be 1 to 160 characters");
    if (!entry.type.trim() || entry.type.length > 80) throw new Error("Merchant catalog types must be 1 to 80 characters");
    if (!Number.isFinite(entry.unitPriceGp) || entry.unitPriceGp < 0 || entry.unitPriceGp > 10_000_000) throw new Error("Merchant unit prices must be from 0 to 10000000 GP");
    if (entry.sellPriceGp !== undefined && (!Number.isFinite(entry.sellPriceGp) || entry.sellPriceGp < 0 || entry.sellPriceGp > 10_000_000)) throw new Error("Merchant sell prices must be from 0 to 10000000 GP");
    if (entry.availableQuantity !== undefined && (!Number.isInteger(entry.availableQuantity) || entry.availableQuantity < 0 || entry.availableQuantity > 999_999)) throw new Error("Merchant stock must be an integer from 0 to 999999");
  }
}

export function dnd5eLootData(item: Item): Dnd5eLootData | undefined {
  const source = recordValue(item.data[DND5E_LOOT_DATA_KEY]);
  const combatId = nonEmptyString(source.combatId);
  const rewardId = nonEmptyString(source.rewardId);
  const status = source.status;
  if (!combatId || !rewardId || (status !== "available" && status !== "claimed" && status !== "assigned")) return undefined;
  return {
    version: 1,
    combatId,
    rewardId,
    status,
    ...(nonEmptyString(source.claimedByUserId) ? { claimedByUserId: nonEmptyString(source.claimedByUserId)! } : {}),
    ...(nonEmptyString(source.claimedForActorId) ? { claimedForActorId: nonEmptyString(source.claimedForActorId)! } : {}),
    ...(nonEmptyString(source.assignedByUserId) ? { assignedByUserId: nonEmptyString(source.assignedByUserId)! } : {}),
    ...(nonEmptyString(source.assignedToActorId) ? { assignedToActorId: nonEmptyString(source.assignedToActorId)! } : {}),
    ...(nonEmptyString(source.assignedAt) ? { assignedAt: nonEmptyString(source.assignedAt)! } : {})
  };
}
