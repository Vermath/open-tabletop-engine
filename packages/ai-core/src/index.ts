import type { EngineState, PermissionName, ProposalChange, Visibility } from "@open-tabletop/core";

export interface AiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface AiToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  requiredPermissions: PermissionName[];
  execute(input: TInput, context: AiToolContext): Promise<TOutput>;
}

export interface AiToolContext {
  campaignId: string;
  userId: string;
  permissions: PermissionName[];
  state: EngineState;
  createProposal(input: { title: string; summary: string; changes: ProposalChange[] }): Promise<string>;
}

export interface AiProvider {
  id: string;
  label: string;
  stream(input: AiProviderRequest): AsyncIterable<AiProviderEvent>;
}

export interface AiProviderRequest {
  threadId: string;
  messages: AiMessage[];
  tools: AiToolDefinition[];
  context: PermissionFilteredContext;
}

export type AiProviderEvent =
  | { type: "message.delta"; delta: string }
  | { type: "message.completed"; content: string }
  | { type: "tool.started"; toolName: string; input: unknown }
  | { type: "tool.completed"; toolName: string; output: unknown }
  | { type: "proposal.created"; proposalId: string };

export interface PermissionFilteredContext {
  campaignId: string;
  publicSummary: string;
  gmSecrets: string[];
  memory: Array<{ text: string; visibility: Visibility; sourceIds: string[] }>;
}

export function buildPermissionFilteredContext(input: {
  state: EngineState;
  campaignId: string;
  permissions: PermissionName[];
}): PermissionFilteredContext {
  const campaign = input.state.campaigns.find((item) => item.id === input.campaignId);
  const canReadSecrets = input.permissions.includes("journal.readSecret") || input.permissions.includes("ai.readGmMemory");
  const journals = input.state.journals.filter((item) => item.campaignId === input.campaignId);
  const visibleJournals = journals.filter((item) => item.visibility === "public" || canReadSecrets);
  const memory = input.state.aiMemory
    .filter((item) => item.campaignId === input.campaignId)
    .filter((item) => item.visibility === "public" || canReadSecrets)
    .map((item) => ({ text: item.text, visibility: item.visibility, sourceIds: item.sourceIds }));

  return {
    campaignId: input.campaignId,
    publicSummary: `${campaign?.name ?? "Unknown campaign"}: ${visibleJournals.map((item) => item.title).join(", ")}`,
    gmSecrets: canReadSecrets ? journals.filter((item) => item.visibility === "gm_only").map((item) => item.body) : [],
    memory
  };
}

export class EchoAiProvider implements AiProvider {
  id = "local-echo";
  label = "Local Echo";

  async *stream(input: AiProviderRequest): AsyncIterable<AiProviderEvent> {
    const last = input.messages.at(-1)?.content ?? "";
    const content = `Draft response for ${input.context.publicSummary}: ${last}`;
    yield { type: "message.delta", delta: content };
    yield { type: "message.completed", content };
  }
}
