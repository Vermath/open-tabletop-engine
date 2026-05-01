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

export function validatePluginManifest(manifest: PluginManifest): string[] {
  const errors: string[] = [];
  if (!manifest || typeof manifest !== "object") return ["Plugin manifest must be an object"];
  if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(manifest.id ?? "")) errors.push("Plugin id must be lowercase kebab-case");
  if (!manifest.name) errors.push("Plugin name is required");
  if (!/^\d+\.\d+\.\d+(-[a-z0-9.-]+)?$/i.test(manifest.version ?? "")) errors.push("Plugin version must be semver-like");
  if (!manifest.compatibleCore) errors.push("Compatible core range is required");
  if (!manifest.entrypoints?.client && !manifest.entrypoints?.server) {
    errors.push("At least one plugin entrypoint is required");
  }
  if (manifest.runtime?.sandbox && manifest.runtime.sandbox !== "vm") errors.push("Unsupported plugin sandbox");
  if (!Array.isArray(manifest.permissions)) {
    errors.push("Permissions must be an array");
  } else {
    const unknownPermissions = manifest.permissions.filter((permission) => !PLUGIN_PERMISSION_ALLOWLIST.includes(permission));
    if (unknownPermissions.length) errors.push(`Unsupported plugin permissions: ${unknownPermissions.join(", ")}`);
  }
  for (const command of manifest.chatCommands ?? []) {
    if (!command.command.startsWith("/")) errors.push(`Plugin command must start with /: ${command.command}`);
    if (!command.description) errors.push(`Plugin command description is required: ${command.command}`);
  }
  return errors;
}
