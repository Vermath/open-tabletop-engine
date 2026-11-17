import type { CompendiumCatalogEntry, CompendiumProvenance, ContentImportLicense, Item } from "@open-tabletop/core";
import { useEffect, useMemo, useState } from "react";

import { ApiError, apiDelete, apiGet, apiPatch, apiPost } from "./api.js";

export interface DndMonsterIssue {
  path: string;
  code: string;
  message: string;
}

export interface DndMonsterNamedFeature {
  name: string;
  description: string;
}

export interface DndMonsterActionOverride extends DndMonsterNamedFeature {
  kind?: "action" | "bonusAction" | "reaction";
  attackBonus?: number;
  range?: string;
  damageFormula?: string;
  damageType?: string;
  save?: { ability: string; dc: number; success?: string };
  condition?: string;
  effects?: string[];
  recharge?: string;
}

export interface DndMonsterOverrides {
  size?: string;
  creatureType?: string;
  alignment?: string;
  armorClass?: number;
  initiative?: number;
  hitPoints?: number;
  hitDice?: string;
  challengeRating?: string;
  xp?: number;
  proficiencyBonus?: number;
  speed?: Record<string, number>;
  abilities?: Record<string, number>;
  actions?: DndMonsterActionOverride[];
  savingThrows?: Record<string, number>;
  skills?: Record<string, number>;
  senses?: string[];
  languages?: string[];
  gear?: string[];
  traits?: DndMonsterNamedFeature[];
  reactions?: DndMonsterNamedFeature[];
  legendaryActions?: DndMonsterNamedFeature[];
  manualAdjudication?: string;
}

interface DndMonsterTemplate {
  id: string;
  version: string;
  name: string;
  description: string;
  overrides: DndMonsterOverrides;
}

interface TemplateResponse {
  item: Item;
  template: DndMonsterTemplate;
  warnings?: DndMonsterIssue[];
  campaignUpdatedAt?: string;
}

interface DndMonsterBase {
  kind: "bundled" | "campaign";
  id: string;
  version: string;
  name: string;
  provenance: CompendiumProvenance;
  data: Record<string, unknown>;
}

interface DndMonsterVariantDraft {
  name: string;
  summary: string;
  sourceName: string;
  sourceVersion: string;
  contentVersion: string;
  license: ContentImportLicense;
  base: { kind: "bundled" | "campaign"; id: string; version: string };
  template?: { id: string; version: string };
  overrides: DndMonsterOverrides;
}

interface VariantDiff {
  path: string;
  before?: unknown;
  after?: unknown;
}

interface VariantResponse {
  preview?: true;
  item?: Item;
  entry: CompendiumCatalogEntry;
  draft?: CreatedVariantDraft;
  variant: {
    base: DndMonsterBase;
    template?: { id: string; version: string; name: string; overrides: DndMonsterOverrides };
    overrides: DndMonsterOverrides;
    appliedOverrides: DndMonsterOverrides;
  };
  diff: VariantDiff[];
  warnings: DndMonsterIssue[];
  campaignUpdatedAt?: string;
}

interface DndMonsterVariantPanelProps {
  campaignId: string;
  campaignUpdatedAt: string;
  onVariantCreated(result: { item: Item; entry: CompendiumCatalogEntry; draft: CreatedVariantDraft; warnings?: DndMonsterIssue[]; campaignUpdatedAt?: string }): void;
  onCampaignMutation(result: { item?: Item; deletedItemId?: string; campaignUpdatedAt?: string }): void;
  onStatus(message: string): void;
}

interface CreatedVariantDraft {
  kind: "monster";
  name: string;
  summary: string;
  sourceName: string;
  sourceVersion: string;
  contentVersion: string;
  license: ContentImportLicense;
  data: Record<string, unknown>;
}

const emptyTemplate = { name: "", description: "", overrides: {} as DndMonsterOverrides };

