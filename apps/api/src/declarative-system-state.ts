import { isDeepStrictEqual } from "node:util";
import type { Actor, Campaign, DeclarativeSystemManifest, DeclarativeValidationIssue, EngineState, Item, SystemInstallation, SystemManifestIdentity } from "@open-tabletop/core";
import { validateDeclarativeSystemData } from "@open-tabletop/system-sdk";
import { declarativeSystemManifestChecksum, DeclarativeRuntimeError } from "./declarative-system-runtime.js";

export type DeclarativeSystemState = Pick<EngineState, "campaigns" | "actors" | "items" | "systemInstallations">;
export type DeclarativeStateCollection = keyof DeclarativeSystemState;

export interface DeclarativeStateRecordChange {
  collection: DeclarativeStateCollection;
  id: string;
  beforeJson?: string;
  afterJson?: string;
}

export type DeclarativeSystemStateIssue = DeclarativeValidationIssue & {
  collection: DeclarativeStateCollection;
  recordId: string;
  systemId?: string;
};

export class DeclarativeSystemStateError extends Error {
  readonly statusCode = 422;
  readonly issues: readonly DeclarativeSystemStateIssue[];

  constructor(issues: readonly DeclarativeSystemStateIssue[]) {
    super(issues[0]?.message ?? "Declarative system state is invalid.");
    this.name = "DeclarativeSystemStateError";
    this.issues = issues.slice(0, 32).map((issue) => ({
      ...issue,
      recordId: issue.recordId.slice(0, 200),
      ...(issue.systemId === undefined ? {} : { systemId: issue.systemId.slice(0, 200) }),
      code: issue.code.slice(0, 128),
      path: issue.path.slice(0, 20).map((part) => part.slice(0, 128)),
      message: issue.message.slice(0, 512),
    }));
  }
}

type ResolvedSystem = { manifest: DeclarativeSystemManifest; identity: SystemManifestIdentity };
const collections = ["campaigns", "actors", "items", "systemInstallations"] as const;

/** Resolve the exact durable campaign pin; never select the latest version. */
export function resolvePinnedDeclarativeSystem(state: DeclarativeSystemState, campaignId: string, systemId: string): ResolvedSystem {
  return new StateValidation(state).resolve(campaignId, systemId);
}

/** Validate one detached proposed actor/item before assigning it to live state. */
export function assertDeclarativeSystemRecord(state: DeclarativeSystemState, collection: "actors" | "items", record: Actor | Item): void {
  new StateValidation(state).record(collection, record);
}

/** Validate a normalized initial load before it becomes an accepted baseline. */
export function assertDeclarativeSystemState(state: DeclarativeSystemState): void {
  const validation = new StateValidation(state);
  for (const installation of state.systemInstallations) {
    if (hasExecutableMarker(installation.manifest)) validation.installation(installation);
  }
  for (const campaign of state.campaigns) {
    for (const binding of validation.bindings(campaign)) validation.resolve(campaign.id, binding.systemId);
    validation.campaignDefault(campaign);
  }
  for (const collection of ["actors", "items"] as const) {
    for (const record of state[collection]) validation.record(collection, record);
  }
}

/** Preflight a detached candidate without accepting or changing either state. */
export function assertDeclarativeSystemStateCandidate(previous: DeclarativeSystemState, candidate: DeclarativeSystemState): void {
  const changes: DeclarativeStateRecordChange[] = [];
  for (const collection of collections) {
    const before = new Map(previous[collection].map((record) => [record.id, record] as const));
    for (const record of candidate[collection]) {
      const old = before.get(record.id);
      if (!isDeepStrictEqual(old, record)) changes.push({ collection, id: record.id, ...(old === undefined ? {} : { beforeJson: recordJson(collection, old) }), afterJson: recordJson(collection, record) });
      before.delete(record.id);
    }
    for (const record of before.values()) changes.push({ collection, id: record.id, beforeJson: recordJson(collection, record) });
  }
  validateChanges(candidate, changes, false, previous);
}

/** Consume existing persistence bytes, without another full record serialization. */
export function assertDeclarativeSystemStateCommit(candidate: DeclarativeSystemState, changes: readonly DeclarativeStateRecordChange[]): void {
  validateChanges(candidate, changes, true);
}

