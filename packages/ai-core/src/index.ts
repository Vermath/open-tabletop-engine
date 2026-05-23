import type { AiUsageMetrics, EngineState, MapAsset, PermissionName, ProposalChange, Visibility } from "@open-tabletop/core";

export interface AiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  parts?: AiMessagePart[];
}

export type AiReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

export type AiMessagePart =
  | { type: "text"; text: string }
  | { type: "image_url"; imageUrl: string; mimeType?: string; detail?: "low" | "high" | "auto" };

export interface AiBoardCaptureRequest {
  sceneId?: string;
}

export type AiBoardCaptureResult =
  | {
      status: "captured";
      captureId: string;
      imageUrl: string;
      expiresAt: string;
      sceneId?: string;
      width?: number;
      height?: number;
      mimeType: "image/png";
    }
  | {
      status: "board_capture_unavailable" | "failed";
      reason: string;
      sceneId?: string;
    };

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
  additionalProperties?: boolean | AiToolJsonSchema;
}

export interface AiToolJsonSchema {
  type?: string | string[];
  description?: string;
  enum?: string[];
  items?: AiToolJsonSchema;
  properties?: Record<string, AiToolJsonSchema>;
  required?: string[];
  additionalProperties?: boolean | AiToolJsonSchema;
}

type AiRulesSaveOutcome = "success" | "failure";

export interface AiToolContext {
  campaignId: string;
  userId: string;
  permissions: PermissionName[];
  state: EngineState;
  createProposal(input: { title: string; summary: string; changes: ProposalChange[] }): Promise<string>;
  listProposals?(input: { status?: string; limit?: number }): Promise<unknown>;
  getProposal?(input: { proposalId: string }): Promise<unknown>;
  reviseProposal?(input: { proposalId: string; title?: string; summary?: string; changes?: ProposalChange[] }): Promise<unknown>;
  applyApprovedProposal?(input: { proposalId: string }): Promise<unknown>;
  createMemory(input: { text: string; visibility: Visibility; sourceIds: string[] }): Promise<string>;
  generateImageAsset(input: {
    kind: "map" | "token";
    prompt: string;
    name: string;
    folder: string;
    tags: string[];
    size?: string;
    quality?: string;
    outputFormat?: "png" | "jpeg" | "webp";
  }): Promise<{ asset: MapAsset; provider: string; model?: string; revisedPrompt?: string; sourcePrompt: string } | { error: string; message?: string; [key: string]: unknown }>;
  rollDice(input: { formula: string; label?: string; visibility: "public" | "gm_only" | "whisper" }): Promise<{ rollId: string; formula: string; label?: string; total: number; visibility: string }>;
  useActorAction(input: { actorId: string; actionRollId?: string; actionName?: string; targetActorId?: string; applyEffect?: boolean; spellSlotLevel?: number; resourceAmount?: number; useFreeResource?: boolean; saveOutcomes?: Record<string, AiRulesSaveOutcome>; visibility: "public" | "gm_only" | "whisper" }): Promise<{
    proposalId: string;
    changeCount: number;
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
    effect?: { type: "damage" | "healing" | "condition" | "utility"; targetActorId: string; targetActorName: string; pool?: string; amount?: number; before?: number | string[]; after?: number | string[]; max?: number; damageType?: string; damageTypes?: string[]; effectChoice?: string; choiceKind?: string; resistance?: string[]; immunity?: string[]; vulnerability?: string[]; duration?: string; conditionId?: string; conditionName?: string; alreadyPresent?: boolean };
    effects?: Array<{ type: "damage" | "healing" | "condition" | "utility"; targetActorId: string; targetActorName: string; pool?: string; amount?: number; before?: number | string[]; after?: number | string[]; max?: number; damageType?: string; damageTypes?: string[]; effectChoice?: string; choiceKind?: string; resistance?: string[]; immunity?: string[]; vulnerability?: string[]; duration?: string; conditionId?: string; conditionName?: string; alreadyPresent?: boolean }>;
    resolution?: unknown;
  } | { error: string; permission?: PermissionName; [key: string]: unknown }>;
  captureBoardView?(input: AiBoardCaptureRequest): Promise<AiBoardCaptureResult>;
}

export interface AiProvider {
  id: string;
  label: string;
  executesToolsInTurn?: boolean;
  stream(input: AiProviderRequest): AsyncIterable<AiProviderEvent>;
}

export interface AiProviderRequest {
  threadId: string;
  messages: AiMessage[];
  tools: AiToolDefinition[];
  context: PermissionFilteredContext;
  model?: string;
  reasoningEffort?: AiReasoningEffort;
  surface?: string;
  executeTool?: (toolName: string, input: unknown) => Promise<unknown>;
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
  const canReadJournalSecrets = input.permissions.includes("journal.readSecret");
  const canReadMemorySecrets = canReadJournalSecrets || input.permissions.includes("ai.readGmMemory");
  const canReadActors = input.permissions.includes("actor.read");
  const canReadScenes = input.permissions.includes("scene.read");
  const canReadCampaign = input.permissions.includes("campaign.read");
  const journals = input.state.journals.filter((item) => item.campaignId === input.campaignId);
  const visibleJournals = journals.filter((item) => item.visibility === "public" || canReadJournalSecrets);
  const memory = input.state.aiMemory
    .filter((item) => item.campaignId === input.campaignId)
    .filter((item) => item.visibility === "public" || canReadMemorySecrets)
    .map((item) => ({ text: item.text, visibility: item.visibility, sourceIds: item.sourceIds }));

  return {
    campaignId: input.campaignId,
    publicSummary: `${campaign?.name ?? "Unknown campaign"}: ${visibleJournals.map((item) => item.title).join(", ")}`,
    gmSecrets: canReadJournalSecrets ? journals.filter((item) => item.visibility === "gm_only").map((item) => item.body) : [],
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
