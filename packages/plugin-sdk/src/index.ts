import type { EngineEvent, PermissionName, ProposalChange } from "@open-tabletop/core";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  compatibleCore: string;
  entrypoints: {
    client?: string;
    server?: string;
  };
  permissions: PermissionName[];
  ui?: {
    panels?: Array<{ id: string; title: string; icon?: string }>;
  };
  chatCommands?: Array<{ command: string; description: string }>;
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

export function validatePluginManifest(manifest: PluginManifest): string[] {
  const errors: string[] = [];
  if (!manifest.id) errors.push("Plugin id is required");
  if (!manifest.name) errors.push("Plugin name is required");
  if (!manifest.version) errors.push("Plugin version is required");
  if (!manifest.entrypoints.client && !manifest.entrypoints.server) {
    errors.push("At least one plugin entrypoint is required");
  }
  if (!Array.isArray(manifest.permissions)) errors.push("Permissions must be an array");
  return errors;
}