export function DndMonsterVariantPanel({ campaignId, campaignUpdatedAt, onVariantCreated, onCampaignMutation, onStatus }: DndMonsterVariantPanelProps) {
  const [view, setView] = useState<"variant" | "template">("variant");
  const [templates, setTemplates] = useState<TemplateResponse[]>([]);
  const [bases, setBases] = useState<DndMonsterBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [campaignRevision, setCampaignRevision] = useState(campaignUpdatedAt);
  const [templateDraft, setTemplateDraft] = useState(emptyTemplate);
  const [editingTemplateId, setEditingTemplateId] = useState("");
  const [templatePreviewKey, setTemplatePreviewKey] = useState("");
  const [baseQuery, setBaseQuery] = useState("");
  const [baseKey, setBaseKey] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [identity, setIdentity] = useState<VariantIdentity>(defaultVariantIdentity);
  const [variantOverrides, setVariantOverrides] = useState<DndMonsterOverrides>({});
  const [variantPreview, setVariantPreview] = useState<VariantResponse>();
  const [variantPreviewKey, setVariantPreviewKey] = useState("");
  const [issues, setIssues] = useState<DndMonsterIssue[]>([]);
  const [pending, setPending] = useState<"template-preview" | "template-save" | "template-delete" | "variant-preview" | "variant-save" | "">("");
  const [confirmDelete, setConfirmDelete] = useState("");

  useEffect(() => setCampaignRevision(campaignUpdatedAt), [campaignUpdatedAt]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    void Promise.all([
      apiGet<TemplateResponse[]>(monsterTemplatePath(campaignId), { signal: controller.signal }),
      apiGet<DndMonsterBase[]>(monsterBasePath(campaignId), { signal: controller.signal })
    ]).then(([nextTemplates, nextBases]) => {
      if (controller.signal.aborted) return;
      setTemplates(nextTemplates);
      setBases(nextBases);
      setBaseKey((current) => current && nextBases.some((base) => monsterBaseKey(base) === current) ? current : monsterBaseKey(nextBases[0]));
      setLoading(false);
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setLoadError(error instanceof Error ? error.message : "Could not load the monster workshop.");
      setLoading(false);
    });
    return () => controller.abort();
  }, [campaignId, reload]);

  const selectedBase = useMemo(() => bases.find((base) => monsterBaseKey(base) === baseKey), [baseKey, bases]);
  const selectedTemplate = templates.find((candidate) => candidate.template.id === templateId)?.template;
  const visibleBases = useMemo(() => {
    const query = baseQuery.trim().toLowerCase();
    const matching = query ? bases.filter((base) => `${base.name} ${base.kind} ${String(base.data.challengeRating ?? "")}`.toLowerCase().includes(query)) : bases;
    const limited = matching.slice(0, 75);
    return selectedBase && !limited.some((base) => monsterBaseKey(base) === monsterBaseKey(selectedBase)) ? [selectedBase, ...limited] : limited;
  }, [baseQuery, bases, selectedBase]);

  const currentVariantDraft = selectedBase ? buildVariantDraft(identity, selectedBase, selectedTemplate, variantOverrides) : undefined;
  const currentVariantKey = currentVariantDraft ? stableKey(currentVariantDraft) : "";
  const currentTemplateKey = stableKey(templateDraft);

  function changeTemplateDraft(next: typeof templateDraft): void {
    setTemplateDraft(next);
    setTemplatePreviewKey("");
    setIssues([]);
  }

  function changeVariantOverrides(next: DndMonsterOverrides): void {
    setVariantOverrides(next);
    setVariantPreview(undefined);
    setVariantPreviewKey("");
    setIssues([]);
  }

  function resetTemplate(): void {
    setEditingTemplateId("");
    changeTemplateDraft(emptyTemplate);
    setConfirmDelete("");
  }

  async function previewTemplate(): Promise<void> {
    setPending("template-preview");
    setIssues([]);
    try {
      const result = await apiPost<{ preview: true; template: DndMonsterTemplate; warnings: DndMonsterIssue[] }>(`${monsterTemplatePath(campaignId)}/preview`, templateDraft);
      setTemplatePreviewKey(currentTemplateKey);
      setIssues(result.warnings);
      onStatus(`${result.template.name} template preview is ready.`);
    } catch (error) {
      setIssues(monsterIssues(error));
      onStatus(error instanceof Error ? error.message : "Monster template preview failed.");
    } finally {
      setPending("");
    }
  }

  async function saveTemplate(): Promise<void> {
    if (templatePreviewKey !== currentTemplateKey) {
      setIssues([{ path: "preview", code: "required", message: "Preview the current template fields before saving." }]);
      return;
    }
    const existing = templates.find((candidate) => candidate.template.id === editingTemplateId);
    setPending("template-save");
    try {
      const result = existing
        ? await apiPatch<TemplateResponse>(`${monsterTemplatePath(campaignId)}/${encodeURIComponent(existing.template.id)}`, { ...templateDraft, expectedUpdatedAt: existing.template.version }, { idempotencyKey: monsterIdempotencyKey("template-update") })
        : await apiPost<TemplateResponse>(monsterTemplatePath(campaignId), { ...templateDraft, expectedCampaignUpdatedAt: campaignRevision }, { idempotencyKey: monsterIdempotencyKey("template-create") });
      setTemplates((current) => [...current.filter((candidate) => candidate.template.id !== result.template.id), result].sort((left, right) => left.template.name.localeCompare(right.template.name)));
      setEditingTemplateId(result.template.id);
      setTemplateDraft({ name: result.template.name, description: result.template.description, overrides: structuredClone(result.template.overrides) });
      setTemplatePreviewKey("");
      if (result.campaignUpdatedAt) setCampaignRevision(result.campaignUpdatedAt);
      onCampaignMutation({ item: result.item, campaignUpdatedAt: result.campaignUpdatedAt });
      onStatus(`${result.template.name} template ${existing ? "updated" : "created"}.`);
    } catch (error) {
      setIssues(monsterIssues(error));
      onStatus(error instanceof Error ? error.message : "Monster template save failed.");
    } finally {
      setPending("");
    }
  }

  function editTemplate(record: TemplateResponse): void {
    setView("template");
    setEditingTemplateId(record.template.id);
    changeTemplateDraft({ name: record.template.name, description: record.template.description, overrides: structuredClone(record.template.overrides) });
    setConfirmDelete("");
  }

  async function deleteTemplate(record: TemplateResponse): Promise<void> {
    if (confirmDelete !== record.template.id) {
      setConfirmDelete(record.template.id);
      return;
    }
    setPending("template-delete");
    try {
      const result = await apiDelete<{ deleted: true; templateId: string; campaignUpdatedAt?: string }>(
        `${monsterTemplatePath(campaignId)}/${encodeURIComponent(record.template.id)}?expectedUpdatedAt=${encodeURIComponent(record.template.version)}`,
        { idempotencyKey: monsterIdempotencyKey("template-delete") }
      );
      setTemplates((current) => current.filter((candidate) => candidate.template.id !== result.templateId));
      setTemplateId((current) => current === result.templateId ? "" : current);
      if (result.campaignUpdatedAt) setCampaignRevision(result.campaignUpdatedAt);
      onCampaignMutation({ deletedItemId: result.templateId, campaignUpdatedAt: result.campaignUpdatedAt });
      onStatus(`${record.template.name} template deleted.`);
      if (editingTemplateId === result.templateId) resetTemplate();
    } catch (error) {
      setIssues(monsterIssues(error));
      onStatus(error instanceof Error ? error.message : "Monster template deletion failed.");
    } finally {
      setPending("");
      setConfirmDelete("");
    }
  }

  async function previewVariant(): Promise<void> {
    if (!currentVariantDraft) {
      setIssues([{ path: "base", code: "required", message: "Choose a bundled or campaign monster base." }]);
      return;
    }
    setPending("variant-preview");
    setIssues([]);
    try {
      const result = await apiPost<VariantResponse>(`${monsterVariantPath(campaignId)}/preview`, currentVariantDraft);
      setVariantPreview(result);
      setVariantPreviewKey(currentVariantKey);
      setIssues(result.warnings);
      onStatus(`${result.entry.name} variant preview is ready with ${result.diff.length} exact change${result.diff.length === 1 ? "" : "s"}.`);
    } catch (error) {
      setVariantPreview(undefined);
      setVariantPreviewKey("");
      setIssues(monsterIssues(error));
      onStatus(error instanceof Error ? error.message : "Monster variant preview failed.");
    } finally {
      setPending("");
    }
  }

  async function createVariant(): Promise<void> {
    if (!currentVariantDraft || variantPreviewKey !== currentVariantKey) {
      setIssues([{ path: "preview", code: "required", message: "Preview the current base, template, identity, and overrides before creating the variant." }]);
      return;
    }
    setPending("variant-save");
    try {
      const result = await apiPost<VariantResponse>(monsterVariantPath(campaignId), { ...currentVariantDraft, expectedCampaignUpdatedAt: campaignRevision }, { idempotencyKey: monsterIdempotencyKey("variant-create") });
      if (!result.item || !result.draft) throw new Error("The variant was created without its campaign item payload.");
      if (result.campaignUpdatedAt) setCampaignRevision(result.campaignUpdatedAt);
      onVariantCreated({ item: result.item, entry: result.entry, draft: result.draft, warnings: result.warnings, campaignUpdatedAt: result.campaignUpdatedAt });
      onCampaignMutation({ item: result.item, campaignUpdatedAt: result.campaignUpdatedAt });
      onStatus(`${result.entry.name} variant created. The reviewed base remains unchanged.`);
      setVariantPreview(undefined);
      setVariantPreviewKey("");
      setReload((value) => value + 1);
    } catch (error) {
      setIssues(monsterIssues(error));
      onStatus(error instanceof Error ? error.message : "Monster variant creation failed.");
    } finally {
      setPending("");
    }
  }

  return (
    <section className="proposal-card monster-workshop" aria-label="Monster variant workshop">
      <div className="operator-heading">
        <div>
          <div className="section-title">Monster workshop</div>
          <h4>Variants, scaling, and templates</h4>
          <p>Clone a bundled or campaign monster into a new immutable variant. Review exact changes first; combat changes require explicit CR and XP.</p>
        </div>
        <div className="row-actions" role="group" aria-label="Monster workshop view">
          <button className={view === "variant" ? "primary-button small" : "ghost-button small"} type="button" onClick={() => setView("variant")}>Create variant</button>
          <button className={view === "template" ? "primary-button small" : "ghost-button small"} type="button" onClick={() => setView("template")}>Manage templates</button>
        </div>
      </div>

      {loading && <p role="status">Loading monster bases and templates…</p>}
      {loadError && <div className="inline-error" role="alert"><p>{loadError}</p><button className="ghost-button small" type="button" onClick={() => setReload((value) => value + 1)}>Retry</button></div>}

      {!loading && !loadError && view === "template" && (
        <div className="custom-content-form">
          {templates.length === 0 ? <p className="empty-state compact">No reusable monster templates yet.</p> : (
            <div className="custom-content-list" role="list" aria-label="Monster templates">
              {templates.map((record) => <article className="operator-row" role="listitem" key={record.template.id}>
                <div><strong>{record.template.name}</strong><p>{record.template.description} · {Object.keys(record.template.overrides).length} override fields</p></div>
                <div className="row-actions">
                  <button className="ghost-button small" type="button" disabled={Boolean(pending)} onClick={() => editTemplate(record)}>Edit</button>
                  <button className={confirmDelete === record.template.id ? "danger-button small" : "ghost-button small"} type="button" disabled={Boolean(pending)} onClick={() => void deleteTemplate(record)}>{confirmDelete === record.template.id ? "Confirm delete" : "Delete"}</button>
                </div>
              </article>)}
            </div>
          )}
          <div className="form-grid two-column">
            <TextInput label="Template name" value={templateDraft.name} onChange={(name) => changeTemplateDraft({ ...templateDraft, name })} required />
            <TextInput label="Purpose" value={templateDraft.description} onChange={(description) => changeTemplateDraft({ ...templateDraft, description })} required />
          </div>
          <MonsterOverrideEditor legend="Reusable typed overrides" value={templateDraft.overrides} onChange={(overrides) => changeTemplateDraft({ ...templateDraft, overrides })} />
          <IssueList issues={issues} />
          <div className="row-actions">
            <button className="ghost-button" type="button" disabled={Boolean(pending)} onClick={resetTemplate}>New template</button>
            <button className="ghost-button" type="button" disabled={Boolean(pending)} onClick={() => void previewTemplate()}>{pending === "template-preview" ? "Previewing…" : "Preview template"}</button>
            <button className="primary-button" type="button" disabled={Boolean(pending) || templatePreviewKey !== currentTemplateKey} onClick={() => void saveTemplate()}>{pending === "template-save" ? "Saving…" : editingTemplateId ? "Save reviewed template" : "Create reviewed template"}</button>
          </div>
        </div>
      )}

      {!loading && !loadError && view === "variant" && (
        <div className="custom-content-form">
          <div className="form-grid two-column">
            <TextInput label="Find a base monster" value={baseQuery} onChange={setBaseQuery} placeholder="Name, source, or CR" />
            <SelectInput label="Immutable base" value={baseKey} onChange={(value) => { setBaseKey(value); setVariantPreview(undefined); setVariantPreviewKey(""); }} options={visibleBases.map((base) => ({ value: monsterBaseKey(base), label: `${base.name} · ${base.kind} · CR ${String(base.data.challengeRating ?? "—")}` }))} />
            <SelectInput label="Scaling template (optional)" value={templateId} onChange={(value) => { setTemplateId(value); setVariantPreview(undefined); setVariantPreviewKey(""); }} options={[{ value: "", label: "No template" }, ...templates.map((record) => ({ value: record.template.id, label: `${record.template.name} · ${Object.keys(record.template.overrides).length} fields` }))]} />
            <TextInput label="Variant name" value={identity.name} onChange={(name) => setIdentity({ ...identity, name })} required />
            <TextInput label="Summary" value={identity.summary} onChange={(summary) => setIdentity({ ...identity, summary })} required />
            <TextInput label="Source name" value={identity.sourceName} onChange={(sourceName) => setIdentity({ ...identity, sourceName })} required />
            <TextInput label="Source version" value={identity.sourceVersion} onChange={(sourceVersion) => setIdentity({ ...identity, sourceVersion })} required />
            <TextInput label="Content version" value={identity.contentVersion} onChange={(contentVersion) => setIdentity({ ...identity, contentVersion })} required />
            <SelectInput label="Usage declaration" value={identity.license.usage} onChange={(usage) => setIdentity({ ...identity, license: { ...identity.license, usage: usage as ContentImportLicense["usage"] } })} options={[{ value: "private_home_game", label: "Private home game" }, { value: "user_provided", label: "User provided" }, { value: "open", label: "Openly licensed" }]} />
            <TextInput label="License name" value={identity.license.name} onChange={(name) => setIdentity({ ...identity, license: { ...identity.license, name } })} required />
          </div>
          {selectedBase && <p className="empty-state compact">Base snapshot: <strong>{selectedBase.name}</strong> · {selectedBase.provenance.sourceName} {selectedBase.version}. Creating a variant never edits this record.</p>}
          <MonsterOverrideEditor legend="Variant-only typed overrides" value={variantOverrides} onChange={changeVariantOverrides} />
          <IssueList issues={issues} />
          {variantPreview && variantPreviewKey === currentVariantKey && <VariantReview preview={variantPreview} />}
          <div className="row-actions">
            <button className="ghost-button" type="button" disabled={Boolean(pending) || !selectedBase} onClick={() => void previewVariant()}>{pending === "variant-preview" ? "Previewing…" : "Preview exact changes"}</button>
            <button className="primary-button" type="button" disabled={Boolean(pending) || variantPreviewKey !== currentVariantKey} onClick={() => void createVariant()}>{pending === "variant-save" ? "Creating…" : "Create reviewed variant"}</button>
          </div>
        </div>
      )}
    </section>
  );
}