function validateChanges(candidate: DeclarativeSystemState, changes: readonly DeclarativeStateRecordChange[], serialized: boolean, previous?: DeclarativeSystemState): void {
  if (!changes.length) return;
  const previousExecutableIds = new Set<string>();
  const affectedDefinitions = new Map<string, Set<string>>();
  const affectedCampaigns = new Map<string, Set<string>>();
  const affectedDefaults = new Set<string>();
  const changedRecords = new Set<string>();
  const validation = new StateValidation(candidate, previousExecutableIds);
  const affectDefinition = (installation: SystemInstallation | undefined): void => {
    if (!installation || !hasExecutableMarker(installation.manifest)) return;
    const { id, version } = installation.manifest;
    const versions = affectedDefinitions.get(id) ?? new Set<string>();
    versions.add(version);
    affectedDefinitions.set(id, versions);
  };

  for (const change of changes) {
    if (change.collection === "actors" || change.collection === "items") {
      if (change.afterJson !== undefined) changedRecords.add(recordKey(change.collection, change.id));
      continue;
    }
    const before = change.beforeJson === undefined ? undefined : JSON.parse(change.beforeJson);
    const after = change.afterJson === undefined ? undefined : JSON.parse(change.afterJson);
    if (change.collection === "systemInstallations") {
      const prior = before as SystemInstallation | undefined;
      const next = after === undefined ? undefined : candidate.systemInstallations.find((record) => record.id === change.id);
      if (prior && hasExecutableMarker(prior.manifest)) {
        previousExecutableIds.add(prior.manifest.id);
        for (const retained of candidate.systemInstallations) {
          if (retained.manifest.id === prior.manifest.id && retained.manifest.version === prior.manifest.version
            && (!isDeepStrictEqual(prior.manifest, retained.manifest) || prior.checksum !== retained.checksum)) {
            fail("systemInstallations", retained.id, prior.manifest.id, ["manifest"], "immutable_definition", "An accepted executable system ID and version cannot be replaced with different content or checksum.");
          }
        }
      }
      if (next && hasExecutableMarker(next.manifest)) validation.installation(next);
      if (!isDeepStrictEqual(prior?.manifest, next?.manifest) || prior?.checksum !== next?.checksum) {
        affectDefinition(prior);
        affectDefinition(next);
      }
    } else if (change.collection === "campaigns") {
      const oldBindings = before === undefined ? [] : validation.bindings(before as Campaign);
      const nextCampaign = after === undefined ? undefined : candidate.campaigns.find((record) => record.id === change.id);
      const nextBindings = nextCampaign === undefined ? [] : validation.bindings(nextCampaign);
      if (nextCampaign && (before === undefined || before.defaultSystemId !== nextCampaign.defaultSystemId)) affectedDefaults.add(nextCampaign.id);
      const systems = new Set([...oldBindings, ...nextBindings].map((binding) => binding.systemId));
      for (const systemId of systems) {
        const old = oldBindings.find((binding) => binding.systemId === systemId);
        const next = nextBindings.find((binding) => binding.systemId === systemId);
        if (isDeepStrictEqual(old, next)) continue;
        const affected = affectedCampaigns.get(change.id) ?? new Set<string>();
        affected.add(systemId);
        affectedCampaigns.set(change.id, affected);
        if (nextCampaign?.defaultSystemId === systemId) affectedDefaults.add(nextCampaign.id);
        if (next) validation.resolve(change.id, systemId);
        if (old) previousExecutableIds.add(systemId);
      }
    }
  }

  // Definition changes also invalidate empty-campaign pins. Unrelated installed
  // versions do not fan out to actors already pinned to a different version.
  if (affectedDefinitions.size) {
    for (const campaign of candidate.campaigns) {
      const bindings = validation.bindings(campaign);
      for (const binding of bindings) {
        if (affectedDefinitions.get(binding.systemId)?.has(binding.version)) validation.resolve(campaign.id, binding.systemId);
      }
      const defaultVersions = affectedDefinitions.get(campaign.defaultSystemId);
      const defaultBinding = bindings.find((binding) => binding.systemId === campaign.defaultSystemId);
      if (defaultVersions && (!defaultBinding || defaultVersions.has(defaultBinding.version))) affectedDefaults.add(campaign.id);
    }
  }
  for (const campaignId of affectedDefaults) {
    const campaign = candidate.campaigns.find((record) => record.id === campaignId);
    if (campaign) validation.campaignDefault(campaign);
  }
  if (!changedRecords.size && !affectedCampaigns.size && !affectedDefinitions.size) return;
  for (const collection of ["actors", "items"] as const) {
    let retainedRecords: Set<Actor | Item> | undefined;
    for (const record of candidate[collection]) {
      const changed = changedRecords.has(recordKey(collection, record.id));
      let affected = affectedCampaigns.get(record.campaignId)?.has(record.systemId) ?? false;
      const versions = affectedDefinitions.get(record.systemId);
      if (versions) {
        const campaign = candidate.campaigns.find((entry) => entry.id === record.campaignId);
        const binding = campaign && validation.bindings(campaign).find((entry) => entry.systemId === record.systemId);
        affected ||= !binding || versions.has(binding.version);
      }
      if (!changed && !affected) continue;
      // Archive candidates can retain unchanged live SQLite rows. Detach only
      // selected rows proven to belong to the accepted previous state; a newly
      // supplied record still goes through the SDK's raw accessor checks.
      let retained = false;
      if (!changed && affected && previous) {
        retainedRecords ??= new Set<Actor | Item>(previous[collection]);
        retained = retainedRecords.has(record);
      }
      // Commit validation also checks actual candidate data, because JSON bytes
      // alone can hide undefined/functions. Only selected rows are detached.
      validation.record(collection, record, serialized || retained);
    }
  }
}

