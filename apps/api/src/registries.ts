import type { EngineState, SystemCapability, SystemInstallation } from "@open-tabletop/core";
import { validateSystemManifest, type SystemManifest } from "@open-tabletop/system-sdk";

export const installedSystems: SystemManifest[] = [
  {
    id: "dnd-5e-srd",
    name: "D&D 5.5e SRD",
    version: "5.2.1",
    compatibleCore: ">=0.1.0",
    entrypoints: {
      client: "/systems/dnd-5e-srd/client.js",
      server: "/systems/dnd-5e-srd/server.js"
    },
    schemas: {
      actor: "/systems/dnd-5e-srd/actor.schema.json",
      item: "/systems/dnd-5e-srd/item.schema.json"
    },
    permissions: ["actor.read", "actor.updateOwned", "dice.roll", "chat.write"],
    capabilities: ["data-model", "actor-sheet", "quick-rolls", "actions", "conditions", "advancement", "rest", "compendium", "character-templates", "character-import", "character-origins", "encounter-builder", "monster-builder"]
  },
  {
    id: "generic-fantasy",
    name: "Generic Fantasy",
    version: "0.1.0",
    compatibleCore: ">=0.1.0",
    entrypoints: {
      client: "/systems/generic-fantasy/client.js",
      server: "/systems/generic-fantasy/server.js"
    },
    schemas: {
      actor: "/systems/generic-fantasy/actor.schema.json",
      item: "/systems/generic-fantasy/item.schema.json"
    },
    permissions: ["actor.read", "actor.updateOwned", "dice.roll", "chat.write"],
    capabilities: ["data-model", "actor-sheet", "quick-rolls", "actions", "conditions", "advancement", "rest", "compendium", "character-templates", "character-import", "encounter-builder", "monster-builder"]
  },
  {
    id: "stellar-frontiers",
    name: "Stellar Frontiers",
    version: "0.1.0",
    compatibleCore: ">=0.1.0",
    entrypoints: {
      client: "/systems/stellar-frontiers/client.js",
      server: "/systems/stellar-frontiers/server.js"
    },
    schemas: {
      actor: "/systems/stellar-frontiers/actor.schema.json",
      item: "/systems/stellar-frontiers/item.schema.json"
    },
    permissions: ["actor.read", "actor.updateOwned", "dice.roll", "chat.write"],
    capabilities: ["data-model", "actor-sheet", "quick-rolls", "actions", "conditions", "advancement", "rest", "compendium", "character-templates", "character-import", "encounter-builder", "monster-builder"]
  },
  {
    id: "mystic-noir",
    name: "Mystic Noir",
    version: "0.1.0",
    compatibleCore: ">=0.1.0",
    entrypoints: {
      client: "/systems/mystic-noir/client.js",
      server: "/systems/mystic-noir/server.js"
    },
    schemas: {
      actor: "/systems/mystic-noir/actor.schema.json",
      item: "/systems/mystic-noir/item.schema.json"
    },
    permissions: ["actor.read", "actor.updateOwned", "dice.roll", "chat.write"],
    capabilities: ["data-model", "actor-sheet", "quick-rolls", "actions", "conditions", "advancement", "rest", "compendium", "character-templates", "character-import", "encounter-builder", "monster-builder"]
  }
];

export function registeredSystems(state: Pick<EngineState, "systemInstallations">): SystemManifest[] {
  const manifests = [...installedSystems];
  const ids = new Set(manifests.map((manifest) => manifest.id));
  for (const installation of state.systemInstallations) {
    try {
      validateSystemManifest(installation.manifest);
    } catch {
      continue;
    }
    if (ids.has(installation.manifest.id)) continue;
    manifests.push(structuredClone(installation.manifest));
    ids.add(installation.manifest.id);
  }
  return manifests;
}

export function findRegisteredSystem(state: Pick<EngineState, "systemInstallations">, systemId: string): SystemManifest | undefined {
  return registeredSystems(state).find((manifest) => manifest.id === systemId);
}

export function systemInstallationByManifestId(state: Pick<EngineState, "systemInstallations">, systemId: string): SystemInstallation | undefined {
  return state.systemInstallations.find((installation) => installation.manifest.id === systemId);
}

export function systemRuntimeCapabilities(systemId: string): SystemCapability[] {
  return installedSystems.find((manifest) => manifest.id === systemId)?.capabilities ?? ["data-model"];
}

export function isBundledSystem(systemId: string): boolean {
  return installedSystems.some((manifest) => manifest.id === systemId);
}
