import type { Actor, Dnd5eSrdSpellPreparationMutationResult, Item } from "@open-tabletop/core";
import { Boxes, Check, Eraser, KeyRound, Plus, WandSparkles } from "lucide-react";
import type { DragEvent as ReactDragEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { itemDisplayLabel, itemEquippedLabel, itemPreparedLabel } from "./actor-sheet-data.js";
import { errorMessage, formatNumber, numericValue, recordValue, stringArrayValue, titleCaseLabel } from "./sheet-format.js";
import { hasItemDropData, readItemDropData, writeItemDropData } from "./token-drag.js";
import { DndSpellPreparationPanel } from "./dnd-spell-preparation-panel.js";

export type ActorLoadoutFilter = "all" | "equipped" | "consumable" | "magic";
export interface ActorAttunementChangeOptions { breakCurse?: boolean; overrideReason?: string }

interface LoadoutOperation {
  kind: "pending" | "success" | "error";
  message: string;
  retry?: {
    label: string;
    action: () => Promise<void>;
  };
}

export interface ActorLoadoutPanelProps {
  actor: Actor;
  actors: Actor[];
  items: Item[];
  search: string;
  filter: ActorLoadoutFilter;
  canUpdateActor: boolean;
  canManageActorRules?: boolean;
  onSearchChange(value: string): void;
  onFilterChange(value: ActorLoadoutFilter): void;
  updateItemData(item: Item, patch: Record<string, unknown>): Promise<void>;
  changeActorAttunement(actor: Actor, item: Item, attuned: boolean, options?: ActorAttunementChangeOptions): Promise<void>;
  assignItemToActor(item: Item, actor: Actor): Promise<void>;
  onSpellPreparationApplied(result: Dnd5eSrdSpellPreparationMutationResult): void;
}

export function filterActorLoadoutItems(items: Item[], search: string, filter: ActorLoadoutFilter): Item[] {
  const normalizedSearch = search.trim().toLocaleLowerCase();
  return items.filter((item) => {
    const data = recordValue(item.data);
    const isMagic = item.type === "spell" || item.type === "talent" || item.type === "ritual";
    const matchesFilter =
      filter === "all" ||
      (filter === "equipped" && data.equipped !== false && !isMagic && item.type !== "clue") ||
      (filter === "consumable" && data.quantity !== undefined) ||
      (filter === "magic" && isMagic);
    if (!matchesFilter) return false;
    if (!normalizedSearch) return true;
    return [item.name, item.type, String(data.category ?? ""), String(data.equipmentCategory ?? "")]
      .some((value) => value.toLocaleLowerCase().includes(normalizedSearch));
  });
}

export function actorLoadoutOperationError(label: string, error: unknown): string {
  return `${label} failed: ${errorMessage(error)}`;
}

export function ActorLoadoutPanel({
  actor,
  actors,
  items,
  search,
  filter,
  canUpdateActor,
  canManageActorRules = false,
  onSearchChange,
  onFilterChange,
  updateItemData,
  changeActorAttunement,
  assignItemToActor,
  onSpellPreparationApplied,
}: ActorLoadoutPanelProps) {
  const [assignItemId, setAssignItemId] = useState("");
  const [itemDropActive, setItemDropActive] = useState(false);
  const [operation, setOperation] = useState<LoadoutOperation>();
  const [curseBreakReasons, setCurseBreakReasons] = useState<Record<string, string>>({});
  const activeActorIdRef = useRef(actor.id);
  const mutationPending = operation?.kind === "pending";

  useEffect(() => {
    activeActorIdRef.current = actor.id;
    setAssignItemId("");
    setItemDropActive(false);
    setOperation(undefined);
    setCurseBreakReasons({});
  }, [actor.id]);

  const actorItems = items.filter((item) => item.actorId === actor.id);
  const unassignedItems = items.filter((item) => !item.actorId && item.campaignId === actor.campaignId);
  const selectedAssignableItem = unassignedItems.find((item) => item.id === assignItemId);
  const inventory = actorItems.filter((item) => item.type !== "spell" && item.type !== "talent" && item.type !== "clue" && item.type !== "ritual");
  const magic = actorItems.filter((item) => item.type === "spell" || item.type === "talent" || item.type === "ritual");
  const filteredActorItems = filterActorLoadoutItems(actorItems, search, filter);
  const readyableGear = inventory.filter((item) => recordValue(item.data).equipped === false);
  const preparableMagic = magic.filter((item) => {
    const data = recordValue(item.data);
    return data.prepared === false && data.alwaysPrepared !== true;
  });
  const legacyAttunedItemIds = stringArrayValue(actor.data.attunedItemIds) ?? [];
  const attunedItemIds = new Set(
    legacyAttunedItemIds.length > 0
      ? legacyAttunedItemIds
      : (stringArrayValue(recordValue(actor.data.rulesEngine).attunedItemIds) ?? [])
  );

  async function runOperation(label: string, action: () => Promise<void>): Promise<void> {
    const operationActorId = actor.id;
    setOperation({ kind: "pending", message: `${label}...` });
    try {
      await action();
      if (activeActorIdRef.current !== operationActorId) return;
      setOperation({ kind: "success", message: `${label} complete.` });
    } catch (error) {
      if (activeActorIdRef.current !== operationActorId) return;
      setOperation({
        kind: "error",
        message: actorLoadoutOperationError(label, error),
        retry: { label, action }
      });
    }
  }

  function retryOperation(): void {
    if (!operation?.retry) return;
    void runOperation(operation.retry.label, operation.retry.action);
  }

  function handleDrop(event: ReactDragEvent<HTMLElement>): void {
    setItemDropActive(false);
    if (!canUpdateActor || mutationPending) return;
    const itemId = readItemDropData(event.dataTransfer);
    const item = items.find((candidate) => candidate.id === itemId);
    if (!item) return;
    event.preventDefault();
    void runOperation(`Assign ${item.name}`, () => assignItemToActor(item, actor));
  }

  return (
    <section
      className={`operator-section ${itemDropActive ? "drop-active" : ""}`}
      aria-label="Actor loadout sheet"
      aria-busy={operation?.kind === "pending"}
      onDragEnter={(event) => {
        if (!canUpdateActor || mutationPending || !hasItemDropData(event.dataTransfer)) return;
        event.preventDefault();
        setItemDropActive(true);
      }}
      onDragOver={(event) => {
        if (!canUpdateActor || mutationPending || !hasItemDropData(event.dataTransfer)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setItemDropActive(false);
      }}
      onDrop={handleDrop}
    >
      <div className="operator-heading">
        <div className="section-title">Loadout</div>
        <strong>{formatNumber(actorItems.length)} items</strong>
      </div>
      {operation && (
        <div className="import-status" role={operation.kind === "error" ? "alert" : "status"} aria-live={operation.kind === "error" ? "assertive" : "polite"}>
          <strong>{operation.kind === "error" ? "Loadout update failed" : "Loadout update"}</strong>
          <span>{operation.message}</span>
          {operation.retry && (
            <button className="ghost-button small" type="button" onClick={retryOperation}>
              Retry
            </button>
          )}
        </div>
      )}
      {unassignedItems.length > 0 && (
        <div className="operator-row tool-call-row" aria-label="Assign item to actor">
          <select aria-label="Unassigned item" value={selectedAssignableItem?.id ?? ""} onChange={(event) => setAssignItemId(event.target.value)}>
            <option value="">Select loose item</option>
            {unassignedItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <button
            className="ghost-button"
            type="button"
            disabled={!selectedAssignableItem || !canUpdateActor || mutationPending}
            onClick={() => {
              if (!selectedAssignableItem) return;
              void runOperation(`Assign ${selectedAssignableItem.name}`, async () => {
                await assignItemToActor(selectedAssignableItem, actor);
                setAssignItemId("");
              });
            }}
          >
            <Plus size={14} /> Assign selected item
          </button>
        </div>
      )}
      {unassignedItems.length > 0 && (
        <div className="loose-item-tray" aria-label="Loose item drag tray">
          {unassignedItems.slice(0, 8).map((item) => (
            <button
              className="loose-item-chip"
              key={item.id}
              type="button"
              draggable={canUpdateActor && !mutationPending}
              aria-label={`Drag ${item.name} to actor loadout`}
              title={canUpdateActor ? "Drag item onto the loadout sheet" : "Requires actor.update"}
              disabled={!canUpdateActor || mutationPending}
              onDragStart={(event) => writeItemDropData(event.dataTransfer, item)}
            >
              <Boxes size={14} />
              <span>{item.name}</span>
            </button>
          ))}
        </div>
      )}
      <div className="asset-pressure-list" role="region" aria-label="Inventory management">
        <div className="admin-form-grid">
          <label>
            <span>Search</span>
            <input aria-label="Inventory search" value={search} placeholder="Item, type, category" onChange={(event) => onSearchChange(event.target.value)} />
          </label>
          <label>
            <span>Filter</span>
            <select aria-label="Inventory filter" value={filter} onChange={(event) => onFilterChange(event.target.value as ActorLoadoutFilter)}>
              <option value="all">All loadout</option>
              <option value="equipped">Equipped gear</option>
              <option value="consumable">Consumables</option>
              <option value="magic">Spells and talents</option>
            </select>
          </label>
        </div>
        <div className="admin-meta">
          <span>{formatNumber(filteredActorItems.length)} shown</span>
          <span>{formatNumber(inventory.length)} gear</span>
          <span>{formatNumber(actorItems.filter((item) => recordValue(item.data).quantity !== undefined).length)} consumables</span>
          <span>{formatNumber(magic.length)} magic</span>
        </div>
        {actorItems.length > 0 && filteredActorItems.length === 0 && <div className="empty-state compact">No loadout items match the current search and filter.</div>}
        <div className="button-row">
          <button
            className="ghost-button"
            type="button"
            disabled={!canUpdateActor || mutationPending || readyableGear.length === 0}
            onClick={() => void runOperation("Ready carried gear", () => Promise.all(readyableGear.map((item) => updateItemData(item, { equipped: true }))).then(() => undefined))}
          >
            <Check size={14} /> Ready carried gear
          </button>
          {actor.systemId !== "dnd-5e-srd" && (
            <button
              className="ghost-button"
              type="button"
              disabled={!canUpdateActor || mutationPending || preparableMagic.length === 0}
              onClick={() => void runOperation("Prepare magic", () => Promise.all(preparableMagic.map((item) => updateItemData(item, { prepared: true }))).then(() => undefined))}
            >
              <WandSparkles size={14} /> Prepare magic
            </button>
          )}
        </div>
      </div>
      {actor.systemId === "dnd-5e-srd" && actorSpellsExist(magic) && (
        <DndSpellPreparationPanel
          campaignId={actor.campaignId}
          actor={actor}
          items={items}
          canUpdateActor={canUpdateActor}
          onApplied={onSpellPreparationApplied}
        />
      )}
      {actorItems.length === 0 ? (
        <div className="empty-state compact">No inventory, spells, talents, clues, or rituals on this actor.</div>
      ) : filteredActorItems.length === 0 ? null : (
        filteredActorItems.map((item) => {
          const data = recordValue(item.data);
          const isSpellLike = item.type === "spell" || item.type === "ritual" || item.type === "talent";
          const isGearLike = !isSpellLike && item.type !== "clue";
          const requiresAttunement = actor.systemId === "dnd-5e-srd" && (data.requiresAttunement === true || (typeof data.attunementRequirement === "string" && data.attunementRequirement.trim().length > 0));
          const isAttuned = attunedItemIds.has(item.id);
          const isCursedAttunement = data.cursed === true || data.cursePersistsAfterRemovingShield === true || data.cannotUnattune === true;
          const curseBreakReason = curseBreakReasons[item.id] ?? "";
          return (
            <article className="operator-item admin-item" key={item.id} draggable={canUpdateActor && !mutationPending} onDragStart={(event) => writeItemDropData(event.dataTransfer, item)}>
              <div className="operator-row">
                <span>{titleCaseLabel(item.type)}</span>
                <strong>{itemDisplayLabel(item)}</strong>
              </div>
              <div className="admin-meta">
                {data.level !== undefined && <span>level {String(data.level)}</span>}
                {data.category !== undefined && <span>{String(data.category)}</span>}
                {data.quantity !== undefined && <span>quantity {String(data.quantity)}</span>}
                <span>{itemPreparedLabel(item)}</span>
                <span>{itemEquippedLabel(item)}</span>
                {requiresAttunement && <span>{isAttuned ? "Attuned" : "Attunement required"}</span>}
                {requiresAttunement && typeof data.attunementRequirement === "string" && <span>{data.attunementRequirement}</span>}
              </div>
              <div className="button-row">
                {isSpellLike && (actor.systemId !== "dnd-5e-srd" || item.type !== "spell") && (
                  <label className="inline-check">
                    <input
                      aria-label={`${item.name} prepared`}
                      type="checkbox"
                      checked={data.prepared !== false}
                      disabled={!canUpdateActor || mutationPending || data.alwaysPrepared === true}
                      onChange={(event) => {
                        const checked = event.currentTarget.checked;
                        void runOperation(`${checked ? "Prepare" : "Unprepare"} ${item.name}`, () => updateItemData(item, { prepared: checked }));
                      }}
                    />
                    <span>{data.alwaysPrepared === true ? "Always prepared" : "Prepared"}</span>
                  </label>
                )}
                {isGearLike && (
                  <label className="inline-check">
                    <input
                      aria-label={`${item.name} equipped`}
                      type="checkbox"
                      checked={data.equipped !== false}
                      disabled={!canUpdateActor || mutationPending}
                      onChange={(event) => {
                        const checked = event.currentTarget.checked;
                        void runOperation(`${checked ? "Equip" : "Stow"} ${item.name}`, () => updateItemData(item, { equipped: checked }));
                      }}
                    />
                    <span>Equipped</span>
                  </label>
                )}
                {data.quantity !== undefined && (
                  <label>
                    <span>Qty</span>
                    <input
                      key={`${item.id}:${item.updatedAt}:${String(data.quantity)}`}
                      aria-label={`${item.name} quantity`}
                      type="number"
                      min={0}
                      defaultValue={numericValue(data.quantity, 1)}
                      disabled={!canUpdateActor || mutationPending}
                      onBlur={(event) => {
                        const requestedQuantity = Number(event.currentTarget.value);
                        const quantity = Number.isFinite(requestedQuantity)
                          ? Math.max(0, Math.floor(requestedQuantity))
                          : numericValue(data.quantity, 1);
                        void runOperation(`Update ${item.name} quantity`, () => updateItemData(item, { quantity }));
                      }}
                    />
                  </label>
                )}
                {data.quantity !== undefined && (
                  <>
                    <button
                      className="ghost-button"
                      type="button"
                      disabled={!canUpdateActor || mutationPending || numericValue(data.quantity, 1) <= 0}
                      onClick={() => void runOperation(`Spend one ${item.name}`, () => updateItemData(item, { quantity: Math.max(0, Math.floor(numericValue(data.quantity, 1) - 1)) }))}
                    >
                      <Eraser size={14} /> Spend one
                    </button>
                    <button
                      className="ghost-button"
                      type="button"
                      disabled={!canUpdateActor || mutationPending}
                      onClick={() => void runOperation(`Add one ${item.name}`, () => updateItemData(item, { quantity: Math.max(0, Math.floor(numericValue(data.quantity, 1) + 1)) }))}
                    >
                      <Plus size={14} /> Add one
                    </button>
                  </>
                )}
                {requiresAttunement && (
                  <>
                    {isAttuned && isCursedAttunement && (
                      <label>
                        <span>Curse-break ruling</span>
                        <input
                          aria-label={`${item.name} curse-break reason`}
                          type="text"
                          maxLength={500}
                          value={curseBreakReason}
                          disabled={!canManageActorRules || mutationPending}
                          placeholder="Remove Curse, equivalent effect, or documented table ruling"
                          onChange={(event) => setCurseBreakReasons((current) => ({ ...current, [item.id]: event.currentTarget.value }))}
                        />
                      </label>
                    )}
                    <button
                      className="ghost-button"
                      type="button"
                      disabled={!canUpdateActor || mutationPending || (isAttuned && isCursedAttunement && (!canManageActorRules || !curseBreakReason.trim()))}
                      onClick={() => void runOperation(
                        `${isAttuned ? isCursedAttunement ? "Break curse and unattune" : "Unattune" : "Attune"} ${item.name}`,
                        () => changeActorAttunement(actor, item, !isAttuned, isAttuned && isCursedAttunement
                          ? { breakCurse: true, overrideReason: curseBreakReason.trim() }
                          : undefined)
                      )}
                    >
                      <KeyRound size={14} /> {isAttuned ? isCursedAttunement ? "Break curse & unattune" : "Unattune" : "Attune"}
                    </button>
                  </>
                )}
                {canUpdateActor && actors.some((candidate) => candidate.id !== actor.id) && (
                  <label>
                    <span>Give to</span>
                    <select
                      aria-label={`Give ${item.name} to actor`}
                      defaultValue=""
                      disabled={mutationPending}
                      onChange={(event) => {
                        const nextActor = actors.find((candidate) => candidate.id === event.currentTarget.value);
                        event.currentTarget.value = "";
                        if (nextActor) void runOperation(`Give ${item.name} to ${nextActor.name}`, () => assignItemToActor(item, nextActor));
                      }}
                    >
                      <option value="">Actor</option>
                      {actors.filter((candidate) => candidate.id !== actor.id).map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </article>
          );
        })
      )}
    </section>
  );
}

function actorSpellsExist(items: Item[]): boolean {
  return items.some((item) => item.type === "spell");
}
