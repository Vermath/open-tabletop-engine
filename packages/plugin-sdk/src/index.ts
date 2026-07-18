import type {
  EngineEvent,
  PermissionName,
  ProposalChange,
  TokenMoveBatchRequest,
} from "@open-tabletop/core";

export const PLUGIN_EVENT_TYPES = [
  // asset.* and dice.macro.* are deliberately not exposed to plugins. Asset
  // visibility is record-specific, while GM-only macro visibility requires
  // campaign.update rather than the existing dice.* -> chat.read mapping.
  // Forwarding either family through campaign-wide grants would disclose
  // target ids that the subscribing plugin is not necessarily allowed to see.
  "campaign.updated",
  "campaign.member.joined",
  "campaign.member.updated",
  "campaign.member.left",
  "campaign.session.created",
  "campaign.session.updated",
  "campaign.session.started",
  "campaign.session.completed",
  "campaign.session.deleted",
  "world.created",
  "world.updated",
  "world.deleted",
  "scene.created",
  "scene.updated",
  "scene.deleted",
  "scene.activated",
  "token.created",
  "token.updated",
  "token.moved",
  "token.moved.batch",
  "token.deleted",
  "actor.created",
  "actor.updated",
  "actor.deleted",
  "item.created",
  "item.updated",
  "item.deleted",
  "journal.created",
  "journal.updated",
  "journal.deleted",
  "handout.created",
  "handout.updated",
  "handout.deleted",
  "chat.message.created",
  "chat.message.updated",
  "chat.message.deleted",
  "dice.roll.created",
  "audio.updated",
  "audio.deleted",
  "combat.started",
  "combat.roundAdvanced",
  "combat.turnChanged",
  "combat.ended",
  "encounter.created",
  "encounter.updated",
  "encounter.deleted",
  "proposal.created",
  "proposal.updated",
  "proposal.approved",
  "proposal.rejected",
  "proposal.applied",
  "proposal.reverted",
  "contentImport.previewed",
  "contentImport.applied",
  "contentImport.rolledBack",
  "contentImport.deleted",
  "ai.thread.started",
  "ai.message.completed",
  "ai.reasoning.completed",
  "ai.activity.reported",
  "ai.tool.started",
  "ai.tool.completed",
  "ai.proposal.created",
  "ai.memory.created",
  "ai.memory.updated",
  "ai.memory.approved",
  "ai.memory.rejected",
  "ai.memory.deleted",
] as const satisfies readonly EngineEvent["type"][];

export type PluginEventType = (typeof PLUGIN_EVENT_TYPES)[number];
const PLUGIN_EVENT_TYPE_SET = new Set<string>(PLUGIN_EVENT_TYPES);

export function isPluginEventType(value: unknown): value is PluginEventType {
  return typeof value === "string" && PLUGIN_EVENT_TYPE_SET.has(value);
}

export interface PluginEventEnvelope {
  id: string;
  campaignId: string;
  type: PluginEventType;
  actorUserId?: string;
  targetId?: string;
  timestamp: string;
  causationId?: string;
  correlationId?: string;
}

export interface PluginEventSubscription {
  type: PluginEventType;
  description?: string;
}

const PLUGIN_EVENT_PERMISSION_BY_PREFIX: ReadonlyArray<
  readonly [string, PermissionName]
> = [
  ["campaign.", "campaign.read"],
  ["world.", "world.read"],
  ["scene.", "scene.read"],
  ["token.", "token.read"],
  ["actor.", "actor.read"],
  ["item.", "actor.read"],
  ["journal.", "journal.read"],
  ["handout.", "handout.read"],
  ["chat.", "chat.read"],
  ["dice.", "chat.read"],
  ["audio.", "campaign.read"],
  ["combat.", "scene.read"],
  ["encounter.", "scene.read"],
  ["proposal.", "ai.proposeChanges"],
  ["contentImport.", "campaign.read"],
  ["ai.", "ai.proposeChanges"],
];

