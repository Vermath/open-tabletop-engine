import type { CompendiumCatalogEntry, ContentImportLicense, Item } from "@open-tabletop/core";
import { useEffect, useId, useMemo, useState } from "react";

import { ApiError, apiDelete, apiGet, apiPatch, apiPost } from "./api.js";
import { DndMonsterVariantPanel } from "./dnd-monster-variant-panel.js";

export const dndCustomContentKinds = ["monster", "spell", "item", "feat", "species", "background", "subclass", "condition"] as const;
export type DndCustomContentKind = (typeof dndCustomContentKinds)[number];

export interface DndCustomContentDraft {
  kind: DndCustomContentKind;
  name: string;
  summary: string;
  sourceName: string;
  sourceVersion: string;
  contentVersion: string;
  license: ContentImportLicense;
  data: Record<string, unknown>;
}

export interface DndCustomContentIssue {
  path: string;
  code: string;
  message: string;
}

export interface DndCustomContentRecord {
  item: Item;
  entry: CompendiumCatalogEntry;
  draft: DndCustomContentDraft;
  warnings?: DndCustomContentIssue[];
  campaignUpdatedAt?: string;
}

interface DndCustomContentPanelProps {
  campaignId: string;
  campaignUpdatedAt: string;
  onMutation(result: { item?: Item; deletedItemId?: string; campaignUpdatedAt?: string }): void;
  onStatus(message: string): void;
}

interface PreviewResponse {
  preview: true;
  entry: CompendiumCatalogEntry;
  warnings: DndCustomContentIssue[];
}

