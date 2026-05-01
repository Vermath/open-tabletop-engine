import { createSystemRegistry, registerActorSheet, registerDiceFormula, registerSystem } from "@open-tabletop/system-sdk";

export const registry = registerDiceFormula(
  registerActorSheet(
    registerSystem(createSystemRegistry(), {
      id: "mystic-noir",
      name: "Mystic Noir",
      version: "0.1.0",
      compatibleCore: ">=0.1.0",
      entrypoints: { client: "./src/client.ts", server: "./src/server.ts" },
      schemas: { actor: "./actor.schema.json", item: "./item.schema.json" },
      permissions: ["actor.read", "actor.updateOwned", "dice.roll", "chat.write"]
    }),
    { systemId: "mystic-noir", actorType: "character", componentId: "MysticNoirSheet" }
  ),
  { systemId: "mystic-noir", id: "investigation", label: "Investigation Check", formula: "1d20 + @skills.investigation" }
);
