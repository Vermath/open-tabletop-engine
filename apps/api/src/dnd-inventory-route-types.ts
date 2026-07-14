import type { Dnd5eInventoryPatchInput } from "@open-tabletop/system-sdk";

export interface DndInventoryItemPatchBody extends Dnd5eInventoryPatchInput {
  expectedUpdatedAt?: unknown;
  expectedOwnerUpdatedAt?: unknown;
}

export interface DndInventoryTransferBody {
  quantity?: unknown;
  destination?: unknown;
  expectedUpdatedAt?: unknown;
  expectedSourceUpdatedAt?: unknown;
  expectedDestinationUpdatedAt?: unknown;
}

export interface DndInventoryAmmunitionBody {
  ammunitionItemId?: unknown;
  amount?: unknown;
  expectedUpdatedAt?: unknown;
  expectedAmmunitionUpdatedAt?: unknown;
  expectedActorUpdatedAt?: unknown;
}

export interface DndPartyStashCreateBody {
  name?: unknown;
  capacityLb?: unknown;
  currency?: unknown;
  expectedCampaignUpdatedAt?: unknown;
}

export interface DndMerchantMutationBody {
  name?: unknown;
  description?: unknown;
  buybackRate?: unknown;
  currency?: unknown;
  catalog?: unknown;
  expectedUpdatedAt?: unknown;
  expectedCampaignUpdatedAt?: unknown;
}

export interface DndMerchantCommerceBody {
  actorId?: unknown;
  catalogEntryId?: unknown;
  itemId?: unknown;
  quantity?: unknown;
  expectedActorUpdatedAt?: unknown;
  expectedMerchantUpdatedAt?: unknown;
  expectedItemUpdatedAt?: unknown;
}

export interface DndCombatLootCreateBody {
  stashId?: unknown;
  items?: unknown;
  note?: unknown;
  expectedUpdatedAt?: unknown;
  expectedStashUpdatedAt?: unknown;
}

export interface DndLootClaimBody {
  actorId?: unknown;
  expectedUpdatedAt?: unknown;
  expectedStashUpdatedAt?: unknown;
  expectedActorUpdatedAt?: unknown;
}

export interface DndLootAssignmentBody extends DndLootClaimBody {
  action?: unknown;
}
