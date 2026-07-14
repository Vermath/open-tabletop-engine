import {
  aiMemoryFactStatus,
  type AiCitation,
  type AiCitationClaim,
  type AiCitationWarning,
  type AiContextScope,
  type AiSourceReference,
  type AiUsageMetrics,
  type EngineState,
  type MapAsset,
  type PermissionName,
  type ProposalChange,
  type Visibility,
} from "@open-tabletop/core";

export interface AiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  parts?: AiMessagePart[];
}

export type AiReasoningEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh";

export type AiMessagePart =
  | { type: "text"; text: string }
  | {
      type: "image_url";
      imageUrl: string;
      mimeType?: string;
      detail?: "low" | "high" | "auto";
    };

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
  signal?: AbortSignal;
  createProposal(input: {
    title: string;
    summary: string;
    changes: ProposalChange[];
  }): Promise<string>;
  listProposals?(input: { status?: string; limit?: number }): Promise<unknown>;
  getProposal?(input: { proposalId: string }): Promise<unknown>;
  reviseProposal?(input: {
    proposalId: string;
    title?: string;
    summary?: string;
    changes?: ProposalChange[];
  }): Promise<unknown>;
  applyApprovedProposal?(input: { proposalId: string }): Promise<unknown>;
  createMemory(input: {
    text: string;
    visibility: Visibility;
    sourceIds: string[];
  }): Promise<string>;
  generateImageAsset(input: {
    kind: "map" | "token";
    prompt: string;
    name: string;
    folder: string;
    tags: string[];
    size?: string;
    quality?: string;
    outputFormat?: "png" | "jpeg" | "webp";
    sourceImageUrl?: string;
    sourceImageMimeType?: string;
  }): Promise<
    | {
        asset: MapAsset;
        provider: string;
        model?: string;
        revisedPrompt?: string;
        sourcePrompt: string;
      }
    | { error: string; message?: string; [key: string]: unknown }
  >;
  rollDice(input: {
    formula: string;
    label?: string;
    visibility: "public" | "gm_only" | "whisper";
  }): Promise<{
    rollId: string;
    formula: string;
    label?: string;
    total: number;
    visibility: string;
  }>;
  sendChatMessage?(input: {
    body: string;
    sceneId?: string;
    type?: string;
    visibility: "public" | "gm_only" | "whisper";
    recipientUserIds: string[];
  }): Promise<unknown>;
  targetToken?(input: { tokenId: string; targeted: boolean }): Promise<unknown>;
  useActorAction(input: {
    actorId: string;
    actionRollId?: string;
    actionName?: string;
    targetActorId?: string;
    applyEffect?: boolean;
    spellSlotLevel?: number;
    resourceAmount?: number;
    useFreeResource?: boolean;
    saveOutcomes?: Record<string, AiRulesSaveOutcome>;
    visibility: "public" | "gm_only" | "whisper";
  }): Promise<
    | {
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
        consumed: Array<{
          type: string;
          key: string;
          label: string;
          amount: number;
          remaining: number;
        }>;
        updatedItems: Array<{ id: string; name: string; quantity?: number }>;
        effect?: {
          type: "damage" | "healing" | "condition" | "utility";
          targetActorId: string;
          targetActorName: string;
          pool?: string;
          amount?: number;
          before?: number | string[];
          after?: number | string[];
          max?: number;
          damageType?: string;
          damageTypes?: string[];
          effectChoice?: string;
          choiceKind?: string;
          resistance?: string[];
          immunity?: string[];
          vulnerability?: string[];
          duration?: string;
          conditionId?: string;
          conditionName?: string;
          alreadyPresent?: boolean;
        };
        effects?: Array<{
          type: "damage" | "healing" | "condition" | "utility";
          targetActorId: string;
          targetActorName: string;
          pool?: string;
          amount?: number;
          before?: number | string[];
          after?: number | string[];
          max?: number;
          damageType?: string;
          damageTypes?: string[];
          effectChoice?: string;
          choiceKind?: string;
          resistance?: string[];
          immunity?: string[];
          vulnerability?: string[];
          duration?: string;
          conditionId?: string;
          conditionName?: string;
          alreadyPresent?: boolean;
        }>;
        resolution?: unknown;
      }
    | { error: string; permission?: PermissionName; [key: string]: unknown }
  >;
  captureBoardView?(
    input: AiBoardCaptureRequest,
  ): Promise<AiBoardCaptureResult>;
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
  signal?: AbortSignal;
  executeTool?: (toolName: string, input: unknown) => Promise<unknown>;
}

