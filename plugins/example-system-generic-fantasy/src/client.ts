import { createSystemRegistry, registerActorSheet, registerDiceFormula, registerSystem } from "@open-tabletop/system-sdk";

export const registry = registerDiceFormula(
  registerActorSheet(
    registerSystem(createSystemRegistry(), {
      id: "generic-fantasy",
      name: "Generic Fantasy",
      version: "0.1.0",
      compatibleCore: ">=0.1.0",
      entrypoints: { client: "./src/client.ts", server: "./src/server.ts" },
      schemas: { actor: "./actor.schema.json", item: "./item.schema.json" },
      permissions: ["actor.read", "actor.updateOwned", "dice.roll", "chat.write"]
    }),
    { systemId: "generic-fantasy", actorType: "character", componentId: "GenericCharacterSheet" }
  ),
  { systemId: "generic-fantasy", id: "attack", label: "Attack", formula: "1d20 + @abilities.str.mod" }
);