function MonsterOverrideEditor({ legend, value, onChange }: { legend: string; value: DndMonsterOverrides; onChange(value: DndMonsterOverrides): void }) {
  const set = (key: keyof DndMonsterOverrides, next: unknown) => {
    const copy = { ...value };
    if (next === undefined || next === "" || (Array.isArray(next) && next.length === 0) || (isObject(next) && Object.keys(next).length === 0)) delete copy[key];
    else Object.assign(copy, { [key]: next });
    onChange(copy);
  };
  return <fieldset><legend>{legend}</legend><div className="form-grid two-column">
    <SelectInput label="Size override" value={value.size ?? ""} onChange={(next) => set("size", next)} options={[{ value: "", label: "Keep base" }, ...["tiny", "small", "medium", "large", "huge", "gargantuan"].map((entry) => ({ value: entry, label: title(entry) }))]} />
    <TextInput label="Creature type override" value={value.creatureType ?? ""} onChange={(next) => set("creatureType", next)} placeholder="Keep base" />
    <TextInput label="Alignment override" value={value.alignment ?? ""} onChange={(next) => set("alignment", next)} placeholder="Keep base" />
    <OptionalNumber label="Armor Class override" value={value.armorClass} onChange={(next) => set("armorClass", next)} min={1} />
    <OptionalNumber label="Initiative override" value={value.initiative} onChange={(next) => set("initiative", next)} />
    <OptionalNumber label="Hit Points override" value={value.hitPoints} onChange={(next) => set("hitPoints", next)} min={1} />
    <TextInput label="Hit Dice override" value={value.hitDice ?? ""} onChange={(next) => set("hitDice", next)} placeholder="Keep base" />
    <TextInput label="Challenge Rating override" value={value.challengeRating ?? ""} onChange={(next) => set("challengeRating", next)} placeholder="Required with combat changes" />
    <OptionalNumber label="XP override" value={value.xp} onChange={(next) => set("xp", next)} min={0} placeholder="Required with combat changes" />
    <OptionalNumber label="Proficiency Bonus override" value={value.proficiencyBonus} onChange={(next) => set("proficiencyBonus", next)} min={1} />
    <TextAreaInput label="Speed map (one per line: mode: feet)" value={formatNumberMap(value.speed)} onChange={(next) => set("speed", parseNumberMap(next))} rows={3} />
    <TextAreaInput label="Ability scores (one per line: ability: score)" value={formatNumberMap(value.abilities)} onChange={(next) => set("abilities", parseNumberMap(next))} rows={6} />
    <TextAreaInput label="Saving throws (one per line: ability: bonus)" value={formatNumberMap(value.savingThrows)} onChange={(next) => set("savingThrows", parseNumberMap(next))} rows={4} />
    <TextAreaInput label="Skills (one per line: skill: bonus)" value={formatNumberMap(value.skills)} onChange={(next) => set("skills", parseNumberMap(next))} rows={4} />
    <TextAreaInput label="Senses (comma or line separated)" value={formatList(value.senses)} onChange={(next) => set("senses", parseList(next))} rows={3} />
    <TextAreaInput label="Languages (comma or line separated)" value={formatList(value.languages)} onChange={(next) => set("languages", parseList(next))} rows={3} />
    <TextAreaInput label="Gear (comma or line separated)" value={formatList(value.gear)} onChange={(next) => set("gear", parseList(next))} rows={3} />
    <TextAreaInput label="Traits (one per line: Name: Description)" value={formatNamed(value.traits)} onChange={(next) => set("traits", parseNamedFeatures(next))} rows={4} />
    <TextAreaInput label="Reactions (one per line: Name: Description)" value={formatNamed(value.reactions)} onChange={(next) => set("reactions", parseNamedFeatures(next))} rows={4} />
    <TextAreaInput label="Legendary actions (one per line: Name: Description)" value={formatNamed(value.legendaryActions)} onChange={(next) => set("legendaryActions", parseNamedFeatures(next))} rows={4} />
    <TextAreaInput label="Actions (pipe-delimited typed rows)" value={formatMonsterActions(value.actions)} onChange={(next) => set("actions", parseMonsterActions(next))} rows={6} help="Name | kind | attack | damage | type | range | recharge | condition | save ability | save DC | save result | summary | effects" />
    <TextAreaInput label="Manual adjudication notes" value={value.manualAdjudication ?? ""} onChange={(next) => set("manualAdjudication", next)} rows={4} />
  </div></fieldset>;
}