export function pluginEventPermission(type: PluginEventType): PermissionName {
  const match = PLUGIN_EVENT_PERMISSION_BY_PREFIX.find(([prefix]) =>
    type.startsWith(prefix),
  );
  if (!match) throw new Error(`Unsupported plugin event type: ${type}`);
  return match[1];
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  compatibleCore: string;
  package?: {
    publisher?: string;
    license?: string;
    homepage?: string;
    repository?: string;
  };
  entrypoints: {
    client?: string;
    server?: string;
  };
  runtime?: {
    apiVersion?: string;
    sandbox?: "vm";
  };
  permissions: PermissionName[];
  ui?: {
    panels?: Array<{ id: string; title: string; icon?: string }>;
  };
  chatCommands?: Array<{ command: string; description: string }>;
  eventSubscriptions?: PluginEventSubscription[];
}

export const PLUGIN_PERMISSION_ALLOWLIST: readonly PermissionName[] =
  Object.freeze([
    "campaign.read",
    "world.read",
    "scene.read",
    "token.read",
    "token.move",
    "actor.read",
    "actor.readPrivate",
    "journal.read",
    "journal.readSecret",
    "handout.read",
    "handout.readSecret",
    "chat.read",
    "chat.write",
    "plugin.configure",
    "dice.roll",
    "ai.readPublicMemory",
    "ai.readGmMemory",
    "ai.proposeChanges",
  ]);

export const OPEN_TABLETOP_CORE_VERSION = "0.3.0";

export interface ParsedPluginVersion {
  major: bigint;
  minor: bigint;
  patch: bigint;
  prerelease: string[];
  build: string[];
}

const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export function parsePluginVersion(
  value: string,
): ParsedPluginVersion | undefined {
  if (typeof value !== "string" || value.length > 256) return undefined;
  const match = SEMVER_PATTERN.exec(value);
  if (!match) return undefined;
  const prerelease = match[4]?.split(".") ?? [];
  if (
    prerelease.some(
      (identifier) =>
        /^\d+$/.test(identifier) &&
        identifier.length > 1 &&
        identifier.startsWith("0"),
    )
  )
    return undefined;
  return {
    major: BigInt(match[1]!),
    minor: BigInt(match[2]!),
    patch: BigInt(match[3]!),
    prerelease,
    build: match[5]?.split(".") ?? [],
  };
}

export function comparePluginVersions(left: string, right: string): number {
  const leftParsed = parsePluginVersion(left);
  const rightParsed = parsePluginVersion(right);
  if (!leftParsed || !rightParsed)
    throw new Error("Plugin versions must be valid semantic versions");
  for (const key of ["major", "minor", "patch"] as const) {
    if (leftParsed[key] < rightParsed[key]) return -1;
    if (leftParsed[key] > rightParsed[key]) return 1;
  }
  return comparePrerelease(leftParsed.prerelease, rightParsed.prerelease);
}

export function pluginCoreCompatibility(
  range: string,
  coreVersion = OPEN_TABLETOP_CORE_VERSION,
): { valid: boolean; satisfied: boolean } {
  if (
    typeof range !== "string" ||
    range.length > 512 ||
    typeof coreVersion !== "string" ||
    coreVersion.length > 256 ||
    !range.trim() ||
    range.includes("||")
  )
    return { valid: false, satisfied: false };
  const current = parsePluginVersion(coreVersion);
  if (!current) return { valid: false, satisfied: false };
  if (range.trim().toLowerCase() === "any")
    return { valid: true, satisfied: true };
  let valid = true;
  const comparatorResults = range
    .trim()
    .split(/\s+/)
    .map((comparator) => {
      if (comparator === "*") return true;
      const match = /^(\^|~|>=|<=|>|<|=)?(.+)$/.exec(comparator);
      if (!match) {
        valid = false;
        return false;
      }
      const target = parsePluginRangeVersion(match[2]!);
      if (!target) {
        valid = false;
        return false;
      }
      const comparison = comparePluginVersions(coreVersion, target.normalized);
      const operator = match[1] ?? "=";
      if (operator === ">=") return comparison >= 0;
      if (operator === "<=") return comparison <= 0;
      if (operator === ">") return comparison > 0;
      if (operator === "<") return comparison < 0;
      if (operator === "~")
        return (
          comparison >= 0 &&
          current.major === target.version.major &&
          (target.specifiedParts === 1 ||
            current.minor === target.version.minor)
        );
      if (operator === "^") {
        if (target.version.major > 0n || target.specifiedParts === 1)
          return comparison >= 0 && current.major === target.version.major;
        if (target.version.minor > 0n)
          return (
            comparison >= 0 &&
            current.major === 0n &&
            current.minor === target.version.minor
          );
        if (target.specifiedParts < 3)
          return (
            comparison >= 0 && current.major === 0n && current.minor === 0n
          );
        return (
          comparison >= 0 &&
          current.major === 0n &&
          current.minor === 0n &&
          current.patch === target.version.patch
        );
      }
      return comparison === 0;
    });
  const satisfied = comparatorResults.every(Boolean);
  return { valid, satisfied: valid && satisfied };
}

