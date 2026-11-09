import type { Actor, Campaign, DeclarativeSystemManifest, EngineState, SystemInstallation, SystemManifestIdentity } from "@open-tabletop/core";
import { createDeclarativeSystemRuntime, declarativeSystemManifestChecksum } from "./declarative-system-runtime.js";
import { resolvePinnedDeclarativeSystem } from "./declarative-system-state.js";

type SystemState = Pick<EngineState, "campaigns" | "actors" | "items" | "systemInstallations">;

/** A retained binding also identifies an executable system if its package is missing. */
export function isDeclarativeSystem(state: SystemState, systemId: string): boolean {
  return state.systemInstallations.some((entry) => entry.manifest.id === systemId && Object.hasOwn(entry.manifest, "definition"))
    || state.campaigns.some((campaign) => campaign.systemBindings?.some((binding) => binding.systemId === systemId));
}

export function installedDeclarativeIdentity(installation: SystemInstallation): SystemManifestIdentity {
  const manifest = structuredClone(installation.manifest) as DeclarativeSystemManifest;
  const checksum = declarativeSystemManifestChecksum(manifest);
  if (installation.checksum !== checksum) throw new Error("Installed system checksum does not match its immutable definition");
  return { systemId: manifest.id, version: manifest.version, checksum };
}

export function sameSystemIdentity(left: SystemManifestIdentity | undefined | null, right: SystemManifestIdentity | undefined | null): boolean {
  return (left == null && right == null) || Boolean(left && right && left.systemId === right.systemId && left.version === right.version && left.checksum === right.checksum);
}

/** A newly created campaign chooses the same explicit catalog version as its default. */
export function initialDeclarativeBinding(state: SystemState, systemId: string, version: string): SystemManifestIdentity[] | undefined {
  const installation = state.systemInstallations.find((entry) => entry.manifest.id === systemId && entry.manifest.version === version);
  return installation && Object.hasOwn(installation.manifest, "definition") ? [installedDeclarativeIdentity(installation)] : undefined;
}

export function declarativeRuntimeForActor(state: SystemState, actor: Actor) {
  const { manifest, identity } = resolvePinnedDeclarativeSystem(state, actor.campaignId, actor.systemId);
  return createDeclarativeSystemRuntime(manifest, { campaignId: actor.campaignId, ...identity });
}

/** Version switches invalidate drafts even when their field values remain compatible. */
export function advanceDeclarativeBindingRevisions(state: SystemState, campaign: Campaign, systemId: string, revision: (previous: string) => string, previous?: SystemState): void {
  const advance = (current: string, prior?: string): string => revision(prior && Date.parse(prior) > Date.parse(current) ? prior : current);
  const priorCampaign = previous?.campaigns.find((entry) => entry.id === campaign.id);
  const updatedCampaign = { ...campaign, updatedAt: advance(campaign.updatedAt, priorCampaign?.updatedAt) };
  state.campaigns = state.campaigns.map((entry) => entry.id === campaign.id ? updatedCampaign : entry);
  const priorActors = new Map(previous?.actors.map((entry) => [entry.id, entry]) ?? []);
  const priorItems = new Map(previous?.items.map((entry) => [entry.id, entry]) ?? []);
  // Archive candidates can share unaffected collections with live state. Replace
  // affected records instead of mutating those shared objects before acceptance.
  state.actors = state.actors.map((actor) => actor.campaignId === campaign.id && actor.systemId === systemId ? { ...actor, updatedAt: advance(actor.updatedAt, priorActors.get(actor.id)?.updatedAt) } : actor);
  state.items = state.items.map((item) => item.campaignId === campaign.id && item.systemId === systemId ? { ...item, updatedAt: advance(item.updatedAt, priorItems.get(item.id)?.updatedAt) } : item);
}

export function advanceImportedDeclarativeBindingRevisions(previous: SystemState, candidate: SystemState, revision: (previous: string) => string): void {
  for (const campaign of candidate.campaigns) {
    const before = previous.campaigns.find((entry) => entry.id === campaign.id);
    if (!before) continue;
    const ids = new Set([...(before.systemBindings ?? []), ...(campaign.systemBindings ?? [])].map((entry) => entry.systemId));
    for (const systemId of ids) {
      if (sameSystemIdentity(before.systemBindings?.find((entry) => entry.systemId === systemId), campaign.systemBindings?.find((entry) => entry.systemId === systemId))) continue;
      const current = candidate.campaigns.find((entry) => entry.id === campaign.id)!;
      advanceDeclarativeBindingRevisions(candidate, current, systemId, revision, previous);
    }
  }
}