function VariantReview({ preview }: { preview: VariantResponse }) {
  return <article className="proposal-card" aria-label="Monster variant exact diff">
    <strong>{preview.entry.name}: reviewed change set</strong>
    <p>{preview.diff.length} exact field change{preview.diff.length === 1 ? "" : "s"}; CR and XP are never inferred.</p>
    {preview.diff.length === 0 ? <p>No fields differ from the selected base.</p> : <div className="table-wrap"><table><thead><tr><th>Field</th><th>Base</th><th>Variant</th></tr></thead><tbody>{preview.diff.map((change) => <tr key={change.path}><td><code>{change.path}</code></td><td>{displayValue(change.before)}</td><td>{displayValue(change.after)}</td></tr>)}</tbody></table></div>}
    {preview.warnings.length > 0 && <ul>{preview.warnings.map((warning, index) => <li key={`${warning.code}:${index}`}>{warning.message}</li>)}</ul>}
  </article>;
}

function IssueList({ issues }: { issues: DndMonsterIssue[] }) {
  return issues.length > 0 ? <div className="inline-error" role="alert"><strong>Review these fields</strong><ul>{issues.map((entry, index) => <li key={`${entry.path}:${entry.code}:${index}`}><code>{entry.path}</code>: {entry.message}</li>)}</ul></div> : null;
}