function parsePluginRangeVersion(value: string):
  | {
      version: ParsedPluginVersion;
      normalized: string;
      specifiedParts: number;
    }
  | undefined {
  const partialMatch =
    /^(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?(?:\.(0|[1-9]\d*))?$/.exec(value);
  if (partialMatch) {
    const specifiedParts = partialMatch[3] ? 3 : partialMatch[2] ? 2 : 1;
    const normalized = `${partialMatch[1]}.${partialMatch[2] ?? "0"}.${partialMatch[3] ?? "0"}`;
    const version = parsePluginVersion(normalized);
    if (!version) return undefined;
    return {
      version,
      normalized,
      specifiedParts,
    };
  }
  return undefined;
}

export interface PluginContext {
  pluginId: string;
  campaignId: string;
  permissions: PermissionName[];
  onEvent(
    type: PluginEventType,
    handler: (
      event: PluginEventEnvelope,
      context: PluginBridgeContext,
    ) => void | Promise<void>,
  ): void;
  createProposal(input: PluginProposalRequest): Promise<string>;
  postChatMessage(input: PluginChatMessageRequest): Promise<string>;
  /** Queue the same revision-guarded atomic token move used by the web client. */
  moveTokens(sceneId: string, input: TokenMoveBatchRequest): Promise<string>;
}

export interface PluginProposalRequest {
  title: string;
  summary: string;
  changes: PluginProposalChange[];
}

/**
 * Plugins may author ordinary reviewable proposal changes, but rules-managed
 * Actor and Item payloads are deliberately not a generic Record patch surface.
 * Those records must use the engine's typed system transactions. The only
 * presentation-only exception exposed by the bridge is an explicit rename.
 */
export type PluginProposalChange =
  | (Omit<ProposalChange, "entity"> & {
      entity: Exclude<
        ProposalChange["entity"],
        "actor" | "item" | "campaignSession" | "aiMemory"
      >;
    })
  | {
      entity: "actor" | "item";
      action: "update";
      id: string;
      data: { name: string };
    };

export interface PluginChatMessageRequest {
  body: string;
  visibility?: "public" | "gm_only";
}

export interface PluginBridgeContext {
  readonly pluginId: string;
  readonly campaignId: string;
  readonly permissions: readonly PermissionName[];
  createProposal(input: PluginProposalRequest): Promise<string>;
  postChatMessage(input: PluginChatMessageRequest): Promise<string>;
  /** Queue the same revision-guarded atomic token move used by the web client. */
  moveTokens(sceneId: string, input: TokenMoveBatchRequest): Promise<string>;
}

export interface OpenTabletopPlugin {
  manifest: PluginManifest;
  activate(context: PluginContext): void | Promise<void>;
}

export function validatePluginManifest(manifest: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(manifest)) return ["Plugin manifest must be an object"];
  if (
    typeof manifest.id !== "string" ||
    !/^[a-z0-9][a-z0-9-]{1,63}$/.test(manifest.id)
  )
    errors.push("Plugin id must be lowercase kebab-case");
  if (typeof manifest.name !== "string" || !manifest.name.trim())
    errors.push("Plugin name is required");
  if (
    typeof manifest.version !== "string" ||
    !parsePluginVersion(manifest.version)
  )
    errors.push("Plugin version must be valid semver");
  if (
    typeof manifest.compatibleCore !== "string" ||
    !manifest.compatibleCore.trim()
  ) {
    errors.push("Compatible core range is required");
  } else {
    const compatibility = pluginCoreCompatibility(manifest.compatibleCore);
    if (!compatibility.valid)
      errors.push("Compatible core range must be a valid version range");
  }
  const entrypoints = isRecord(manifest.entrypoints)
    ? manifest.entrypoints
    : undefined;
  if (!entrypoints) errors.push("Plugin entrypoints must be an object");
  const clientEntrypoint = optionalNonEmptyString(
    entrypoints?.client,
    "Client entrypoint",
    errors,
  );
  const serverEntrypoint = optionalNonEmptyString(
    entrypoints?.server,
    "Server entrypoint",
    errors,
  );
  if (!clientEntrypoint && !serverEntrypoint) {
    errors.push("At least one plugin entrypoint is required");
  }
  if (clientEntrypoint && !safePluginManifestPath(clientEntrypoint))
    errors.push("Client entrypoint must be a safe package-relative path");
  if (serverEntrypoint && !safePluginManifestPath(serverEntrypoint))
    errors.push("Server entrypoint must be a safe package-relative path");
  if (manifest.package !== undefined)
    validateOptionalStringRecord(
      manifest.package,
      "Plugin package",
      ["publisher", "license", "homepage", "repository"],
      errors,
    );
  if (manifest.runtime !== undefined) {
    if (!isRecord(manifest.runtime)) {
      errors.push("Plugin runtime must be an object");
    } else {
      optionalNonEmptyString(
        manifest.runtime.apiVersion,
        "Plugin runtime apiVersion",
        errors,
      );
      if (
        manifest.runtime.sandbox !== undefined &&
        manifest.runtime.sandbox !== "vm"
      )
        errors.push("Unsupported plugin sandbox");
    }
  }
  if (!Array.isArray(manifest.permissions)) {
    errors.push("Permissions must be an array");
  } else {
    const unknownPermissions = manifest.permissions.filter(
      (permission) =>
        typeof permission !== "string" ||
        !PLUGIN_PERMISSION_ALLOWLIST.includes(permission as PermissionName),
    );
    if (unknownPermissions.length)
      errors.push(
        `Unsupported plugin permissions: ${unknownPermissions.join(", ")}`,
      );
    if (new Set(manifest.permissions).size !== manifest.permissions.length)
      errors.push("Plugin permissions must not contain duplicates");
  }
  if (manifest.ui !== undefined) validatePluginUi(manifest.ui, errors);
  if (
    manifest.chatCommands !== undefined &&
    !Array.isArray(manifest.chatCommands)
  ) {
    errors.push("Plugin chatCommands must be an array");
  } else {
    const commands = manifest.chatCommands ?? [];
    const seenCommands = new Set<string>();
    for (const [index, command] of commands.entries()) {
      if (!isRecord(command)) {
        errors.push(`Plugin chat command ${index + 1} must be an object`);
        continue;
      }
      const commandName =
        typeof command.command === "string" ? command.command : "";
      if (!/^\/[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(commandName))
        errors.push(
          `Plugin command must be a slash command: ${commandName || `<entry ${index + 1}>`}`,
        );
      if (seenCommands.has(commandName))
        errors.push(`Plugin command is duplicated: ${commandName}`);
      if (commandName) seenCommands.add(commandName);
      if (
        typeof command.description !== "string" ||
        !command.description.trim()
      )
        errors.push(
          `Plugin command description is required: ${commandName || `<entry ${index + 1}>`}`,
        );
    }
  }
  validatePluginEventSubscriptions(
    manifest.eventSubscriptions,
    manifest.permissions,
    serverEntrypoint,
    errors,
  );
  return errors;
}

function validatePluginEventSubscriptions(
  value: unknown,
  permissionsValue: unknown,
  serverEntrypoint: string | undefined,
  errors: string[],
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    errors.push("Plugin eventSubscriptions must be an array");
    return;
  }
  if (value.length > 32)
    errors.push("Plugin eventSubscriptions is limited to 32 entries");
  if (value.length > 0 && !serverEntrypoint)
    errors.push("Plugins with event subscriptions require a server entrypoint");
  const permissions = new Set(
    Array.isArray(permissionsValue)
      ? permissionsValue.filter(
          (item): item is PermissionName => typeof item === "string",
        )
      : [],
  );
  const seen = new Set<string>();
  for (const [index, subscription] of value.entries()) {
    if (!isRecord(subscription)) {
      errors.push(`Plugin event subscription ${index + 1} must be an object`);
      continue;
    }
    const type = typeof subscription.type === "string" ? subscription.type : "";
    if (!isPluginEventType(type)) {
      errors.push(
        `Unsupported plugin event type: ${type || `<entry ${index + 1}>`}`,
      );
      continue;
    }
    if (seen.has(type))
      errors.push(`Plugin event subscription is duplicated: ${type}`);
    seen.add(type);
    const requiredPermission = pluginEventPermission(type);
    if (!permissions.has(requiredPermission))
      errors.push(
        `Plugin event ${type} requires permission: ${requiredPermission}`,
      );
    if (subscription.description !== undefined) {
      const description = optionalNonEmptyString(
        subscription.description,
        `Plugin event ${type} description`,
        errors,
      );
      if (description && description.length > 240)
        errors.push(
          `Plugin event ${type} description must be 240 characters or fewer`,
        );
    }
  }
}

