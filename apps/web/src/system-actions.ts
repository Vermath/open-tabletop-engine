import type { Campaign, SystemManifestIdentity } from "@open-tabletop/core";
import type { SystemRuntimeInfo } from "./api.js";
import { sharedMutationIdempotencyKey } from "./shared-mutation.js";

type CampaignRevision = Pick<Campaign, "id" | "updatedAt">;

export function prepareSystemManifestInstall(campaignId: string, manifestJson: string, attemptId: string) {
  const manifest: unknown = JSON.parse(manifestJson);
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw new Error("Enter a rules manifest JSON object.");
  const payload = { campaignId, manifest };
  return { path: "/api/v1/systems/install", payload, idempotencyKey: sharedMutationIdempotencyKey(`system-register:${campaignId}:${attemptId}`, "", payload) };
}

export function prepareSystemBinding(campaign: CampaignRevision, system: SystemRuntimeInfo, identity: SystemManifestIdentity) {
  if (system.definition?.kind !== "declarative-v1" || !system.installedVersions?.some((version) => version.systemId === system.id && version.version === identity.version && version.checksum === identity.checksum) || identity.systemId !== system.id) throw new Error("Choose an installed version of this rules system.");
  const payload = { expectedUpdatedAt: campaign.updatedAt, system: { ...identity }, expectedBinding: system.binding ? { ...system.binding } : null };
  return { path: `/api/v1/campaigns/${encodeURIComponent(campaign.id)}/systems/${encodeURIComponent(system.id)}/binding`, payload, idempotencyKey: sharedMutationIdempotencyKey(`system-binding:${campaign.id}:${system.id}`, campaign.updatedAt, payload) };
}

export function prepareSystemActivation(campaign: CampaignRevision, system: SystemRuntimeInfo) {
  if (system.definition?.kind === "declarative-v1" && !system.binding) throw new Error("Bind an installed version before activating this rules system.");
  const payload = { expectedUpdatedAt: campaign.updatedAt };
  return { path: `/api/v1/campaigns/${encodeURIComponent(campaign.id)}/systems/${encodeURIComponent(system.id)}/install`, payload, idempotencyKey: sharedMutationIdempotencyKey(`system-activate:${campaign.id}:${system.id}`, campaign.updatedAt, payload) };
}

export function prepareDeclarativeCharacter(campaignId: string, system: SystemRuntimeInfo, name: string, ownerUserId: string, attemptId: string) {
  if (system.definition?.kind !== "declarative-v1" || system.binding?.systemId !== system.id) throw new Error("Bind an installed rules version before creating a character.");
  if (!name.trim()) throw new Error("Enter a character name.");
  const payload = { systemId: system.id, name: name.trim(), ...(ownerUserId ? { ownerUserId } : {}) };
  return { path: `/api/v1/campaigns/${encodeURIComponent(campaignId)}/actors`, payload, idempotencyKey: sharedMutationIdempotencyKey(`declarative-character:${campaignId}:${attemptId}`, "", payload) };
}

export type AdvancementOptionInfo = {
  id: string;
  systemId: string;
  name: string;
  summary: string;
  nextValue: number;
};


export function systemRollId(systemId: string): string | undefined {
  if (systemId === "stellar-frontiers") return "aptitude-tech";
  if (systemId === "mystic-noir") return "skill-investigation";
  if (systemId === "dnd-5e-srd") return "ability-strength";
  return systemId === "generic-fantasy" ? "ability-charisma" : undefined;
}


export function systemRollLabel(systemId?: string): string {
  if (systemId === "stellar-frontiers") return "Tech Check";
  if (systemId === "mystic-noir") return "Investigation Check";
  if (systemId === "dnd-5e-srd") return "Strength Check";
  return systemId === "generic-fantasy" ? "Charisma Check" : "Open character sheet";
}


export function systemAdvancementOptionId(systemId: string): string {
  if (systemId === "stellar-frontiers") return "rank-up";
  if (systemId === "mystic-noir") return "case-breakthrough";
  return "level-up";
}


export function systemAdvancementLabel(systemId?: string): string {
  if (systemId === "stellar-frontiers") return "Advance Rank";
  if (systemId === "mystic-noir") return "Case Breakthrough";
  return "Level Up";
}


export function systemEncounterThreatId(systemId: string): string {
  if (systemId === "stellar-frontiers") return "void-raider";
  if (systemId === "mystic-noir") return "masked-agent";
  if (systemId === "dnd-5e-srd") return "goblin-minion";
  return "skeletal-guard";
}