function TextInput({ label, value, onChange, required = false, placeholder }: { label: string; value: string; onChange(value: string): void; required?: boolean; placeholder?: string }) {
  return <label className="compact-field"><span>{label}</span><input value={value} required={required} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>;
}

function OptionalNumber({ label, value, onChange, min, placeholder }: { label: string; value?: number; onChange(value?: number): void; min?: number; placeholder?: string }) {
  return <label className="compact-field"><span>{label}</span><input type="number" value={value ?? ""} min={min} placeholder={placeholder} onChange={(event) => onChange(event.target.value === "" ? undefined : Number(event.target.value))} /></label>;
}

function SelectInput({ label, value, onChange, options }: { label: string; value: string; onChange(value: string): void; options: Array<{ value: string; label: string }> }) {
  return <label className="compact-field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option.value || "none"} value={option.value}>{option.label}</option>)}</select></label>;
}

function TextAreaInput({ label, value, onChange, rows, help }: { label: string; value: string; onChange(value: string): void; rows: number; help?: string }) {
  return <label className="compact-field"><span>{label}</span>{help && <small>{help}</small>}<textarea value={value} rows={rows} onChange={(event) => onChange(event.target.value)} /></label>;
}

interface VariantIdentity {
  name: string;
  summary: string;
  sourceName: string;
  sourceVersion: string;
  contentVersion: string;
  license: ContentImportLicense;
}