function comparePrerelease(left: string[], right: string[]): number {
  if (left.length === 0 && right.length === 0) return 0;
  if (left.length === 0) return 1;
  if (right.length === 0) return -1;
  const max = Math.max(left.length, right.length);
  for (let index = 0; index < max; index += 1) {
    const leftIdentifier = left[index];
    const rightIdentifier = right[index];
    if (leftIdentifier === undefined) return -1;
    if (rightIdentifier === undefined) return 1;
    const leftNumeric = /^\d+$/.test(leftIdentifier);
    const rightNumeric = /^\d+$/.test(rightIdentifier);
    if (leftNumeric && rightNumeric) {
      const leftNumber = BigInt(leftIdentifier);
      const rightNumber = BigInt(rightIdentifier);
      if (leftNumber < rightNumber) return -1;
      if (leftNumber > rightNumber) return 1;
      continue;
    }
    if (leftNumeric) return -1;
    if (rightNumeric) return 1;
    if (leftIdentifier < rightIdentifier) return -1;
    if (leftIdentifier > rightIdentifier) return 1;
  }
  return 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safePluginManifestPath(value: string): boolean {
  if (
    value !== value.trim() ||
    value.length > 512 ||
    value.includes("\\") ||
    value.startsWith("/") ||
    /^[a-z][a-z0-9+.-]*:/i.test(value)
  )
    return false;
  const segments = value.split("/");
  return (
    segments.at(-1) !== "." &&
    !segments.includes("..") &&
    !segments.includes("")
  );
}

function optionalNonEmptyString(
  value: unknown,
  label: string,
  errors: string[],
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`${label} must be a non-empty string`);
    return undefined;
  }
  return value;
}