class StateValidation {
  private readonly checkedInstallations = new Map<SystemInstallation, ResolvedSystem>();
  private readonly resolved = new Map<string, ResolvedSystem>();
  private readonly checkedBindings = new Map<Campaign, SystemManifestIdentity[]>();
  private readonly executableIds: Set<string>;

  constructor(private readonly state: DeclarativeSystemState, private readonly previousExecutableIds = new Set<string>()) {
    this.executableIds = new Set(state.systemInstallations.filter((record) => hasExecutableMarker(record.manifest)).map((record) => record.manifest.id));
  }

  bindings(campaign: Campaign): SystemManifestIdentity[] {
    const cached = this.checkedBindings.get(campaign);
    if (cached) return cached;
    const bindings = campaign.systemBindings === undefined ? [] : campaign.systemBindings;
    if (!Array.isArray(bindings)) fail("campaigns", campaign.id, undefined, ["systemBindings"], "bindings", "Campaign system bindings must be an array of exact system identities.");
    const seen = new Set<string>();
    for (const binding of bindings) {
      if (!binding || typeof binding !== "object" || Array.isArray(binding)
        || !nonemptyString(binding.systemId) || !nonemptyString(binding.version) || !checksum(binding.checksum)) {
        fail("campaigns", campaign.id, undefined, ["systemBindings"], "binding_identity", "Each campaign system binding requires a system ID, version and lowercase SHA-256 checksum.");
      }
      if (seen.has(binding.systemId)) fail("campaigns", campaign.id, binding.systemId, ["systemBindings"], "duplicate_binding", "A campaign must have exactly one binding for each selected declarative system.");
      seen.add(binding.systemId);
    }
    this.checkedBindings.set(campaign, bindings);
    return bindings;
  }

  campaignDefault(campaign: Campaign): void {
    const systemId = campaign.defaultSystemId;
    const hasBinding = this.bindings(campaign).some((binding) => binding.systemId === systemId);
    if (hasBinding || this.executableIds.has(systemId) || this.previousExecutableIds.has(systemId)) this.resolve(campaign.id, systemId);
  }

  installation(installation: SystemInstallation): ResolvedSystem {
    const cached = this.checkedInstallations.get(installation);
    if (cached) return cached;
    const sameVersion = this.state.systemInstallations.filter((record) => record.manifest.id === installation.manifest.id && record.manifest.version === installation.manifest.version);
    if (sameVersion.length !== 1) fail("systemInstallations", installation.id, installation.manifest.id, ["manifest"], "duplicate_definition", "Each executable system ID and version must have exactly one installed definition, including when it is not bound to a campaign.");
    let manifest: DeclarativeSystemManifest;
    let computed: string;
    try {
      // Detach the selected manifest, including store-owned tracking accessors.
      manifest = structuredClone(installation.manifest) as DeclarativeSystemManifest;
      computed = declarativeSystemManifestChecksum(manifest);
    } catch (error) {
      const issues = error instanceof DeclarativeRuntimeError ? error.issues : [{ path: ["manifest"], code: "invalid_definition", message: "Installed executable definition must be bounded valid JSON." }];
      throw new DeclarativeSystemStateError(issues.map((issue) => ({ ...issue, collection: "systemInstallations", recordId: installation.id, systemId: installation.manifest.id })));
    }
    if (!nonemptyString(manifest.id) || !nonemptyString(manifest.version)) fail("systemInstallations", installation.id, manifest.id, ["manifest"], "definition_identity", "Executable definitions require a nonempty system ID and version.");
    if (!checksum(installation.checksum) || installation.checksum !== computed) fail("systemInstallations", installation.id, manifest.id, ["checksum"], "definition_checksum", "Stored executable definition checksum must match the complete installed manifest.");
    const result = { manifest, identity: { systemId: manifest.id, version: manifest.version, checksum: computed } };
    this.checkedInstallations.set(installation, result);
    return result;
  }

