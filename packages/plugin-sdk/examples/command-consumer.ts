import type {
  PluginChatCommandInput,
  PluginChatCommandOutput,
  PluginChatCommandHandler,
  PluginRegisterCommand,
} from "@open-tabletop/plugin-sdk";

// Compile-only: registerCommand is supplied by the API VM, not Node or this SDK.
declare const registerCommand: PluginRegisterCommand;

export function briefing(input: PluginChatCommandInput): PluginChatCommandOutput {
  return {
    body: `Objective: ${input.args.trim() || "Recover the brass compass"}`,
    visibility: "gm_only",
  };
}
registerCommand("/briefing", briefing);

export const asynchronousBriefing: PluginChatCommandHandler = async (
  input,
  context,
) => {
  const receipt = await context.postChatMessage({
    body: `Objective: ${input.args.trim() || "Recover the brass compass"}`,
    visibility: "gm_only",
  });
  return {
    body: `Briefing request: ${receipt}`,
    storage: { set: { lastObjective: input.args }, delete: ["obsolete-objective"] },
  };
};
registerCommand("/briefing-async", asynchronousBriefing);

// Input inspection does not grant capabilities. Runtime policy still applies.
export const campaignTokenNames = (input: PluginChatCommandInput): string[] =>
  input.permissions.includes("token.read")
    ? input.tokens.map((token) => token.name)
    : [];

export const invalidVisibility: PluginChatCommandOutput = {
  body: "A command result",
  // @ts-expect-error VM author output supports only public and gm_only visibility.
  visibility: "private",
};
export const internalEnvelopeIsNotAuthorOutput: PluginChatCommandOutput = {
  body: "A command result",
  // @ts-expect-error Bridge envelopes are collected by the runtime, not returned.
  bridgeRequests: [],
};

export const manifest: import("@open-tabletop/plugin-sdk").PluginManifest = {
  id: "standalone-briefing", name: "Standalone briefing", version: "1.0.0",
  compatibleCore: ">=0.3.0", entrypoints: { server: "server.js" },
  permissions: ["chat.write", "token.move"],
};
export const moveRequest: import("@open-tabletop/plugin-sdk").PluginTokenMoveBatchRequest = {
  expectedSceneUpdatedAt: "2026-09-06T00:00:00.000Z",
  changes: [{ tokenId: "token-example", x: 10, y: 20, expectedUpdatedAt: "2026-09-06T00:00:00.000Z" }],
};
export async function requestMove(context: import("@open-tabletop/plugin-sdk").PluginBridgeContext): Promise<string> {
  return context.moveTokens("scene-example", moveRequest);
}
export const rename: import("@open-tabletop/plugin-sdk").PluginProposalChange = {
  entity: "actor", action: "update", id: "actor-example", data: { name: "New display name" },
};
// @ts-expect-error The host does not grant plugins campaign.update.
export const unsupportedPermission: import("@open-tabletop/plugin-sdk").PluginPermissionName = "campaign.update";
// @ts-expect-error Rules-managed actor creation is not a plugin proposal.
export const unsupportedActorCreate: import("@open-tabletop/plugin-sdk").PluginProposalChange = { entity: "actor", action: "create", data: { name: "Actor" } };
// @ts-expect-error Internal inverse entities are not part of the plugin proposal contract.
export const unsupportedInternalChange: import("@open-tabletop/plugin-sdk").PluginProposalChange = { entity: "aiMemory", action: "delete", data: {} };