const defaultVariantIdentity: VariantIdentity = {
  name: "",
  summary: "",
  sourceName: "Campaign homebrew",
  sourceVersion: "1",
  contentVersion: "1.0.0",
  license: { name: "Private home game", usage: "private_home_game" as const }
};

function buildVariantDraft(identity: VariantIdentity, base: DndMonsterBase, template: DndMonsterTemplate | undefined, overrides: DndMonsterOverrides): DndMonsterVariantDraft {
  return {
    ...identity,
    license: { ...identity.license },
    base: { kind: base.kind, id: base.id, version: base.version },
    ...(template ? { template: { id: template.id, version: template.version } } : {}),
    overrides: structuredClone(overrides)
  };
}

export function monsterTemplatePath(campaignId: string): string {
  return `/api/v1/campaigns/${encodeURIComponent(campaignId)}/dnd/monster-templates`;
}

export function monsterBasePath(campaignId: string): string {
  return `/api/v1/campaigns/${encodeURIComponent(campaignId)}/dnd/monster-bases`;
}

export function monsterVariantPath(campaignId: string): string {
  return `/api/v1/campaigns/${encodeURIComponent(campaignId)}/dnd/monster-variants`;
}

export function parseNumberMap(value: string): Record<string, number> {
  return Object.fromEntries(value.split(/\r?\n|,/).flatMap((line) => {
    const separator = line.lastIndexOf(":");
    if (separator < 1) return [];
    const key = line.slice(0, separator).trim().toLowerCase().replaceAll(" ", "-");
    const number = Number(line.slice(separator + 1).trim());
    return key && Number.isFinite(number) ? [[key, number] as const] : [];
  }));
}

