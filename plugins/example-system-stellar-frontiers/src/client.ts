import { createSystemRegistry, registerActorSheet, registerDiceFormula, registerSystem } from "@open-tabletop/system-sdk";

export const registry = registerDiceFormula(
  registerActorSheet(
    registerSystem(createSystemRegistry(), {
      id: "stellar-frontiers",
      name: "Stellar Frontiers",
      version: "0.1.0",
      compatibleCore: ">=0.1.0",
      entrypoints: { client: "./src/client.ts", server: "./src/server.ts" },
      schemas: { actor: "./actor.schema.json", item: "./item.schema.json" },
      permissions: ["actor.read", "actor.updateOwned", "dice.roll", "chat.write"]
    }),
    { systemId: "stellar-frontiers", actorType: "character", componentId: "StellarFrontiersSheet" }
  ),
  { systemId: "stellar-frontiers", id: "tech", label: "Tech Check", formula: "1d20 + @aptitudes.tech" }
);