  resolve(campaignId: string, systemId: string): ResolvedSystem {
    const key = recordKey(campaignId, systemId);
    const cached = this.resolved.get(key);
    if (cached) return cached;
    const campaign = this.state.campaigns.find((record) => record.id === campaignId);
    if (!campaign) fail("campaigns", campaignId, systemId, ["systemBindings"], "missing_campaign", "Declarative records require their campaign and an exact system binding.");
    const binding = this.bindings(campaign).find((entry) => entry.systemId === systemId);
    if (!binding) fail("campaigns", campaignId, systemId, ["systemBindings"], "missing_binding", "Declarative records require an exact campaign system binding.");
    const installations = this.state.systemInstallations.filter((record) => record.manifest.id === systemId && record.manifest.version === binding.version);
    if (installations.length !== 1) fail("campaigns", campaignId, systemId, ["systemBindings"], "missing_definition", "The pinned system ID and version must resolve to exactly one installed executable definition.");
    const result = this.installation(installations[0]!);
    if (result.identity.checksum !== binding.checksum) fail("campaigns", campaignId, systemId, ["systemBindings"], "binding_checksum", "Campaign binding checksum must match the exact installed executable definition.");
    this.resolved.set(key, result);
    return result;
  }

  record(collection: "actors" | "items", record: Actor | Item, detach = false): void {
    const campaign = this.state.campaigns.find((entry) => entry.id === record.campaignId);
    const hasBinding = campaign && this.bindings(campaign).some((entry) => entry.systemId === record.systemId);
    if (!hasBinding && !this.executableIds.has(record.systemId) && !this.previousExecutableIds.has(record.systemId)) return;
    const { manifest } = this.resolve(record.campaignId, record.systemId);
    if (detach) record = recordSnapshot(collection, record);
    const kind = collection === "actors" ? "actor" : "item";
    const types = kind === "actor" ? manifest.definition.actorTypes : manifest.definition.itemTypes;
    if (!types.includes(record.type)) fail(collection, record.id, record.systemId, ["type"], `${kind}_type`, `Record type is not declared by the pinned system's ${kind} types.`);
    const issues = validateDeclarativeSystemData(manifest.schemas[kind], record.data, ["data"]);
    if (issues.length) throw new DeclarativeSystemStateError(issues.map((issue) => ({ ...issue, collection, recordId: record.id, systemId: record.systemId })));
  }
}

function hasExecutableMarker(manifest: SystemInstallation["manifest"]): boolean {
  return Object.prototype.hasOwnProperty.call(manifest, "definition")
    || (manifest.schemas && [manifest.schemas.actor, manifest.schemas.item].some((schema) => schema !== undefined && typeof schema !== "string"));
}

function nonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200;
}

function checksum(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function recordKey(collection: string, id: string): string {
  return JSON.stringify([collection, id]);
}

function fail(collection: DeclarativeStateCollection, recordId: string, systemId: string | undefined, path: string[], code: string, message: string): never {
  throw new DeclarativeSystemStateError([{ collection, recordId, ...(systemId === undefined ? {} : { systemId }), path, code, message }]);
}

function recordJson(collection: DeclarativeStateCollection, record: { id: string }): string {
  try {
    return JSON.stringify(record);
  } catch {
    fail(collection, record.id, undefined, [], "record_json", "Candidate record must contain serializable JSON values.");
  }
}

function recordSnapshot(collection: "actors" | "items", record: Actor | Item): Actor | Item {
  try {
    return structuredClone(record);
  } catch {
    fail(collection, record.id, record.systemId, ["data"], "record_json", "Declarative record data must contain plain JSON values.");
  }
}