export function DndCustomContentPanel({ campaignId, campaignUpdatedAt, onMutation, onStatus }: DndCustomContentPanelProps) {
  const headingId = useId();
  const [records, setRecords] = useState<DndCustomContentRecord[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);
  const [draft, setDraft] = useState<DndCustomContentDraft>(() => defaultDndCustomContentDraft("monster"));
  const [editingItemId, setEditingItemId] = useState("");
  const [preview, setPreview] = useState<PreviewResponse>();
  const [issues, setIssues] = useState<DndCustomContentIssue[]>([]);
  const [pending, setPending] = useState<"preview" | "save" | "delete" | "">("");
  const [confirmDeleteId, setConfirmDeleteId] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoadState("loading");
    setLoadError("");
    void apiGet<DndCustomContentRecord[]>(customContentPath(campaignId), { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setRecords(result);
        setLoadState("ready");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoadState("error");
        setLoadError(error instanceof Error ? error.message : "Could not load custom content.");
      });
    return () => controller.abort();
  }, [campaignId, reloadVersion]);

  const selectedRecord = useMemo(() => records.find((record) => record.item.id === editingItemId), [editingItemId, records]);
  const previewCurrent = preview && preview.entry.name === draft.name && preview.entry.type === draft.kind && preview.entry.provenance.contentVersion === draft.contentVersion;

  function replaceDraft(next: DndCustomContentDraft): void {
    setDraft(next);
    setPreview(undefined);
    setIssues([]);
  }

  function setCommon<K extends keyof DndCustomContentDraft>(key: K, value: DndCustomContentDraft[K]): void {
    replaceDraft({ ...draft, [key]: value });
  }

  function setData(key: string, value: unknown): void {
    replaceDraft({ ...draft, data: { ...draft.data, [key]: value } });
  }

  function editRecord(record: DndCustomContentRecord): void {
    setEditingItemId(record.item.id);
    replaceDraft(cloneDraft(record.draft));
    setConfirmDeleteId("");
  }

  function startNew(kind: DndCustomContentKind = draft.kind): void {
    setEditingItemId("");
    replaceDraft(defaultDndCustomContentDraft(kind));
    setConfirmDeleteId("");
  }

  async function validatePreview(): Promise<void> {
    setPending("preview");
    setIssues([]);
    try {
      const result = await apiPost<PreviewResponse>(`${customContentPath(campaignId)}/preview`, draft);
      setPreview(result);
      setIssues(result.warnings);
      onStatus(`${draft.name || "Custom content"} preview is ready for review.`);
    } catch (error) {
      const nextIssues = customContentIssues(error);
      setIssues(nextIssues);
      setPreview(undefined);
      onStatus(error instanceof Error ? error.message : "Custom content preview failed.");
    } finally {
      setPending("");
    }
  }

  async function saveReviewed(): Promise<void> {
    if (!previewCurrent) {
      setIssues([{ path: "preview", code: "required", message: "Preview the current fields before saving." }]);
      return;
    }
    const expectedUpdatedAt = selectedRecord?.item.updatedAt ?? campaignUpdatedAt;
    if (!expectedUpdatedAt) {
      setIssues([{ path: "expectedUpdatedAt", code: "missing_revision", message: "Reload the campaign before saving." }]);
      return;
    }
    setPending("save");
    try {
      const idempotencyKey = customContentIdempotencyKey(editingItemId ? "update" : "create");
      const result = editingItemId
        ? await apiPatch<DndCustomContentRecord>(`${customContentPath(campaignId)}/${encodeURIComponent(editingItemId)}`, { ...draft, expectedUpdatedAt }, { idempotencyKey })
        : await apiPost<DndCustomContentRecord>(customContentPath(campaignId), { ...draft, expectedUpdatedAt }, { idempotencyKey });
      setRecords((current) => current.some((record) => record.item.id === result.item.id)
        ? current.map((record) => record.item.id === result.item.id ? result : record)
        : [...current, result].sort((left, right) => left.item.name.localeCompare(right.item.name)));
      onMutation({ item: result.item, campaignUpdatedAt: result.campaignUpdatedAt });
      onStatus(`${result.item.name} ${editingItemId ? "updated" : "created"}.`);
      setEditingItemId(result.item.id);
      setPreview(undefined);
      setIssues(result.warnings ?? []);
    } catch (error) {
      setIssues(customContentIssues(error));
      onStatus(error instanceof Error ? error.message : "Custom content save failed.");
    } finally {
      setPending("");
    }
  }

  async function deleteRecord(record: DndCustomContentRecord): Promise<void> {
    if (confirmDeleteId !== record.item.id) {
      setConfirmDeleteId(record.item.id);
      return;
    }
    setPending("delete");
    try {
      const result = await apiDelete<{ deleted: true; itemId: string; campaignUpdatedAt?: string }>(
        `${customContentPath(campaignId)}/${encodeURIComponent(record.item.id)}`,
        { idempotencyKey: customContentIdempotencyKey("delete"), body: { expectedUpdatedAt: record.item.updatedAt } }
      );
      setRecords((current) => current.filter((candidate) => candidate.item.id !== result.itemId));
      onMutation({ deletedItemId: result.itemId, campaignUpdatedAt: result.campaignUpdatedAt });
      onStatus(`${record.item.name} deleted.`);
      startNew(record.draft.kind);
    } catch (error) {
      setIssues(customContentIssues(error));
      onStatus(error instanceof Error ? error.message : "Custom content deletion failed.");
    } finally {
      setPending("");
      setConfirmDeleteId("");
    }
  }

  return (
    <section className="operator-section dnd-custom-content" aria-labelledby={headingId}>
      <div className="operator-heading">
        <div>
          <div className="section-title">D&amp;D custom content</div>
          <h3 id={headingId}>Campaign builders</h3>
          <p>Build private or user-licensed D&amp;D content with typed fields. Preview is required; homebrew is never labeled as official SRD content.</p>
        </div>
        <button className="ghost-button" type="button" onClick={() => startNew()} disabled={Boolean(pending)}>New</button>
      </div>

      {loadState === "loading" && <p role="status">Loading campaign custom content…</p>}
      {loadState === "error" && (
        <div className="inline-error" role="alert">
          <p>{loadError}</p>
          <button className="ghost-button" type="button" onClick={() => setReloadVersion((value) => value + 1)}>Retry</button>
        </div>
      )}
      {loadState === "ready" && records.length === 0 && <p className="empty-state compact">No D&amp;D custom content yet.</p>}
      {records.length > 0 && (
        <div className="custom-content-list" role="list" aria-label="Campaign custom content">
          {records.map((record) => {
            const immutableVariant = isDndMonsterVariantRecord(record);
            return <article className="operator-row" role="listitem" key={record.item.id}>
              <div>
                <strong>{record.item.name}</strong>
                <p>{record.entry.type} · version {record.entry.provenance.contentVersion} · {record.entry.provenance.license.name}</p>
              </div>
              <div className="row-actions">
                <button className="ghost-button small" type="button" onClick={() => editRecord(record)} disabled={Boolean(pending) || immutableVariant} title={immutableVariant ? "Create another variant from this campaign monster in the Monster workshop." : undefined}>{immutableVariant ? "Variant snapshot" : "Edit"}</button>
                <button className={confirmDeleteId === record.item.id ? "danger-button small" : "ghost-button small"} type="button" onClick={() => void deleteRecord(record)} disabled={Boolean(pending)}>
                  {confirmDeleteId === record.item.id ? "Confirm delete" : "Delete"}
                </button>
              </div>
            </article>;
          })}
        </div>
      )}

      <DndMonsterVariantPanel
        campaignId={campaignId}
        campaignUpdatedAt={campaignUpdatedAt}
        onCampaignMutation={onMutation}
        onStatus={onStatus}
        onVariantCreated={(result) => {
          const record: DndCustomContentRecord = { item: result.item, entry: result.entry, draft: result.draft, warnings: result.warnings, campaignUpdatedAt: result.campaignUpdatedAt };
          setRecords((current) => [...current.filter((candidate) => candidate.item.id !== result.item.id), record].sort((left, right) => left.item.name.localeCompare(right.item.name)));
        }}
      />

      <form className="custom-content-form" onSubmit={(event) => { event.preventDefault(); void validatePreview(); }}>
        <div className="form-grid two-column">
          <SelectField label="Content type" value={draft.kind} onChange={(value) => startNew(value as DndCustomContentKind)} options={dndCustomContentKinds.map((kind) => ({ value: kind, label: title(kind) }))} />
          <TextField label="Name" value={draft.name} onChange={(value) => setCommon("name", value)} required />
          <TextField label="Summary" value={draft.summary} onChange={(value) => setCommon("summary", value)} required />
          <TextField label="Source name" value={draft.sourceName} onChange={(value) => setCommon("sourceName", value)} required />
          <TextField label="Source version" value={draft.sourceVersion} onChange={(value) => setCommon("sourceVersion", value)} required />
          <TextField label="Content version" value={draft.contentVersion} onChange={(value) => setCommon("contentVersion", value)} required />
          <SelectField label="Usage declaration" value={draft.license.usage} onChange={(value) => setCommon("license", { ...draft.license, usage: value as ContentImportLicense["usage"] })} options={[
            { value: "private_home_game", label: "Private home game" },
            { value: "user_provided", label: "User provided" },
            { value: "open", label: "Openly licensed" }
          ]} />
          <TextField label="License name" value={draft.license.name} onChange={(value) => setCommon("license", { ...draft.license, name: value })} required />
          <TextField label="License URL" value={draft.license.url ?? ""} onChange={(value) => setCommon("license", { ...draft.license, url: value || undefined })} type="url" />
          <TextField label="Attribution" value={draft.license.attribution ?? ""} onChange={(value) => setCommon("license", { ...draft.license, attribution: value || undefined })} />
        </div>

        <KindFields kind={draft.kind} data={draft.data} setData={setData} />

        <TextAreaField label="Manual adjudication notes" value={text(draft.data.manualAdjudication)} onChange={(value) => setData("manualAdjudication", value)} rows={3} />

        {issues.length > 0 && (
          <div className="inline-error" role="alert">
            <strong>Review these fields</strong>
            <ul>{issues.map((issue, index) => <li key={`${issue.path}:${issue.code}:${index}`}><code>{issue.path}</code>: {issue.message}</li>)}</ul>
          </div>
        )}

        {preview && (
          <article className="proposal-card" aria-label="Custom content preview">
            <strong>{preview.entry.name}</strong>
            <p>{preview.entry.summary}</p>
            <span>{preview.entry.type} · {preview.entry.provenance.sourceName} {preview.entry.provenance.contentVersion}</span>
            <span>{preview.entry.provenance.license.name} ({preview.entry.provenance.license.usage.replaceAll("_", " ")})</span>
            {preview.warnings.length > 0 && <p>{preview.warnings.length} manual-review warning{preview.warnings.length === 1 ? "" : "s"}</p>}
          </article>
        )}

        <div className="row-actions">
          <button className="ghost-button" type="submit" disabled={Boolean(pending)}>{pending === "preview" ? "Previewing…" : "Preview"}</button>
          <button className="primary-button" type="button" onClick={() => void saveReviewed()} disabled={Boolean(pending) || !previewCurrent}>
            {pending === "save" ? "Saving…" : editingItemId ? "Save reviewed update" : "Create reviewed content"}
          </button>
        </div>
      </form>
    </section>
  );
}

