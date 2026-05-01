import type { PluginManifest } from "@open-tabletop/plugin-sdk";
import type { SystemManifest } from "@open-tabletop/system-sdk";

export const installedPlugins: PluginManifest[] = [
  {
    id: "example-macro-plugin",
    name: "Example Macro Plugin",
    version: "0.1.0",
    compatibleCore: ">=0.1.0",
    entrypoints: {
      client: "/plugins/example-macro-plugin/client.js"
    },
    permissions: ["chat.write", "token.read"],
    ui: {
      panels: [{ id: "macro-pad", title: "Macro Pad", icon: "wand" }]
    },
    chatCommands: [{ command: "/spark", description: "Posts a sample magical effect." }]
  }
];

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
