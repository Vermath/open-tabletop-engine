import type { OpenTabletopPlugin } from "@open-tabletop/plugin-sdk";

export const plugin: OpenTabletopPlugin = {
  manifest: {
    id: "example-macro-plugin",
    name: "Example Macro Plugin",
    version: "0.1.0",
    compatibleCore: ">=0.1.0",
    package: { publisher: "OpenTabletop", license: "MIT" },
    entrypoints: { client: "./src/index.ts", server: "./server.sandbox.js" },
    runtime: { apiVersion: "0.1", sandbox: "vm" },
    permissions: ["chat.write", "token.read"],
    ui: { panels: [{ id: "macro-pad", title: "Macro Pad", icon: "wand" }] },
    chatCommands: [
      { command: "/spark", description: "Proposes a sample magical effect." },
    ],
    eventSubscriptions: [
      {
        type: "token.moved",
        description: "Proposes a chat note when a token moves.",
      },
    ],
  },
  activate(context) {
    context.onEvent("token.moved", async (event) => {
      await context.postChatMessage({
        body: `A token moved: ${event.targetId}`,
      });
    });
  },
};