function KindFields({ kind, data, setData }: { kind: DndCustomContentKind; data: Record<string, unknown>; setData(key: string, value: unknown): void }) {
  const abilities = object(data.abilities);
  const components = object(data.components);
  if (kind === "monster") return (
    <fieldset><legend>Monster stat block</legend><div className="form-grid two-column">
      <SelectField label="Size" value={text(data.size)} onChange={(value) => setData("size", value)} options={choices("tiny", "small", "medium", "large", "huge", "gargantuan")} />
      <TextField label="Creature type" value={text(data.creatureType)} onChange={(value) => setData("creatureType", value)} required />
      <NumberField label="Armor Class" value={numberValue(data.armorClass, 10)} onChange={(value) => setData("armorClass", value)} min={1} max={40} />
      <NumberField label="Hit Points" value={numberValue(data.hitPoints, 1)} onChange={(value) => setData("hitPoints", value)} min={1} />
      <TextField label="Hit Dice" value={text(data.hitDice)} onChange={(value) => setData("hitDice", value)} required />
      <TextField label="Challenge Rating" value={text(data.challengeRating)} onChange={(value) => setData("challengeRating", value)} required />
      <NumberField label="Proficiency Bonus" value={numberValue(data.proficiencyBonus, 2)} onChange={(value) => setData("proficiencyBonus", value)} min={2} max={9} />
      <NumberField label="Walking speed (feet)" value={numberValue(object(data.speed).walk, 30)} onChange={(value) => setData("speed", { ...object(data.speed), walk: value })} min={0} />
      {abilityNames.map((ability) => <NumberField key={ability} label={title(ability)} value={numberValue(abilities[ability], 10)} onChange={(value) => setData("abilities", { ...abilities, [ability]: value })} min={1} max={30} />)}
      <TextAreaField label="Actions (one per line: Name: Description)" value={formatNamed(data.actions)} onChange={(value) => setData("actions", parseCustomNamedRows(value))} rows={4} />
      <TextAreaField label="Traits (one per line: Name: Description)" value={formatNamed(data.traits)} onChange={(value) => setData("traits", parseCustomNamedRows(value))} rows={4} />
      <TextField label="Senses (comma separated)" value={formatList(data.senses)} onChange={(value) => setData("senses", parseList(value))} />
      <TextField label="Languages (comma separated)" value={formatList(data.languages)} onChange={(value) => setData("languages", parseList(value))} />
    </div></fieldset>
  );
  if (kind === "spell") return (
    <fieldset><legend>Spell rules</legend><div className="form-grid two-column">
      <NumberField label="Spell level (0 for cantrip)" value={numberValue(data.level, 0)} onChange={(value) => setData("level", value)} min={0} max={9} />
      <SelectField label="School" value={text(data.school)} onChange={(value) => setData("school", value)} options={choices("abjuration", "conjuration", "divination", "enchantment", "evocation", "illusion", "necromancy", "transmutation")} />
      <TextField label="Casting time" value={text(data.castingTime)} onChange={(value) => setData("castingTime", value)} required />
      <TextField label="Range" value={text(data.range)} onChange={(value) => setData("range", value)} required />
      <TextField label="Duration" value={text(data.duration)} onChange={(value) => setData("duration", value)} required />
      <TextField label="Classes (comma separated)" value={formatList(data.classes)} onChange={(value) => setData("classes", parseList(value))} />
      <CheckboxField label="Verbal component" checked={components.verbal === true} onChange={(value) => setData("components", { ...components, verbal: value })} />
      <CheckboxField label="Somatic component" checked={components.somatic === true} onChange={(value) => setData("components", { ...components, somatic: value })} />
      <TextField label="Material component" value={text(components.material)} onChange={(value) => setData("components", { ...components, material: value })} />
      <CheckboxField label="Concentration" checked={data.concentration === true} onChange={(value) => setData("concentration", value)} />
      <CheckboxField label="Ritual" checked={data.ritual === true} onChange={(value) => setData("ritual", value)} />
      <TextField label="Damage formula" value={text(data.damageFormula)} onChange={(value) => setData("damageFormula", value)} />
      <TextAreaField label="Description" value={text(data.description)} onChange={(value) => setData("description", value)} rows={6} required />
      <TextAreaField label="At higher levels" value={text(data.higherLevels)} onChange={(value) => setData("higherLevels", value)} rows={3} />
    </div></fieldset>
  );
  if (kind === "item") return (
    <fieldset><legend>Item rules</legend><div className="form-grid two-column">
      <SelectField label="Category" value={text(data.category)} onChange={(value) => setData("category", value)} options={choices("weapon", "armor", "adventuring-gear", "tool", "consumable", "treasure")} />
      <NumberField label="Cost (gp)" value={numberValue(data.costGp, 0)} onChange={(value) => setData("costGp", value)} min={0} step="0.01" />
      <NumberField label="Weight (lb)" value={numberValue(data.weightLb, 0)} onChange={(value) => setData("weightLb", value)} min={0} step="0.01" />
      <TextField label="Properties (comma separated)" value={formatList(data.properties)} onChange={(value) => setData("properties", parseList(value))} />
      <TextField label="Damage formula" value={text(data.damageFormula)} onChange={(value) => setData("damageFormula", value)} />
      <TextField label="Damage type" value={text(data.damageType)} onChange={(value) => setData("damageType", value)} />
      <TextField label="Ammunition type" value={text(data.ammunitionType)} onChange={(value) => setData("ammunitionType", value)} />
      <CheckboxField label="Requires attunement" checked={data.requiresAttunement === true} onChange={(value) => setData("requiresAttunement", value)} />
      <CheckboxField label="Consumable" checked={data.consumable === true} onChange={(value) => setData("consumable", value)} />
      <TextAreaField label="Description" value={text(data.description)} onChange={(value) => setData("description", value)} rows={5} required />
    </div></fieldset>
  );
  if (kind === "feat") return (
    <fieldset><legend>Feat rules</legend><div className="form-grid two-column">
      <SelectField label="Feat category" value={text(data.category)} onChange={(value) => setData("category", value)} options={choices("origin", "general", "fighting-style", "epic-boon")} />
      <CheckboxField label="Repeatable" checked={data.repeatable === true} onChange={(value) => setData("repeatable", value)} />
      <TextField label="Prerequisites (comma separated)" value={formatList(data.prerequisites)} onChange={(value) => setData("prerequisites", parseList(value))} />
      <TextAreaField label="Benefits (one per line: Name: Description)" value={formatNamed(data.benefits)} onChange={(value) => setData("benefits", parseCustomNamedRows(value))} rows={4} />
      <TextAreaField label="Description" value={text(data.description)} onChange={(value) => setData("description", value)} rows={5} required />
    </div></fieldset>
  );
  if (kind === "species") return (
    <fieldset><legend>Species rules</legend><div className="form-grid two-column">
      <TextField label="Creature type" value={text(data.creatureType)} onChange={(value) => setData("creatureType", value)} required />
      <TextField label="Size options (comma separated)" value={formatList(data.sizeOptions)} onChange={(value) => setData("sizeOptions", parseList(value))} />
      <NumberField label="Walking speed (feet)" value={numberValue(object(data.speed).walk, 30)} onChange={(value) => setData("speed", { ...object(data.speed), walk: value })} min={0} />
      <TextField label="Languages (comma separated)" value={formatList(data.languages)} onChange={(value) => setData("languages", parseList(value))} />
      <TextAreaField label="Traits (one per line: Name: Description)" value={formatNamed(data.traits)} onChange={(value) => setData("traits", parseCustomNamedRows(value))} rows={5} />
      <TextAreaField label="Description" value={text(data.description)} onChange={(value) => setData("description", value)} rows={5} required />
    </div></fieldset>
  );
  if (kind === "background") return (
    <fieldset><legend>Background rules</legend><div className="form-grid two-column">
      <TextField label="Ability score options (exactly 3, comma separated)" value={formatList(data.abilityScoreOptions)} onChange={(value) => setData("abilityScoreOptions", parseList(value))} />
      <TextField label="Skill proficiencies (exactly 2, comma separated)" value={formatList(data.skillProficiencies)} onChange={(value) => setData("skillProficiencies", parseList(value))} />
      <TextField label="Origin feat" value={text(data.originFeat)} onChange={(value) => setData("originFeat", value)} required />
      <TextField label="Tool proficiency" value={text(data.toolProficiency)} onChange={(value) => setData("toolProficiency", value)} />
      <TextField label="Starting equipment (comma separated)" value={formatList(data.startingEquipment)} onChange={(value) => setData("startingEquipment", parseList(value))} />
      <NumberField label="Starting gp" value={numberValue(data.startingGp, 0)} onChange={(value) => setData("startingGp", value)} min={0} />
      <TextAreaField label="Description" value={text(data.description)} onChange={(value) => setData("description", value)} rows={5} required />
    </div></fieldset>
  );
  if (kind === "subclass") return (
    <fieldset><legend>Subclass rules</legend><div className="form-grid two-column">
      <TextField label="Parent class" value={text(data.parentClass)} onChange={(value) => setData("parentClass", value)} required />
      <NumberField label="Subclass selection level" value={numberValue(data.selectionLevel, 3)} onChange={(value) => setData("selectionLevel", value)} min={1} max={20} />
      <SelectField label="Spellcasting progression" value={text(data.spellcastingProgression)} onChange={(value) => setData("spellcastingProgression", value)} options={choices("none", "full", "half", "third", "pact")} />
      <TextAreaField label="Features (one per line: Level | Name | Description)" value={formatFeatures(data.features)} onChange={(value) => setData("features", parseCustomFeatureRows(value))} rows={6} />
      <TextAreaField label="Description" value={text(data.description)} onChange={(value) => setData("description", value)} rows={5} required />
    </div></fieldset>
  );
  return (
    <fieldset><legend>Condition rules</legend><div className="form-grid two-column">
      <SelectField label="Stacking" value={text(data.stacking)} onChange={(value) => setData("stacking", value)} options={choices("replace", "refresh", "stack", "manual")} />
      <TextField label="Default duration" value={text(data.defaultDuration)} onChange={(value) => setData("defaultDuration", value)} />
      <SelectField label="End-save ability" value={text(data.endSaveAbility)} onChange={(value) => setData("endSaveAbility", value)} options={[{ value: "", label: "None" }, ...choices(...abilityNames)]} />
      <TextAreaField label="Effects (one per line: Name: Description)" value={formatNamed(data.effects)} onChange={(value) => setData("effects", parseCustomNamedRows(value))} rows={4} />
      <TextAreaField label="Description" value={text(data.description)} onChange={(value) => setData("description", value)} rows={5} required />
    </div></fieldset>
  );
}

