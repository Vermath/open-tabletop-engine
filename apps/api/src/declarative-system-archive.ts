import { isDeepStrictEqual } from "node:util";
import type { CampaignArchive, CampaignArchiveSystemRequirement, DeclarativeSystemManifest, DeclarativeValidationIssue, EngineState, SystemManifestIdentity } from "@open-tabletop/core";
import { declarativeSystemManifestChecksum, DeclarativeRuntimeError } from "./declarative-system-runtime.js";
import { assertDeclarativeSystemStateCandidate, resolvePinnedDeclarativeSystem } from "./declarative-system-state.js";

type ExactRequirement = CampaignArchiveSystemRequirement & { identity: SystemManifestIdentity; manifest: DeclarativeSystemManifest };
export type DeclarativeArchiveDependencyIssue = DeclarativeValidationIssue & { campaignId?: string; systemId?: string; version?: string; checksum?: string };

export class DeclarativeArchiveDependencyError extends Error {
  readonly statusCode = 422;
  readonly code = "archive_system_dependency";
  constructor(readonly issues: readonly DeclarativeArchiveDependencyIssue[]) {
    super(issues[0]?.message ?? "Campaign archive rules-system dependencies are invalid.");
    this.name = "DeclarativeArchiveDependencyError";
  }
}

/** The manifest is inert install input; exporting it never grants installation authority. */
export function declarativeArchiveSystemRequirement(state: EngineState, campaignId: string, systemId: string): ExactRequirement {
  const { manifest, identity } = resolvePinnedDeclarativeSystem(state, campaignId, systemId);
  const { id, name, version, compatibleCore, capabilities } = manifest;
  return structuredClone({ id, name, version, compatibleCore, capabilities, identity, manifest });
}

/** Validate public dependency metadata before cloning or interpreting any embedded definition. */
export function assertDeclarativeArchiveSystemRequirements(value: unknown): void {
  exactRequirements(value);
}

/** Call on the final scoped/ID-normalized merge candidate before any asset restore or state acceptance. */
export function assertDeclarativeArchiveDependencies(previous: EngineState, candidate: EngineState, archive: CampaignArchive): void {
  const requirements = exactRequirements(archive.manifest.systemRequirements);
  if (!isDeepStrictEqual(previous.systemInstallations, candidate.systemInstallations)) {
    fail("installation_authority", "Campaign archive import cannot install or replace rules packages. A server administrator must install the exact dependency separately.", ["data", "systemInstallations"]);
  }

  const installedDeclarativeIds = new Set(previous.systemInstallations.filter((entry) => Object.hasOwn(entry.manifest, "definition")).map((entry) => entry.manifest.id));
  const selected = new Map<string, { campaignId: string; systemId: string }>();
  const select = (campaignId: string, systemId: string): void => { selected.set(JSON.stringify([campaignId, systemId]), { campaignId, systemId }); };
  for (const incoming of archive.data.campaigns) {
    const campaign = candidate.campaigns.find((record) => record.id === incoming.id);
    for (const binding of campaignBindings(campaign)) select(incoming.id, binding.systemId);
    if (campaign && (requirements.has(campaign.defaultSystemId) || installedDeclarativeIds.has(campaign.defaultSystemId))) select(campaign.id, campaign.defaultSystemId);
  }
  for (const incoming of [...archive.data.actors, ...archive.data.items]) {
    const campaign = candidate.campaigns.find((record) => record.id === incoming.campaignId);
    if (requirements.has(incoming.systemId) || campaignBindings(campaign).some((binding) => binding.systemId === incoming.systemId)) {
      select(incoming.campaignId, incoming.systemId);
    }
  }

  for (const { campaignId, systemId } of selected.values()) {
    const pin = campaignBindings(candidate.campaigns.find((record) => record.id === campaignId)).find((binding) => binding.systemId === systemId);
    const context = { campaignId, systemId, ...(pin ? { version: pin.version, checksum: pin.checksum } : {}) };
    if (!pin) fail("missing_binding", "Imported declarative records require an exact campaign system binding.", ["data", "campaigns", campaignId, "systemBindings"], context);
    const requirement = requirements.get(systemId);
    if (!requirement) fail("missing_requirement", "Archive must include the pinned system identity and inert manifest in systemRequirements.", ["manifest", "systemRequirements"], context);
    if (!isDeepStrictEqual(pin, requirement.identity)) {
      fail("system_pin_mismatch", "Archive records and the destination campaign must use the same exact system version and checksum.", ["manifest", "systemRequirements"], context);
    }
    const installed = previous.systemInstallations.filter((record) => record.manifest.id === systemId && record.manifest.version === pin.version);
    if (installed.length !== 1) {
      fail("missing_installed_definition", "Install the archive's exact system ID, version and checksum as a server administrator before importing this campaign.", ["manifest", "systemRequirements"], context);
    }
    if (installed[0]!.checksum !== pin.checksum) {
      fail("installed_definition_mismatch", "The installed version has a different checksum. A server administrator must provide the archive's exact immutable rules package before import.", ["manifest", "systemRequirements"], context);
    }
    const resolved = resolvePinnedDeclarativeSystem(candidate, campaignId, systemId);
    if (!isDeepStrictEqual(resolved.manifest, requirement.manifest)) {
      fail("installed_definition_mismatch", "The installed system definition differs from the archive's exact dependency.", ["manifest", "systemRequirements"], context);
    }
  }
  assertDeclarativeSystemStateCandidate(previous, candidate);
}

