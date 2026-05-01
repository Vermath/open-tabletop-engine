import type { SystemManifest } from "@open-tabletop/system-sdk";

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
    permissions: ["actor.read", "actor.updateOwned", "dice.roll", "chat.write"]
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
    permissions: ["actor.read", "actor.updateOwned", "dice.roll", "chat.write"]
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
    permissions: ["actor.read", "actor.updateOwned", "dice.roll", "chat.write"]
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
    permissions: ["actor.read", "actor.updateOwned", "dice.roll", "chat.write"]
  }
];