const abilityNames = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"] as const;

export function defaultDndCustomContentDraft(kind: DndCustomContentKind): DndCustomContentDraft {
  const common = {
    kind,
    name: "",
    summary: "",
    sourceName: "Campaign homebrew",
    sourceVersion: "1",
    contentVersion: "1.0.0",
    license: { name: "Private home game", usage: "private_home_game" as const }
  };
  const dataByKind: Record<DndCustomContentKind, Record<string, unknown>> = {
    monster: { size: "medium", creatureType: "Humanoid", armorClass: 10, hitPoints: 1, hitDice: "1d8", challengeRating: "0", proficiencyBonus: 2, speed: { walk: 30 }, abilities: Object.fromEntries(abilityNames.map((ability) => [ability, 10])), actions: [] },
    spell: { level: 0, school: "evocation", castingTime: "1 action", range: "Self", duration: "Instantaneous", description: "", classes: [], components: { verbal: true, somatic: false }, ritual: false, concentration: false },
    item: { category: "adventuring-gear", description: "", costGp: 0, weightLb: 0, properties: [], requiresAttunement: false, consumable: false },
    feat: { category: "origin", description: "", prerequisites: [], repeatable: false, benefits: [] },
    species: { description: "", creatureType: "Humanoid", sizeOptions: ["medium"], speed: { walk: 30 }, traits: [], languages: [] },
    background: { description: "", abilityScoreOptions: [], skillProficiencies: [], originFeat: "", startingEquipment: [] },
    subclass: { description: "", parentClass: "", selectionLevel: 3, spellcastingProgression: "none", features: [] },
    condition: { description: "", effects: [], stacking: "manual" }
  };
  return { ...common, data: dataByKind[kind] };
}