function exactRequirements(value: unknown): Map<string, ExactRequirement> {
  const result = new Map<string, ExactRequirement>();
  if (value === undefined) return result;
  const path = ["manifest", "systemRequirements"];
  if (!Array.isArray(value) || value.length > 128) fail("requirements", "Archive systemRequirements must be an array of at most 128 entries.", path);
  // Arrays and wrappers are inspected through descriptors before reading values.
  const entries = ownData(value, path, 129);
  for (let index = 0; index < value.length; index += 1) {
    const entry = entries[String(index)];
    const entryPath = [...path, String(index)];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue; // Historical metadata is advisory.
    const fields = ownData(entry, entryPath, 32);
    if (!["identity", "manifest", "definition", "schemas"].some((key) => Object.hasOwn(fields, key))) continue;
    const identity = ownData(fields.identity, [...entryPath, "identity"], 3);
    if (Object.keys(identity).length !== 3 || !boundedString(identity.systemId) || !boundedString(identity.version)
      || typeof identity.checksum !== "string" || !/^[a-f0-9]{64}$/.test(identity.checksum)) {
      fail("requirement_identity", "Declarative archive requirements need an exact system ID, version and lowercase SHA-256 checksum.", [...entryPath, "identity"]);
    }
    let checksum: string;
    try { checksum = declarativeSystemManifestChecksum(fields.manifest); }
    catch (error) {
      if (!(error instanceof DeclarativeRuntimeError)) throw error;
      throw new DeclarativeArchiveDependencyError(error.issues.slice(0, 32).map((issue) => ({ ...issue, path: [...entryPath, "manifest", ...issue.path] })));
    }
    const manifest = fields.manifest as DeclarativeSystemManifest;
    if (manifest.id !== identity.systemId || manifest.version !== identity.version || checksum !== identity.checksum) {
      fail("requirement_checksum", "Archive system identity must match the complete embedded declarative manifest.", entryPath);
    }
    for (const key of ["id", "name", "version", "compatibleCore"] as const) {
      if (fields[key] !== manifest[key]) fail("requirement_metadata", `Archive system requirement ${key} must match its embedded manifest.`, [...entryPath, key]);
    }
    if (!Array.isArray(fields.capabilities) || fields.capabilities.length !== manifest.capabilities.length) {
      fail("requirement_metadata", "Archive system requirement capabilities must match its embedded manifest.", [...entryPath, "capabilities"]);
    }
    const capabilities = ownData(fields.capabilities, [...entryPath, "capabilities"], 33);
    if (manifest.capabilities.some((capability, index) => capabilities[String(index)] !== capability)) {
      fail("requirement_metadata", "Archive system requirement capabilities must match its embedded manifest.", [...entryPath, "capabilities"]);
    }
    if (Object.keys(fields).some((key) => !["id", "name", "version", "compatibleCore", "capabilities", "identity", "manifest"].includes(key))) {
      fail("requirement_fields", "Declarative archive requirements contain only package metadata, identity and the inert manifest.", entryPath);
    }
    if (result.has(manifest.id)) fail("duplicate_requirement", "Archive must contain only one exact requirement per system ID.", entryPath);
    result.set(manifest.id, entry as ExactRequirement);
  }
  return result;
}

function ownData(value: unknown, path: string[], maxKeys: number): Record<string, unknown> {
  if (!value || typeof value !== "object" || (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    fail("requirement_object", "Declarative archive dependency metadata must be plain inert JSON objects.", path);
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length > maxKeys) fail("requirement_size", "Archive dependency metadata exceeds its field limit.", path);
  const result: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== "string" || !("value" in descriptor) || ["__proto__", "prototype", "constructor"].includes(key)) {
      fail("requirement_json", "Archive dependency metadata must not contain accessors, symbols or unsafe property names.", path);
    }
    result[key] = descriptor.value;
  }
  return result;
}

function campaignBindings(campaign: EngineState["campaigns"][number] | undefined): SystemManifestIdentity[] {
  const bindings = campaign?.systemBindings ?? [];
  if (!Array.isArray(bindings) || bindings.length > 128) fail("binding_identity", "Campaign system bindings must be an array of exact system identities.", ["data", "campaigns", campaign?.id ?? "", "systemBindings"]);
  for (const binding of bindings) {
    if (!binding || typeof binding !== "object" || !boundedString(binding.systemId) || !boundedString(binding.version) || typeof binding.checksum !== "string" || !/^[a-f0-9]{64}$/.test(binding.checksum)) {
      fail("binding_identity", "Campaign system bindings require a system ID, version and lowercase SHA-256 checksum.", ["data", "campaigns", campaign?.id ?? "", "systemBindings"]);
    }
  }
  return bindings;
}

function boundedString(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 200; }

function fail(code: string, message: string, path: string[], context: Omit<DeclarativeArchiveDependencyIssue, keyof DeclarativeValidationIssue> = {}): never {
  throw new DeclarativeArchiveDependencyError([{ code, message, path, ...context }]);
}

