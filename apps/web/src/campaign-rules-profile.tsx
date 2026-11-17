import type { Campaign, CampaignRulesProfile } from "@open-tabletop/core";
import { Check, Plus, RefreshCw, Settings2, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, apiPatch } from "./api.js";
import { errorMessage, titleCaseLabel } from "./sheet-format.js";
import { isStaleWriteError, staleDraftPreservedMessage } from "./shared-mutation.js";

export interface CampaignRuleToggleDefinition {
  key: string;
  label: string;
  description: string;
  support: "automated" | "table_ruling";
}

export const campaignRuleToggleDefinitions: CampaignRuleToggleDefinition[] = [
  { key: "initiative.surprise", label: "Surprise initiative", description: "Surprised NPCs roll initiative with disadvantage when the combat setup marks them Surprised.", support: "automated" },
  { key: "combat.flanking", label: "Flanking grants Advantage", description: "Records the table's flanking ruling for players and DMs; attacks remain DM-reviewed.", support: "table_ruling" },
  { key: "rest.gritty", label: "Gritty recovery pacing", description: "Records an alternate rest cadence without silently changing recovery automation.", support: "table_ruling" },
  { key: "advancement.milestone", label: "Milestone advancement", description: "Marks this campaign as milestone-led while preserving XP records and DM control.", support: "table_ruling" },
  { key: "death.hidden-saves", label: "Hidden death saves", description: "Records the table's visibility preference; the combat panel continues to respect server permissions.", support: "table_ruling" }
];

export const defaultCampaignRulesProfile: CampaignRulesProfile = {
  profileId: "dnd-5e-2024-standard",
  rulesVersion: "SRD 5.2.1",
  toggles: Object.fromEntries(campaignRuleToggleDefinitions.map((definition) => [definition.key, definition.key === "initiative.surprise"]))
};

export function resolvedCampaignRulesProfile(campaign: Pick<Campaign, "rulesProfile">): CampaignRulesProfile {
  return campaign.rulesProfile
    ? { ...campaign.rulesProfile, toggles: { ...campaign.rulesProfile.toggles } }
    : { ...defaultCampaignRulesProfile, toggles: { ...defaultCampaignRulesProfile.toggles } };
}

export function campaignSurpriseEnabled(campaign: Pick<Campaign, "rulesProfile">): boolean {
  return resolvedCampaignRulesProfile(campaign).toggles["initiative.surprise"] === true;
}

export function campaignRulesSaveError(failure: unknown): string {
  if (failure instanceof ApiError && failure.status === 403) return "You no longer have permission to change campaign rules. Ask a campaign manager to review this profile.";
  if (failure instanceof ApiError && failure.status === 409) return `${failure.message} The latest campaign state is being kept; reload and review before retrying.`;
  return errorMessage(failure);
}

export function saveCampaignRulesProfile(campaign: Campaign, rulesProfile: CampaignRulesProfile, idempotencyKey: string): Promise<Campaign> {
  return apiPatch<Campaign>(`/api/v1/campaigns/${campaign.id}`, {
    expectedUpdatedAt: campaign.updatedAt,
    rulesProfile
  }, { idempotencyKey });
}

