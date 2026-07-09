import type { EngineEvent, PermissionName, ProposalChange } from "@open-tabletop/core";

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
}

export const PLUGIN_PERMISSION_ALLOWLIST: PermissionName[] = ["campaign.read", "scene.read", "token.read", "actor.read", "journal.read", "chat.read", "chat.write", "plugin.configure", "dice.roll", "ai.proposeChanges"];

export interface ParsedPluginVersion {
  major: bigint;
  minor: bigint;
  patch: bigint;
  prerelease: string[];
  build: string[];
}

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export function parsePluginVersion(value: string): ParsedPluginVersion | undefined {
  const match = SEMVER_PATTERN.exec(value);
  if (!match) return undefined;
  const prerelease = match[4]?.split(".") ?? [];
  if (prerelease.some((identifier) => /^\d+$/.test(identifier) && identifier.length > 1 && identifier.startsWith("0"))) return undefined;
  return {
    major: BigInt(match[1]!),
    minor: BigInt(match[2]!),
    patch: BigInt(match[3]!),
    prerelease,
    build: match[5]?.split(".") ?? []
  };
}

export function comparePluginVersions(left: string, right: string): number {
  const leftParsed = parsePluginVersion(left);
  const rightParsed = parsePluginVersion(right);
  if (!leftParsed || !rightParsed) throw new Error("Plugin versions must be valid semantic versions");
  for (const key of ["major", "minor", "patch"] as const) {
    if (leftParsed[key] < rightParsed[key]) return -1;
    if (leftParsed[key] > rightParsed[key]) return 1;
  }
  return comparePrerelease(leftParsed.prerelease, rightParsed.prerelease);
}

export interface PluginContext {
  pluginId: string;
  campaignId: string;
  permissions: PermissionName[];
  onEvent(type: EngineEvent["type"], handler: (event: EngineEvent) => void | Promise<void>): void;
  createProposal(input: { title: string; summary: string; changes: ProposalChange[] }): Promise<string>;
  postChatMessage(input: { body: string; visibility?: "public" | "gm_only" }): Promise<string>;
}

export interface OpenTabletopPlugin {
  manifest: PluginManifest;
  activate(context: PluginContext): void | Promise<void>;
}

export function validatePluginManifest(manifest: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(manifest)) return ["Plugin manifest must be an object"];
  if (typeof manifest.id !== "string" || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(manifest.id)) errors.push("Plugin id must be lowercase kebab-case");
  if (typeof manifest.name !== "string" || !manifest.name.trim()) errors.push("Plugin name is required");
  if (typeof manifest.version !== "string" || !parsePluginVersion(manifest.version)) errors.push("Plugin version must be valid semver");
  if (typeof manifest.compatibleCore !== "string" || !manifest.compatibleCore.trim()) errors.push("Compatible core range is required");
  const entrypoints = isRecord(manifest.entrypoints) ? manifest.entrypoints : undefined;
  if (!entrypoints) errors.push("Plugin entrypoints must be an object");
  const clientEntrypoint = optionalNonEmptyString(entrypoints?.client, "Client entrypoint", errors);
  const serverEntrypoint = optionalNonEmptyString(entrypoints?.server, "Server entrypoint", errors);
  if (!clientEntrypoint && !serverEntrypoint) {
    errors.push("At least one plugin entrypoint is required");
  }
  if (manifest.package !== undefined) validateOptionalStringRecord(manifest.package, "Plugin package", ["publisher", "license", "homepage", "repository"], errors);
  if (manifest.runtime !== undefined) {
    if (!isRecord(manifest.runtime)) {
      errors.push("Plugin runtime must be an object");
    } else {
      optionalNonEmptyString(manifest.runtime.apiVersion, "Plugin runtime apiVersion", errors);
      if (manifest.runtime.sandbox !== undefined && manifest.runtime.sandbox !== "vm") errors.push("Unsupported plugin sandbox");
    }
  }
  if (!Array.isArray(manifest.permissions)) {
    errors.push("Permissions must be an array");
  } else {
    const unknownPermissions = manifest.permissions.filter((permission) => typeof permission !== "string" || !PLUGIN_PERMISSION_ALLOWLIST.includes(permission as PermissionName));
    if (unknownPermissions.length) errors.push(`Unsupported plugin permissions: ${unknownPermissions.join(", ")}`);
  }
  if (manifest.ui !== undefined) validatePluginUi(manifest.ui, errors);
  if (manifest.chatCommands !== undefined && !Array.isArray(manifest.chatCommands)) {
    errors.push("Plugin chatCommands must be an array");
  } else {
    const commands = manifest.chatCommands ?? [];
    const seenCommands = new Set<string>();
    for (const [index, command] of commands.entries()) {
      if (!isRecord(command)) {
        errors.push(`Plugin chat command ${index + 1} must be an object`);
        continue;
      }
      const commandName = typeof command.command === "string" ? command.command : "";
      if (!/^\/[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(commandName)) errors.push(`Plugin command must be a slash command: ${commandName || `<entry ${index + 1}>`}`);
      if (seenCommands.has(commandName)) errors.push(`Plugin command is duplicated: ${commandName}`);
      if (commandName) seenCommands.add(commandName);
      if (typeof command.description !== "string" || !command.description.trim()) errors.push(`Plugin command description is required: ${commandName || `<entry ${index + 1}>`}`);
    }
  }
  return errors;
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

function optionalNonEmptyString(value: unknown, label: string, errors: string[]): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`${label} must be a non-empty string`);
    return undefined;
  }
  return value;
}

function requiredNonEmptyString(value: unknown, label: string, errors: string[]): string | undefined {
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`${label} must be a non-empty string`);
    return undefined;
  }
  return value;
}

function validateOptionalStringRecord(value: unknown, label: string, keys: string[], errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${label} must be an object`);
    return;
  }
  for (const key of keys) optionalNonEmptyString(value[key], `${label} ${key}`, errors);
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
  for (const [index, panel] of value.panels.entries()) {
    if (!isRecord(panel)) {
      errors.push(`Plugin ui panel ${index + 1} must be an object`);
      continue;
    }
    requiredNonEmptyString(panel.id, `Plugin ui panel ${index + 1} id`, errors);
    requiredNonEmptyString(panel.title, `Plugin ui panel ${index + 1} title`, errors);
    optionalNonEmptyString(panel.icon, `Plugin ui panel ${index + 1} icon`, errors);
  }
}