export type AiProviderEvent =
  | { type: "message.delta"; delta: string }
  | { type: "message.completed"; content: string; citations?: AiCitationClaim[]; requiresOpenRulesCitation?: boolean }
  | { type: "reasoning.delta"; delta: string; summaryIndex?: number }
  | { type: "reasoning.completed"; content: string }
  | {
      type: "activity.reported";
      message: string;
      itemType?: string;
      itemId?: string;
      status?: "started" | "completed" | "failed";
    }
  | { type: "tool.started"; toolName: string; input: unknown }
  | { type: "tool.completed"; toolName: string; output: unknown }
  | { type: "proposal.created"; proposalId: string }
  | { type: "proposal.applied"; proposalId: string }
  | { type: "usage.reported"; usage: AiUsageMetrics };

export interface PermissionFilteredContext {
  campaignId: string;
  /** Exact source registry available for structured citation validation. */
  sources?: AiSourceReference[];
  /** Campaign-authored/imported text is always isolated in an explicit data envelope. */
  contentBlocks?: AiContextContentBlock[];
  publicSummary: string;
  gmSecrets: string[];
  memory: Array<{ text: string; visibility: Visibility; sourceIds: string[] }>;
  actors?: Array<{
    id: string;
    name: string;
    type: string;
    summary: string;
    systemId: string;
    privateDataVisible: boolean;
    actions?: Array<{ rollId: string; label: string; formula: string }>;
  }>;
  scenes?: Array<{ id: string; name: string; active: boolean }>;
  encounters?: Array<{
    id: string;
    name: string;
    summary: string;
    difficulty?: string;
  }>;
}

export interface AiContextContentBlock {
  sourceId: string;
  content: string;
  boundary: "authoritative_data" | "untrusted_data";
}

/**
 * Produces the provider payload without duplicating campaign prose in legacy
 * convenience fields. Text is present only inside explicitly labelled data
 * blocks and is never represented as provider/system instructions.
 */
export function permissionFilteredContextForProvider(context: PermissionFilteredContext): Record<string, unknown> {
  return {
    campaignId: context.campaignId,
    sourceRegistry: context.sources ?? [],
    contentBlocks: context.contentBlocks ?? [],
    structured: {
      actors: context.actors?.map(({ summary: _summary, name: _name, ...actor }) => actor) ?? [],
      scenes: context.scenes?.map(({ name: _name, ...scene }) => scene) ?? [],
      encounters: context.encounters?.map(({ name: _name, summary: _summary, ...encounter }) => encounter) ?? []
    }
  };
}

export function filterPermissionFilteredContextByScopes(
  context: PermissionFilteredContext,
  scopes: readonly AiContextScope[]
): PermissionFilteredContext {
  const allowed = new Set(scopes);
  const retainedSources = (context.sources ?? []).filter((source) => allowed.has(source.visibility));
  const retainedIds = new Set(retainedSources.map((source) => source.id));
  const sourceVisible = (prefix: string, id: string) => {
    const sourceId = `${prefix}:${id}`;
    return !context.sources?.some((source) => source.id === sourceId) || retainedIds.has(sourceId);
  };
  return {
    ...context,
    sources: retainedSources,
    contentBlocks: (context.contentBlocks ?? []).filter((block) => retainedIds.has(block.sourceId)),
    gmSecrets: allowed.has("gm_private") ? context.gmSecrets : [],
    memory: context.memory.filter((item) => item.visibility !== "gm_only" || allowed.has("gm_private")),
    actors: context.actors?.filter((actor) => sourceVisible("actor", actor.id)),
    scenes: context.scenes?.filter((scene) => sourceVisible("scene", scene.id)),
    encounters: context.encounters?.filter((encounter) => sourceVisible("encounter", encounter.id))
  };
}

export function validateAiCitationClaims(
  claims: readonly AiCitationClaim[] | undefined,
  registry: readonly AiSourceReference[]
): AiCitation[] {
  const sources = new Map(registry.map((source) => [source.id, source]));
  return (claims ?? []).map((claim) => {
    const source = sources.get(claim.sourceId);
    if (!source) return { ...claim, status: "unsupported", reason: "unknown_source" };
    if (claim.locator !== undefined && claim.locator !== source.locator) {
      return { ...claim, status: "unsupported", reason: "locator_mismatch" };
    }
    return { ...claim, status: "verified", source };
  });
}