export function CampaignRulesProfilePanel(props: { campaign: Campaign; onSaved(campaign: Campaign): void; onRefresh(): Promise<void> }) {
  const [draft, setDraft] = useState<CampaignRulesProfile>(() => resolvedCampaignRulesProfile(props.campaign));
  const [customKey, setCustomKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const attemptRef = useRef<{ fingerprint: string; idempotencyKey: string } | undefined>(undefined);
  const preserveDraftAcrossRevisionRef = useRef(false);
  const campaignIdRef = useRef(props.campaign.id);
  const knownKeys = useMemo(() => new Set(campaignRuleToggleDefinitions.map((definition) => definition.key)), []);
  const customEntries = Object.entries(draft.toggles).filter(([key]) => !knownKeys.has(key)).sort(([left], [right]) => left.localeCompare(right));

  useEffect(() => {
    if (campaignIdRef.current !== props.campaign.id) {
      campaignIdRef.current = props.campaign.id;
      preserveDraftAcrossRevisionRef.current = false;
    } else if (preserveDraftAcrossRevisionRef.current) {
      preserveDraftAcrossRevisionRef.current = false;
      attemptRef.current = undefined;
      return;
    }
    setDraft(resolvedCampaignRulesProfile(props.campaign));
    setFailure("");
    setNotice("");
    attemptRef.current = undefined;
  }, [props.campaign.id, props.campaign.updatedAt]);

  const setToggle = (key: string, enabled: boolean) => {
    setDraft((current) => ({ ...current, toggles: { ...current.toggles, [key]: enabled } }));
    setFailure("");
    setNotice("");
  };

  const addCustomToggle = () => {
    const key = customKey.trim();
    if (!/^[a-z0-9][a-z0-9_.-]{0,79}$/i.test(key)) {
      setFailure("Custom rule keys must be 1-80 letters, numbers, dots, underscores, or hyphens.");
      return;
    }
    setToggle(key, true);
    setCustomKey("");
  };

  async function save() {
    const fingerprint = JSON.stringify({ campaignUpdatedAt: props.campaign.updatedAt, draft });
    if (attemptRef.current?.fingerprint !== fingerprint) {
      attemptRef.current = { fingerprint, idempotencyKey: `campaign-rules:${props.campaign.id}:${globalThis.crypto.randomUUID()}` };
    }
    setBusy(true);
    setFailure("");
    setNotice("");
    try {
      const updated = await saveCampaignRulesProfile(props.campaign, draft, attemptRef.current.idempotencyKey);
      attemptRef.current = undefined;
      props.onSaved(updated);
      setNotice("Campaign rules profile saved. Automated and table-ruling-only choices remain clearly separated.");
    } catch (error) {
      if (isStaleWriteError(error)) {
        preserveDraftAcrossRevisionRef.current = true;
        await props.onRefresh();
        setFailure(staleDraftPreservedMessage);
      } else {
        setFailure(campaignRulesSaveError(error));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="account-box campaign-rules-profile" aria-labelledby="campaign-rules-title" aria-busy={busy}>
      <div className="operator-heading">
        <div><div className="section-title">Table rules</div><h2 id="campaign-rules-title">Campaign rules profile</h2></div>
        <Settings2 size={18} aria-hidden="true" />
      </div>
      <div className="campaign-rules-identity">
        <label><span>Profile</span><input aria-label="Campaign rules profile name" value={draft.profileId} disabled={busy} onChange={(event) => setDraft((current) => ({ ...current, profileId: event.target.value }))} /></label>
        <label><span>Rules version</span><input aria-label="Campaign rules version" value={draft.rulesVersion} disabled={busy} onChange={(event) => setDraft((current) => ({ ...current, rulesVersion: event.target.value }))} /></label>
      </div>
      <p className="account-summary">Automated toggles change supported rules paths. Table rulings are persisted and visible without pretending the engine enforces them.</p>
      <div className="campaign-rule-list">
        {campaignRuleToggleDefinitions.map((definition) => (
          <label className="campaign-rule-row" key={definition.key}>
            <input type="checkbox" checked={draft.toggles[definition.key] === true} disabled={busy} onChange={(event) => setToggle(definition.key, event.target.checked)} />
            <span><strong>{definition.label}</strong><small>{definition.description}</small></span>
            <em className={definition.support === "automated" ? "status-pill active" : "status-pill"}>{definition.support === "automated" ? "Automated" : "Table ruling"}</em>
          </label>
        ))}
        {customEntries.map(([key, enabled]) => (
          <div className="campaign-rule-row custom" key={key}>
            <label className="inline-check"><input type="checkbox" checked={enabled} disabled={busy} onChange={(event) => setToggle(key, event.target.checked)} /><span><strong>{titleCaseLabel(key)}</strong><small>{key} - custom table ruling</small></span></label>
            <button className="icon-button" type="button" disabled={busy} aria-label={`Remove custom rule ${key}`} onClick={() => setDraft((current) => {
              const toggles = { ...current.toggles };
              delete toggles[key];
              return { ...current, toggles };
            })}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
      <div className="campaign-custom-rule">
        <input aria-label="Custom campaign rule key" placeholder="custom.rule-key" value={customKey} disabled={busy} onChange={(event) => setCustomKey(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCustomToggle(); } }} />
        <button className="ghost-button small" type="button" disabled={busy || !customKey.trim()} onClick={addCustomToggle}><Plus size={14} /> Add table ruling</button>
      </div>
      {failure && <div className="inline-error" role="alert"><strong>Rules were not saved.</strong><span>{failure}</span><button className="ghost-button small" type="button" disabled={busy} onClick={() => void save()}><RefreshCw size={13} /> Retry</button></div>}
      {notice && <p className="panel-success" role="status">{notice}</p>}
      <button className="primary-button wide" type="button" disabled={busy || !draft.profileId.trim() || !draft.rulesVersion.trim()} onClick={() => void save()}>{busy ? <RefreshCw className="spin" size={15} /> : <Check size={15} />} {busy ? "Saving rules..." : "Save campaign rules"}</button>
    </section>
  );
}