export function parseNamedFeatures(value: string): DndMonsterNamedFeature[] {
  return value.split(/\r?\n/).flatMap((line) => {
    const separator = line.indexOf(":");
    const name = line.slice(0, separator).trim();
    const description = separator >= 0 ? line.slice(separator + 1).trim() : "";
    return name && description ? [{ name, description }] : [];
  });
}

export function parseMonsterActions(value: string): DndMonsterActionOverride[] {
  return value.split(/\r?\n/).flatMap((line) => {
    const [name, rawKind, rawAttack, damageFormula, damageType, range, recharge, condition, saveAbility, rawSaveDc, saveSuccess, description, rawEffects] = line.split("|").map((part) => part.trim());
    if (!name || !description) return [];
    const attackBonus = rawAttack === "" ? undefined : Number(rawAttack);
    const saveDc = rawSaveDc === "" ? undefined : Number(rawSaveDc);
    const kind = rawKind === "bonusAction" || rawKind === "reaction" ? rawKind : "action";
    return [{
      name,
      description,
      kind,
      ...(attackBonus !== undefined && Number.isFinite(attackBonus) ? { attackBonus } : {}),
      ...(damageFormula ? { damageFormula } : {}),
      ...(damageType ? { damageType } : {}),
      ...(range ? { range } : {}),
      ...(recharge ? { recharge } : {}),
      ...(condition ? { condition } : {}),
      ...(saveAbility && saveDc !== undefined && Number.isFinite(saveDc) ? { save: { ability: saveAbility, dc: saveDc, ...(saveSuccess ? { success: saveSuccess } : {}) } } : {}),
      ...(rawEffects ? { effects: parseList(rawEffects) } : {})
    }];
  });
}