export function aiCitationWarnings(input: {
  citations: readonly AiCitation[];
  requiresOpenRulesCitation?: boolean;
}): AiCitationWarning[] {
  const warnings: AiCitationWarning[] = [];
  if (input.citations.some((citation) => citation.status === "unsupported")) {
    warnings.push({
      code: "unsupported_citation",
      message: "One or more model citations were not present in the permission-filtered source registry."
    });
  }
  if (
    input.requiresOpenRulesCitation &&
    !input.citations.some(
      (citation) => citation.status === "verified" && citation.source?.kind === "official_open_rules"
    )
  ) {
    warnings.push({
      code: "rules_answer_without_verified_open_rules_citation",
      message: "This rules answer does not include a verified citation to the open-rules source returned for this turn."
    });
  }
  return warnings;
}

export function buildPermissionFilteredContext(input: {
  state: EngineState;
  campaignId: string;
  userId: string;
  permissions: PermissionName[];
}): PermissionFilteredContext {
  const campaign = input.state.campaigns.find(
    (item) => item.id === input.campaignId,
  );
  const canReadJournalSecrets =
    input.permissions.includes("journal.readSecret");
  const canReadJournals = input.permissions.includes("journal.read");
  const canReadPublicMemory =
    input.permissions.includes("ai.readPublicMemory");
  const canReadMemorySecrets = input.permissions.includes("ai.readGmMemory");
  const canReadActors = input.permissions.includes("actor.read");
  const canReadScenes = input.permissions.includes("scene.read");
  const canReadCampaign = input.permissions.includes("campaign.read");
  const canReadPreparedScenes =
    input.permissions.includes("campaign.update") ||
    input.permissions.includes("scene.create") ||
    input.permissions.includes("scene.update") ||
    input.permissions.includes("scene.delete") ||
    input.permissions.includes("scene.activate");
  const canReadPreparedActors =
    input.permissions.includes("campaign.update") ||
    input.permissions.includes("actor.create") ||
    input.permissions.includes("actor.update") ||
    input.permissions.includes("actor.delete") ||
    input.permissions.includes("actor.readPrivate");
  const canReadPreparedEncounters =
    input.permissions.includes("campaign.update") ||
    input.permissions.includes("combat.manage");
  const ownedActorIds = new Set(
    input.state.actors
      .filter(
        (actor) =>
          actor.campaignId === input.campaignId &&
          actor.ownerUserId === input.userId,
      )
      .map((actor) => actor.id),
  );
  const activeSceneIds = new Set(
    input.state.scenes
      .filter((scene) => scene.campaignId === input.campaignId && scene.active)
      .map((scene) => scene.id),
  );
  const revealedActorIds = new Set(
    input.state.tokens
      .filter(
        (token) =>
          activeSceneIds.has(token.sceneId) &&
          !token.hidden &&
          token.layer !== "gm" &&
          token.actorId,
      )
      .map((token) => token.actorId!),
  );
  const journals = canReadJournals
    ? input.state.journals.filter(
        (item) => item.campaignId === input.campaignId,
      )
    : [];
  const visibleJournals = journals.filter(
    (item) =>
      item.visibility === "public" ||
      item.visibleToUserIds.includes(input.userId) ||
      item.visibleToActorIds.some((actorId) => ownedActorIds.has(actorId)) ||
      canReadJournalSecrets,
  );
  const memory = input.state.aiMemory
    .filter((item) => item.campaignId === input.campaignId)
    .filter((item) => aiMemoryFactStatus(item) === "approved")
    .filter((item) =>
      item.visibility === "public"
        ? canReadPublicMemory || canReadMemorySecrets
        : canReadMemorySecrets,
    )
    .map((item) => ({
      text: item.text,
      visibility: item.visibility,
      sourceIds: item.sourceIds,
    }));

  const sources: AiSourceReference[] = [];
  const contentBlocks: AiContextContentBlock[] = [];
  const addContent = (source: AiSourceReference, content: string) => {
    sources.push(source);
    contentBlocks.push({
      sourceId: source.id,
      content,
      boundary: source.trust === "authoritative_open_rules" ? "authoritative_data" : "untrusted_data"
    });
  };

  if (canReadCampaign && campaign) {
    addContent(
      {
        id: `campaign:${campaign.id}`,
        kind: "campaign_note",
        title: campaign.name,
        locator: `campaign:${campaign.id}`,
        visibility: "public",
        trust: "untrusted_campaign_content"
      },
      `${campaign.name}\n${campaign.description}`.trim()
    );
  }
  for (const journal of visibleJournals) {
    const canonical = journal.canonStatus === "canonical";
    addContent(
      {
        id: `journal:${journal.id}`,
        kind: canonical ? "campaign_canon" : "campaign_note",
        title: journal.title,
        locator: `journal:${journal.id}@revision:${journal.revision ?? 1}`,
        visibility: journal.visibility === "gm_only" ? "gm_private" : "public",
        trust: canonical ? "reviewed_canon" : "untrusted_campaign_content"
      },
      `${journal.title}\n${journal.body}`.trim()
    );
  }
  for (const item of input.state.aiMemory
    .filter((entry) => entry.campaignId === input.campaignId)
    .filter((entry) => aiMemoryFactStatus(entry) === "approved")
    .filter((entry) =>
      entry.visibility === "public"
        ? canReadPublicMemory || canReadMemorySecrets
        : canReadMemorySecrets
    )) {
    addContent(
      {
        id: `memory:${item.id}`,
        kind: "campaign_canon",
        title: item.subject?.trim() || "Reviewed campaign memory",
        locator: `ai-memory:${item.id}`,
        visibility: item.visibility === "gm_only" ? "gm_private" : "public",
        trust: "reviewed_canon"
      },
      item.text
    );
  }

  return {
    campaignId: input.campaignId,
    sources,
    contentBlocks,
    publicSummary: `${canReadCampaign ? (campaign?.name ?? "Unknown campaign") : "Campaign"}: ${visibleJournals.map((item) => item.title).join(", ")}`,
    gmSecrets: canReadJournals && canReadJournalSecrets
      ? journals
          .filter((item) => item.visibility === "gm_only")
          .map((item) => item.body)
      : [],
    memory,
    actors: canReadActors
      ? input.state.actors
          .filter((item) => item.campaignId === input.campaignId)
          .filter(
            (item) =>
              canReadPreparedActors ||
              ownedActorIds.has(item.id) ||
              revealedActorIds.has(item.id) ||
              item.permissions[input.userId]?.includes("actor.readPrivate") ===
                true ||
              item.permissions[input.userId]?.includes("actor.read") === true,
          )
          .map((item) => {
            const privateDataVisible =
              input.permissions.includes("actor.readPrivate") ||
              item.ownerUserId === input.userId ||
              item.permissions[input.userId]?.includes("actor.readPrivate") ===
                true;
            const hp = privateDataVisible
              ? (item.data.hp as { current?: number; max?: number } | undefined)
              : undefined;
            const summary = hp
              ? `${item.name} (${hp.current ?? "?"}/${hp.max ?? "?"} HP)`
              : item.name;
            addContent(
              {
                id: `actor:${item.id}`,
                kind: "actor",
                title: item.name,
                locator: `actor:${item.id}@updated:${item.updatedAt}`,
                visibility: privateDataVisible ? "gm_private" : "public",
                trust: "untrusted_campaign_content"
              },
              summary
            );
            return {
              id: item.id,
              name: item.name,
              type: item.type,
              systemId: item.systemId,
              privateDataVisible,
              summary,
            };
          })
      : [],
    scenes: canReadScenes
      ? input.state.scenes
          .filter(
            (item) =>
              item.campaignId === input.campaignId &&
              (canReadPreparedScenes || item.active),
          )
          .map((item) => {
            addContent(
              {
                id: `scene:${item.id}`,
                kind: "scene",
                title: item.name,
                locator: `scene:${item.id}@updated:${item.updatedAt}`,
                visibility: item.active ? "public" : "gm_private",
                trust: "untrusted_campaign_content"
              },
              item.name
            );
            return { id: item.id, name: item.name, active: item.active };
          })
      : [],
    encounters:
      canReadCampaign && canReadPreparedEncounters
        ? input.state.encounters
            .filter((item) => item.campaignId === input.campaignId)
            .map((item) => {
              addContent(
                {
                  id: `encounter:${item.id}`,
                  kind: "campaign_note",
                  title: item.name,
                  locator: `encounter:${item.id}@updated:${item.updatedAt}`,
                  visibility: "gm_private",
                  trust: "untrusted_campaign_content"
                },
                `${item.name}\n${item.summary}`.trim()
              );
              return { id: item.id, name: item.name, summary: item.summary, difficulty: item.difficulty };
            })
        : [],
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