function cloneDraft(draft: DndCustomContentDraft): DndCustomContentDraft {
  return structuredClone(draft);
}

export function customContentPath(campaignId: string): string {
  return `/api/v1/campaigns/${encodeURIComponent(campaignId)}/dnd/custom-content`;
}

function customContentIdempotencyKey(operation: string): string {
  const nonce = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `dnd-custom-${operation}-${nonce}`;
}

function customContentIssues(error: unknown): DndCustomContentIssue[] {
  if (error instanceof ApiError && object(error.body).issues && Array.isArray(object(error.body).issues)) {
    return (object(error.body).issues as unknown[]).flatMap((value) => {
      const issue = object(value);
      return typeof issue.path === "string" && typeof issue.code === "string" && typeof issue.message === "string"
        ? [{ path: issue.path, code: issue.code, message: issue.message }]
        : [];
    });
  }
  return [{ path: "request", code: "request_failed", message: error instanceof Error ? error.message : "Request failed." }];
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function isDndMonsterVariantRecord(record: Pick<DndCustomContentRecord, "draft" | "entry">): boolean {
  return record.draft.kind === "monster" && object(record.entry.data).monsterVariant !== undefined;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function parseList(value: string): string[] {
  return [...new Set(value.split(/,|\n/).map((item) => item.trim()).filter(Boolean))];
}

function formatList(value: unknown): string {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").join(", ") : "";
}

export function parseCustomNamedRows(value: string): Array<{ name: string; description: string }> {
  return value.split(/\r?\n/).flatMap((line) => {
    const divider = line.indexOf(":");
    if (divider < 1) return [];
    const name = line.slice(0, divider).trim();
    const description = line.slice(divider + 1).trim();
    return name && description ? [{ name, description }] : [];
  });
}

function formatNamed(value: unknown): string {
  return Array.isArray(value) ? value.map((item) => `${text(object(item).name)}: ${text(object(item).description)}`.trim()).join("\n") : "";
}

export function parseCustomFeatureRows(value: string): Array<{ level: number; name: string; description: string }> {
  return value.split(/\r?\n/).flatMap((line) => {
    const [levelText, name, ...descriptionParts] = line.split("|").map((part) => part.trim());
    const level = Number(levelText);
    const description = descriptionParts.join(" | ");
    return Number.isInteger(level) && name && description ? [{ level, name, description }] : [];
  });
}

function formatFeatures(value: unknown): string {
  return Array.isArray(value) ? value.map((item) => {
    const feature = object(item);
    return `${numberValue(feature.level, 1)} | ${text(feature.name)} | ${text(feature.description)}`;
  }).join("\n") : "";
}

function title(value: string): string {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function choices(...values: string[]): Array<{ value: string; label: string }> {
  return values.map((value) => ({ value, label: title(value) }));
}

function TextField({ label, value, onChange, required = false, type = "text" }: { label: string; value: string; onChange(value: string): void; required?: boolean; type?: "text" | "url" }) {
  return <label className="compact-field"><span>{label}</span><input type={type} value={value} required={required} onChange={(event) => onChange(event.target.value)} /></label>;
}

function NumberField({ label, value, onChange, min, max, step = "1" }: { label: string; value: number; onChange(value: number): void; min?: number; max?: number; step?: string }) {
  return <label className="compact-field"><span>{label}</span><input type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange(value: string): void; options: Array<{ value: string; label: string }> }) {
  return <label className="compact-field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option.value || "none"} value={option.value}>{option.label}</option>)}</select></label>;
}

function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange(value: boolean): void }) {
  return <label className="check-row"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>;
}

function TextAreaField({ label, value, onChange, rows, required = false }: { label: string; value: string; onChange(value: string): void; rows: number; required?: boolean }) {
  return <label className="compact-field"><span>{label}</span><textarea value={value} rows={rows} required={required} onChange={(event) => onChange(event.target.value)} /></label>;
}