function requiredNonEmptyString(
  value: unknown,
  label: string,
  errors: string[],
): string | undefined {
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`${label} must be a non-empty string`);
    return undefined;
  }
  return value;
}

function validateOptionalStringRecord(
  value: unknown,
  label: string,
  keys: string[],
  errors: string[],
): void {
  if (!isRecord(value)) {
    errors.push(`${label} must be an object`);
    return;
  }
  for (const key of keys)
    optionalNonEmptyString(value[key], `${label} ${key}`, errors);
}

function validatePluginUi(value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push("Plugin ui must be an object");
    return;
  }
  if (value.panels === undefined) return;
  if (!Array.isArray(value.panels)) {
    errors.push("Plugin ui panels must be an array");
    return;
  }
  const seenPanelIds = new Set<string>();
  for (const [index, panel] of value.panels.entries()) {
    if (!isRecord(panel)) {
      errors.push(`Plugin ui panel ${index + 1} must be an object`);
      continue;
    }
    const panelId = requiredNonEmptyString(
      panel.id,
      `Plugin ui panel ${index + 1} id`,
      errors,
    );
    if (panelId && seenPanelIds.has(panelId))
      errors.push(`Plugin ui panel id is duplicated: ${panelId}`);
    if (panelId) seenPanelIds.add(panelId);
    requiredNonEmptyString(
      panel.title,
      `Plugin ui panel ${index + 1} title`,
      errors,
    );
    optionalNonEmptyString(
      panel.icon,
      `Plugin ui panel ${index + 1} icon`,
      errors,
    );
  }
}
