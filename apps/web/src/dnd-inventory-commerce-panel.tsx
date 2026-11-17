import type {
  Actor,
  Combat,
  Dnd5eInventoryMetadata,
  Dnd5eInventoryOverview,
  Dnd5eLootData,
  Dnd5eMerchantData,
  Item,
} from "@open-tabletop/core";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiGet, apiPatch, apiPost } from "./api.js";

export interface DndInventoryCommercePanelProps {
  campaignId: string;
  actor: Actor;
  combat?: Combat;
  canUpdateActor: boolean;
  canManageCampaign: boolean;
  canManageCombat: boolean;
  onChanged?(): void | Promise<void>;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function finite(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function dndInventoryMetadata(item: Item): Dnd5eInventoryMetadata {
  const raw = record(item.data.dnd5eInventory);
  const container = record(raw.container);
  const storage = record(raw.storage);
  return {
    version: 1,
    quantity: Math.max(0, Math.floor(finite(raw.quantity, finite(item.data.quantity, 1)))),
    weightLb: Math.max(0, finite(raw.weightLb, finite(item.data.weightLb))),
    ...(storage.kind === "party_stash" && typeof storage.stashId === "string" ? { storage: { kind: "party_stash" as const, stashId: storage.stashId } } : {}),
    ...(typeof raw.parentItemId === "string" ? { parentItemId: raw.parentItemId } : {}),
    ...(finite(container.capacityLb) > 0 ? { container: { capacityLb: finite(container.capacityLb), ...(container.extradimensional === true ? { extradimensional: true } : {}) } } : {}),
    ...(typeof raw.ammunitionSourceItemId === "string" ? { ammunitionSourceItemId: raw.ammunitionSourceItemId } : {}),
  };
}

export function dndMerchantData(item: Item): Dnd5eMerchantData | undefined {
  const raw = record(item.data.dnd5eMerchant);
  if (raw.version !== 1 || typeof raw.name !== "string" || !Array.isArray(raw.catalog)) return undefined;
  return raw as unknown as Dnd5eMerchantData;
}

export function dndLootData(item: Item): Dnd5eLootData | undefined {
  const raw = record(item.data.dnd5eLoot);
  if (raw.version !== 1 || typeof raw.combatId !== "string" || typeof raw.rewardId !== "string" || !["available", "claimed", "assigned"].includes(String(raw.status))) return undefined;
  return raw as unknown as Dnd5eLootData;
}

export function dndCurrencyLabel(value: unknown): string {
  const currency = record(value);
  const labels = ["pp", "gp", "ep", "sp", "cp"]
    .map((denomination) => [denomination, finite(currency[denomination])] as const)
    .filter(([, amount]) => amount !== 0)
    .map(([denomination, amount]) => `${amount} ${denomination}`);
  return labels.length ? labels.join(", ") : "0 gp";
}

function mutationKey(label: string): string {
  const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `web-dnd-${label}-${suffix}`;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "The request failed";
}

function formNumber(form: FormData, name: string, fallback: number): number {
  const value = Number(form.get(name));
  return Number.isFinite(value) ? value : fallback;
}

export function DndInventoryCommercePanel(props: DndInventoryCommercePanelProps) {
  const [overview, setOverview] = useState<Dnd5eInventoryOverview>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError("");
    try {
      const result = await apiGet<Dnd5eInventoryOverview>(
        `/api/v1/campaigns/${encodeURIComponent(props.campaignId)}/dnd/inventory?actorId=${encodeURIComponent(props.actor.id)}`,
        { signal },
      );
      setOverview(result);
    } catch (error) {
      if (signal?.aborted) return;
      setLoadError(errorText(error));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [props.actor.id, props.campaignId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const mutate = useCallback(async (key: string, success: string, request: () => Promise<unknown>) => {
    setBusy(key);
    setStatus("");
    try {
      await request();
      await load();
      await props.onChanged?.();
      setStatus(success);
    } catch (error) {
      setStatus(errorText(error));
    } finally {
      setBusy("");
    }
  }, [load, props.onChanged]);

  if (loading && !overview) return <section className="operator-section" aria-label="D&D inventory and commerce"><p role="status">Loading inventory and commerce…</p></section>;
  if (loadError && !overview) {
    return (
      <section className="operator-section" aria-label="D&D inventory and commerce">
        <p className="status-bad" role="alert">Could not load inventory: {loadError}</p>
        <button className="ghost-button" type="button" onClick={() => void load()}>Retry</button>
      </section>
    );
  }
  if (!overview) return null;

  const actor = overview.actor ?? props.actor;
  const stash = overview.partyStash;
  const summary = overview.actorSummary;
  const campaignRevision = overview.campaignUpdatedAt;
  const actorItems = overview.actorItems;
  const merchants = overview.merchants;
  const containers = actorItems.filter((item) => Boolean(dndInventoryMetadata(item).container));

  function editItem(item: Item, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const metadata = dndInventoryMetadata(item);
    const parentItemId = String(form.get("parentItemId") ?? "");
    const ammunitionSourceItemId = String(form.get("ammunitionSourceItemId") ?? "");
    const capacity = String(form.get("containerCapacityLb") ?? "").trim();
    void mutate(`edit-${item.id}`, `${item.name} updated`, () => apiPatch(
      `/api/v1/campaigns/${encodeURIComponent(props.campaignId)}/dnd/inventory/items/${encodeURIComponent(item.id)}`,
      {
        quantity: Math.max(0, Math.floor(formNumber(form, "quantity", metadata.quantity))),
        weightLb: Math.max(0, formNumber(form, "weightLb", metadata.weightLb)),
        parentItemId: parentItemId || null,
        containerCapacityLb: capacity ? Math.max(0.01, Number(capacity)) : null,
        extradimensional: form.get("extradimensional") === "on",
        ammunitionSourceItemId: ammunitionSourceItemId || null,
        expectedUpdatedAt: item.updatedAt,
        expectedOwnerUpdatedAt: actor.updatedAt,
      },
      { idempotencyKey: mutationKey(`edit-${item.id}`) },
    ));
  }

  function transferToStash(item: Item) {
    if (!stash) return;
    void mutate(`stash-${item.id}`, `Moved one ${item.name} to the party stash`, () => apiPost(
      `/api/v1/campaigns/${encodeURIComponent(props.campaignId)}/dnd/inventory/items/${encodeURIComponent(item.id)}/transfer`,
      { quantity: 1, destination: { kind: "party_stash", stashId: stash.id }, expectedUpdatedAt: item.updatedAt, expectedSourceUpdatedAt: actor.updatedAt, expectedDestinationUpdatedAt: stash.updatedAt },
      { idempotencyKey: mutationKey(`stash-${item.id}`) },
    ));
  }

  function transferFromStash(item: Item) {
    if (!stash) return;
    void mutate(`take-${item.id}`, `Moved one ${item.name} to ${actor.name}`, () => apiPost(
      `/api/v1/campaigns/${encodeURIComponent(props.campaignId)}/dnd/inventory/items/${encodeURIComponent(item.id)}/transfer`,
      { quantity: 1, destination: { kind: "actor", actorId: actor.id }, expectedUpdatedAt: item.updatedAt, expectedSourceUpdatedAt: stash.updatedAt, expectedDestinationUpdatedAt: actor.updatedAt },
      { idempotencyKey: mutationKey(`take-${item.id}`) },
    ));
  }

  function consumeAmmunition(item: Item) {
    const ammunitionId = dndInventoryMetadata(item).ammunitionSourceItemId;
    const ammunition = actorItems.find((candidate) => candidate.id === ammunitionId);
    if (!ammunition) return;
    void mutate(`ammo-${item.id}`, `Consumed one ${ammunition.name}`, () => apiPost(
      `/api/v1/campaigns/${encodeURIComponent(props.campaignId)}/dnd/inventory/items/${encodeURIComponent(item.id)}/consume-ammunition`,
      { ammunitionItemId: ammunition.id, amount: 1, expectedUpdatedAt: item.updatedAt, expectedAmmunitionUpdatedAt: ammunition.updatedAt, expectedActorUpdatedAt: actor.updatedAt },
      { idempotencyKey: mutationKey(`ammo-${item.id}`) },
    ));
  }

  function createStash() {
    void mutate("create-stash", "Party stash created", () => apiPost(
      `/api/v1/campaigns/${encodeURIComponent(props.campaignId)}/dnd/party-stash`,
      { name: "Party Stash", expectedCampaignUpdatedAt: campaignRevision },
      { idempotencyKey: mutationKey("create-stash") },
    ));
  }

  function createMerchant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("merchantName") ?? "").trim();
    const tracksCurrency = form.get("tracksCurrency") === "on";
    if (!name) return;
    void mutate("create-merchant", `${name} created`, () => apiPost(
      `/api/v1/campaigns/${encodeURIComponent(props.campaignId)}/dnd/merchants`,
      { name, catalog: [], ...(tracksCurrency ? { currency: { gp: 0 } } : {}), expectedCampaignUpdatedAt: campaignRevision },
      { idempotencyKey: mutationKey("create-merchant") },
    ));
  }

  function buy(merchant: Item, catalogEntryId: string) {
    void mutate(`buy-${merchant.id}-${catalogEntryId}`, "Purchase complete", () => apiPost(
      `/api/v1/campaigns/${encodeURIComponent(props.campaignId)}/dnd/merchants/${encodeURIComponent(merchant.id)}/buy`,
      { actorId: actor.id, catalogEntryId, quantity: 1, expectedActorUpdatedAt: actor.updatedAt, expectedMerchantUpdatedAt: merchant.updatedAt },
      { idempotencyKey: mutationKey(`buy-${merchant.id}-${catalogEntryId}`) },
    ));
  }

  function sell(item: Item, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const merchantId = String(form.get("merchantId") ?? "");
    const merchant = merchants.find((candidate) => candidate.id === merchantId);
    if (!merchant) return;
    void mutate(`sell-${item.id}`, `Sold one ${item.name}`, () => apiPost(
      `/api/v1/campaigns/${encodeURIComponent(props.campaignId)}/dnd/merchants/${encodeURIComponent(merchant.id)}/sell`,
      { actorId: actor.id, itemId: item.id, quantity: 1, expectedActorUpdatedAt: actor.updatedAt, expectedMerchantUpdatedAt: merchant.updatedAt, expectedItemUpdatedAt: item.updatedAt },
      { idempotencyKey: mutationKey(`sell-${item.id}`) },
    ));
  }

  function recordLoot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stash || !props.combat) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("lootName") ?? "").trim();
    if (!name) return;
    void mutate("record-loot", `${name} added to combat loot`, () => apiPost(
      `/api/v1/combats/${encodeURIComponent(props.combat!.id)}/dnd/loot`,
      { stashId: stash.id, items: [{ name, type: String(form.get("lootType") ?? "gear"), quantity: Math.max(1, Math.floor(formNumber(form, "lootQuantity", 1))), weightLb: Math.max(0, formNumber(form, "lootWeightLb", 0)) }], expectedUpdatedAt: props.combat!.updatedAt, expectedStashUpdatedAt: stash.updatedAt },
      { idempotencyKey: mutationKey("record-loot") },
    ));
  }

  function claimLoot(item: Item) {
    if (!stash) return;
    void mutate(`claim-${item.id}`, `${item.name} claimed for ${actor.name}`, () => apiPost(
      `/api/v1/campaigns/${encodeURIComponent(props.campaignId)}/dnd/loot/${encodeURIComponent(item.id)}/claim`,
      { actorId: actor.id, expectedUpdatedAt: item.updatedAt, expectedStashUpdatedAt: stash.updatedAt, expectedActorUpdatedAt: actor.updatedAt },
      { idempotencyKey: mutationKey(`claim-${item.id}`) },
    ));
  }

  function resolveLoot(item: Item, action: "assign" | "release") {
    if (!stash) return;
    void mutate(`${action}-${item.id}`, action === "assign" ? `${item.name} assigned` : `${item.name} released`, () => apiPost(
      `/api/v1/campaigns/${encodeURIComponent(props.campaignId)}/dnd/loot/${encodeURIComponent(item.id)}/assignment`,
      { action, actorId: actor.id, expectedUpdatedAt: item.updatedAt, expectedStashUpdatedAt: stash.updatedAt, expectedActorUpdatedAt: actor.updatedAt },
      { idempotencyKey: mutationKey(`${action}-${item.id}`) },
    ));
  }

  return (
    <section className="operator-section dnd-inventory-commerce" aria-label="D&D inventory and commerce">
      <div className="operator-heading">
        <div>
          <div className="section-title">Inventory & commerce</div>
          <small>Containers, ammunition, party stash, merchants, and typed combat loot</small>
        </div>
        <button className="ghost-button small" type="button" disabled={loading} onClick={() => void load()}>Refresh</button>
      </div>

      {summary && (
        <div className="inventory-capacity" aria-label="Carrying capacity">
          <div className="metric-row"><span>Carried weight</span><strong>{summary.carriedWeightLb.toFixed(2)} lb{summary.capacityLb !== undefined ? ` / ${summary.capacityLb} lb` : ""}</strong></div>
          {summary.capacityLb !== undefined && <meter min={0} max={Math.max(summary.capacityLb, summary.carriedWeightLb, 1)} value={summary.carriedWeightLb}>{summary.carriedWeightLb} of {summary.capacityLb} pounds</meter>}
          <div className={`status-${summary.status === "within_capacity" ? "good" : "bad"}`}>{summary.status.replaceAll("_", " ")}</div>
          {summary.warnings.map((warning) => <p className="status-warn" key={warning}>{warning}</p>)}
        </div>
      )}

      {(status || loadError) && <p className={status.toLowerCase().includes("failed") || loadError ? "status-bad" : "status-good"} role="status" aria-live="polite">{status || loadError}</p>}
      {overview.warnings.map((warning) => <p className="status-warn" key={warning}>{warning}</p>)}

      <details open>
        <summary>{actor.name} inventory ({actorItems.length})</summary>
        {actorItems.length === 0 ? <p className="empty-state compact">No inventory items.</p> : actorItems.map((item) => {
          const metadata = dndInventoryMetadata(item);
          const linkedAmmo = actorItems.find((candidate) => candidate.id === metadata.ammunitionSourceItemId);
          return (
            <article className="inventory-commerce-card" key={item.id}>
              <div className="operator-heading"><strong>{item.name}</strong><span>{metadata.quantity} × {metadata.weightLb} lb</span></div>
              <form className="inventory-item-editor" onSubmit={(event) => editItem(item, event)}>
                <label>Quantity<input name="quantity" type="number" min={0} step={1} defaultValue={metadata.quantity} disabled={!props.canUpdateActor || busy !== ""} /></label>
                <label>Weight (lb)<input name="weightLb" type="number" min={0} step="0.01" defaultValue={metadata.weightLb} disabled={!props.canUpdateActor || busy !== ""} /></label>
                <label>Inside<select name="parentItemId" defaultValue={metadata.parentItemId ?? ""} disabled={!props.canUpdateActor || busy !== ""}><option value="">Carried directly</option>{containers.filter((container) => container.id !== item.id).map((container) => <option value={container.id} key={container.id}>{container.name}</option>)}</select></label>
                <label>Container capacity<input name="containerCapacityLb" type="number" min="0.01" step="0.01" defaultValue={metadata.container?.capacityLb ?? ""} disabled={!props.canUpdateActor || busy !== ""} /></label>
                <label className="checkbox-row"><input name="extradimensional" type="checkbox" defaultChecked={metadata.container?.extradimensional} disabled={!props.canUpdateActor || busy !== ""} /> Extradimensional storage</label>
                <label>Ammunition<select name="ammunitionSourceItemId" defaultValue={metadata.ammunitionSourceItemId ?? ""} disabled={!props.canUpdateActor || busy !== ""}><option value="">None</option>{actorItems.filter((candidate) => candidate.id !== item.id).map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.name}</option>)}</select></label>
                <div className="button-row">
                  <button className="ghost-button small" type="submit" disabled={!props.canUpdateActor || busy !== ""}>Save item</button>
                  {stash && <button className="ghost-button small" type="button" disabled={!props.canUpdateActor || busy !== "" || metadata.quantity < 1} onClick={() => transferToStash(item)}>Stash one</button>}
                  {linkedAmmo && <button className="ghost-button small" type="button" disabled={!props.canUpdateActor || busy !== "" || dndInventoryMetadata(linkedAmmo).quantity < 1} onClick={() => consumeAmmunition(item)}>Use 1 {linkedAmmo.name}</button>}
                </div>
              </form>
              {overview.merchants.length > 0 && (
                <form className="inline-form" onSubmit={(event) => sell(item, event)}>
                  <label>Sell to<select name="merchantId">{overview.merchants.map((merchant) => <option value={merchant.id} key={merchant.id}>{merchant.name}</option>)}</select></label>
                  <button className="ghost-button small" type="submit" disabled={!props.canUpdateActor || busy !== "" || metadata.quantity < 1}>Sell one</button>
                </form>
              )}
            </article>
          );
        })}
      </details>

      <details open>
        <summary>Party stash</summary>
        {!stash ? (
          props.canManageCampaign ? <button className="ghost-button" type="button" disabled={!overview.campaignUpdatedAt || busy !== ""} onClick={createStash}>Create party stash</button> : <p className="empty-state compact">A GM has not created a party stash.</p>
        ) : (
          <>
            <div className="metric-row"><span>{stash.name}</span><strong>{overview.partyStashItems.length} items</strong></div>
            {overview.partyStashSummary && <div className="metric-row"><span>Stored weight</span><strong>{overview.partyStashSummary.carriedWeightLb.toFixed(2)} lb</strong></div>}
            {overview.partyStashItems.filter((item) => !dndLootData(item)).map((item) => <div className="operator-row" key={item.id}><span>{item.name} × {dndInventoryMetadata(item).quantity}</span>{props.canManageCampaign && props.canUpdateActor && <button className="ghost-button small" type="button" disabled={busy !== ""} onClick={() => transferFromStash(item)}>Take one</button>}</div>)}
          </>
        )}
      </details>

      <details>
        <summary>Merchants ({overview.merchants.length})</summary>
        {overview.merchants.map((merchant) => {
          const data = dndMerchantData(merchant);
          if (!data) return null;
          return <article className="inventory-commerce-card" key={merchant.id}><div className="operator-heading"><strong>{merchant.name}</strong><span>{data.currency ? dndCurrencyLabel(data.currency) : "Manual liquidity"}</span></div>{data.description && <p>{data.description}</p>}{data.catalog.length === 0 ? <p className="empty-state compact">No catalog entries.</p> : data.catalog.map((entry) => <div className="operator-row" key={entry.id}><span>{entry.name} — {entry.unitPriceGp} gp{entry.availableQuantity !== undefined ? ` (${entry.availableQuantity} available)` : ""}</span><button className="ghost-button small" type="button" disabled={!props.canUpdateActor || busy !== "" || entry.availableQuantity === 0} onClick={() => buy(merchant, entry.id)}>Buy one</button></div>)}</article>;
        })}
        {props.canManageCampaign && <form className="inventory-create-form" onSubmit={createMerchant}><label>Merchant name<input name="merchantName" required maxLength={120} /></label><label className="checkbox-row"><input name="tracksCurrency" type="checkbox" /> Track merchant cash</label><button className="ghost-button" type="submit" disabled={!overview.campaignUpdatedAt || busy !== ""}>Create merchant</button></form>}
      </details>

      <details open>
        <summary>Combat loot ({overview.lootItems.length})</summary>
        {overview.lootItems.length === 0 && <p className="empty-state compact">No typed loot is waiting in the party stash.</p>}
        {overview.lootItems.map((item) => {
          const loot = dndLootData(item);
          if (!loot) return null;
          return <div className="operator-row" key={item.id}><span><strong>{item.name}</strong> — {loot.status}</span><div className="button-row">{loot.status === "available" && <button className="ghost-button small" type="button" disabled={!props.canUpdateActor || busy !== ""} onClick={() => claimLoot(item)}>Claim</button>}{loot.status === "claimed" && props.canManageCampaign && props.canManageCombat && <button className="ghost-button small" type="button" disabled={busy !== ""} onClick={() => resolveLoot(item, "assign")}>Assign</button>}{loot.status === "claimed" && <button className="ghost-button small" type="button" disabled={busy !== ""} onClick={() => resolveLoot(item, "release")}>Release</button>}</div></div>;
        })}
        {stash && props.combat && props.canManageCampaign && props.canManageCombat && <form className="inventory-create-form" onSubmit={recordLoot}><label>Loot name<input name="lootName" required maxLength={160} /></label><label>Type<input name="lootType" defaultValue="gear" required /></label><label>Quantity<input name="lootQuantity" type="number" min={1} step={1} defaultValue={1} /></label><label>Weight (lb)<input name="lootWeightLb" type="number" min={0} step="0.01" defaultValue={0} /></label><button className="ghost-button" type="submit" disabled={busy !== ""}>Record combat loot</button></form>}
      </details>
    </section>
  );
}
