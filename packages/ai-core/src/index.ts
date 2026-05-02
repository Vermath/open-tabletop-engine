import type { AiUsageMetrics, EngineState, PermissionName, ProposalChange, Visibility } from "@open-tabletop/core";
export { OpenAiResponsesProvider, type OpenAiResponsesProviderOptions } from "./openai-responses-provider.js";

export interface AiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface AiToolDefinition<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  requiredPermissions: PermissionName[];
  parameters?: AiToolParameterSchema;
  execute(input: TInput, context: AiToolContext): Promise<TOutput>;
}

export interface AiToolParameterSchema {
  type: "object";
  properties: Record<string, AiToolJsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface AiToolJsonSchema {
  type?: string | string[];
  description?: string;
  enum?: string[];
  items?: AiToolJsonSchema;
  properties?: Record<string, AiToolJsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface AiToolContext {
  campaignId: string;
  userId: string;
  permissions: PermissionName[];
  state: EngineState;
  createProposal(input: { title: string; summary: string; changes: ProposalChange[] }): Promise<string>;
  createMemory(input: { text: string; visibility: Visibility; sourceIds: string[] }): Promise<string>;
  rollDice(input: { formula: string; label?: string; visibility: "public" | "gm_only" | "whisper" }): Promise<{ rollId: string; formula: string; label?: string; total: number; visibility: string }>;
  useActorAction(input: { actorId: string; actionRollId?: string; actionName?: string; targetActorId?: string; applyEffect?: boolean; spellSlotLevel?: number; visibility: "public" | "gm_only" | "whisper" }): Promise<{
    actorId: string;
    systemId: string;
    actionRollId: string;
    rollId: string;
    formula: string;
    label: string;
    total: number;
    visibility: string;
    slotLevel?: number;
    consumed: Array<{ type: string; key: string; label: string; amount: number; remaining: number }>;
    updatedItems: Array<{ id: string; name: string; quantity?: number }>;
    effect?: { type: "damage" | "healing"; targetActorId: string; targetActorName: string; pool: string; amount: number; before: number; after: number; max: number };
  } | { error: string; permission?: PermissionName; [key: string]: unknown }>;
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
  | { type: "proposal.created"; proposalId: string }
  | { type: "usage.reported"; usage: AiUsageMetrics };

export interface PermissionFilteredContext {
  campaignId: string;
  publicSummary: string;
  gmSecrets: string[];
  memory: Array<{ text: string; visibility: Visibility; sourceIds: string[] }>;
  actors?: Array<{
    id: string;
    name: string;
    type: string;
    summary: string;
    systemId?: string;
    actions?: Array<{ rollId: string; label: string; formula: string }>;
  }>;
  scenes?: Array<{ id: string; name: string; active: boolean }>;
  encounters?: Array<{ id: string; name: string; summary: string; difficulty?: string }>;
}

export function buildPermissionFilteredContext(input: {
  state: EngineState;
  campaignId: string;
  permissions: PermissionName[];
}): PermissionFilteredContext {
  const campaign = input.state.campaigns.find((item) => item.id === input.campaignId);
  const canReadSecrets = input.permissions.includes("journal.readSecret") || input.permissions.includes("ai.readGmMemory");
  const canReadActors = input.permissions.includes("actor.read");
  const canReadScenes = input.permissions.includes("scene.read");
  const canReadCampaign = input.permissions.includes("campaign.read");
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
    memory,
    actors: canReadActors
      ? input.state.actors
          .filter((item) => item.campaignId === input.campaignId)
          .map((item) => {
            const hp = item.data.hp as { current?: number; max?: number } | undefined;
            return {
              id: item.id,
              name: item.name,
              type: item.type,
              summary: hp ? `${item.name} (${hp.current ?? "?"}/${hp.max ?? "?"} HP)` : item.name
            };
          })
      : [],
    scenes: canReadScenes
      ? input.state.scenes.filter((item) => item.campaignId === input.campaignId).map((item) => ({ id: item.id, name: item.name, active: item.active }))
      : [],
    encounters: canReadCampaign
      ? input.state.encounters
          .filter((item) => item.campaignId === input.campaignId)
          .map((item) => ({ id: item.id, name: item.name, summary: item.summary, difficulty: item.difficulty }))
      : []
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