function formatMonsterActions(value: DndMonsterActionOverride[] | undefined): string {
  return (value ?? []).map((action) => [action.name, action.kind ?? "action", action.attackBonus ?? "", action.damageFormula ?? "", action.damageType ?? "", action.range ?? "", action.recharge ?? "", action.condition ?? "", action.save?.ability ?? "", action.save?.dc ?? "", action.save?.success ?? "", action.description, (action.effects ?? []).join(", ")].join(" | ")).join("\n");
}

function formatNumberMap(value: Record<string, number> | undefined): string {
  return Object.entries(value ?? {}).map(([key, number]) => `${key}: ${number}`).join("\n");
}

function parseList(value: string): string[] {
  return [...new Set(value.split(/,|\r?\n/).map((part) => part.trim()).filter(Boolean))];
}

function formatList(value: string[] | undefined): string {
  return (value ?? []).join(", ");
}

function formatNamed(value: DndMonsterNamedFeature[] | undefined): string {
  return (value ?? []).map((entry) => `${entry.name}: ${entry.description}`).join("\n");
}

function monsterBaseKey(base: Pick<DndMonsterBase, "kind" | "id"> | undefined): string {
  return base ? `${base.kind}:${base.id}` : "";
}

function stableKey(value: unknown): string {
  return JSON.stringify(value);
}

function monsterIdempotencyKey(operation: string): string {
  const nonce = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `dnd-monster-${operation}-${nonce}`;
}

function monsterIssues(error: unknown): DndMonsterIssue[] {
  if (error instanceof ApiError) {
    const body = isObject(error.body) ? error.body : {};
    if (!Array.isArray(body.issues)) return [{ path: "request", code: "request_failed", message: error.message }];
    return body.issues.flatMap((value) => {
      if (!isObject(value) || typeof value.path !== "string" || typeof value.code !== "string" || typeof value.message !== "string") return [];
      return [{ path: value.path, code: value.code, message: value.message }];
    });
  }
  return [{ path: "request", code: "request_failed", message: error instanceof Error ? error.message : "Request failed." }];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function title(value: string): string {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayValue(value: unknown): string {
  if (value === undefined) return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}
