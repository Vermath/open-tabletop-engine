import type { SystemManifest } from "@open-tabletop/system-sdk";

export const installedSystems: SystemManifest[] = [
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
    permissions: ["actor.read", "actor.updateOwned", "dice.roll", "chat.write"]
  }
];
