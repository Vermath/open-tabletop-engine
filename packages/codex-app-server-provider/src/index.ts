import type { AiProvider, AiProviderEvent, AiProviderRequest } from "@open-tabletop/ai-core";

export interface JsonRpcTransport {
  request<TResponse>(method: string, params: unknown): Promise<TResponse>;
}

export interface CodexAppServerProviderOptions {
  transport: JsonRpcTransport;
  approvalMode?: "proposal" | "manual";
}

export class CodexAppServerProvider implements AiProvider {
  id = "codex-app-server";
  label = "Codex App Server";

  constructor(private readonly options: CodexAppServerProviderOptions) {}

  async *stream(input: AiProviderRequest): AsyncIterable<AiProviderEvent> {
    const initialized = await this.options.transport.request<{ sessionId: string }>("initialize", {
      client: "open-tabletop-engine",
      approvalMode: this.options.approvalMode ?? "proposal"
    });
    const turn = await this.options.transport.request<{ events: AiProviderEvent[] }>("turn/start", {
      sessionId: initialized.sessionId,
      threadId: input.threadId,
      messages: input.messages,
      tools: input.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        requiredPermissions: tool.requiredPermissions,
        parameters: tool.parameters
      })),
      context: input.context
    });

    for (const event of turn.events) {
      yield event;
    }
  }
}

export class LoopbackCodexTransport implements JsonRpcTransport {
  async request<TResponse>(method: string, params: unknown): Promise<TResponse> {
    if (method === "initialize") return { sessionId: "codex_loopback" } as TResponse;
    if (method === "turn/start") {
      const events: AiProviderEvent[] = [];
      if (shouldRequestProposalTool(params)) {
        events.push({
          type: "tool.started",
          toolName: "create_proposal",
          input: {
            title: "Codex Loopback Proposal",
            summary: "Codex loopback requested a GM-approved prep proposal.",
            changes: [
              {
                entity: "journal",
                action: "create",
                data: {
                  campaignId: campaignIdFromParams(params),
                  title: "Codex Loopback Prep",
                  body: "The loopback provider proposed this prep note.",
                  visibility: "gm_only",
                  visibleToUserIds: [],
                  visibleToActorIds: [],
                  tags: ["ai", "codex-loopback"],
                  createdBy: "codex-app-server",
                  updatedBy: "codex-app-server"
                }
              }
            ]
          }
        });
      }
      if (shouldRequestEncounterTool(params)) {
        events.push({
          type: "tool.started",
          toolName: "draft_encounter",
          input: {
            name: "Loopback Vault Sentinel",
            summary: "A test encounter drafted through the AI tool path.",
            difficulty: "medium"
          }
        });
      }
      if (shouldRequestMemoryTool(params)) {
        events.push({
          type: "tool.started",
          toolName: "create_memory",
          input: {
            text: "Loopback memory: the obsidian key hums near the vault door.",
            visibility: "gm_only"
          }
        });
      }
      if (shouldRequestRollTool(params)) {
        events.push({
          type: "tool.started",
          toolName: "roll_dice",
          input: {
            formula: "1d20+4",
            label: "Loopback Perception"
          }
        });
      }
      if (shouldRequestCompendiumTool(params)) {
        events.push({
          type: "tool.started",
          toolName: "read_compendium",
          input: {
            systemId: "generic-fantasy"
          }
        });
      }
      events.push({
        type: "message.completed",
        content: memoryExtractionContent(params) ?? `Codex loopback handled ${method} with ${JSON.stringify(params).slice(0, 160)}`
      });
      return { events } as TResponse;
    }
    return {
      events: [
        {
          type: "message.completed",
          content: `Codex loopback handled ${method} with ${JSON.stringify(params).slice(0, 160)}`
        }
      ]
    } as TResponse;
  }
}

function shouldRequestProposalTool(params: unknown): boolean {
  if (!hasTool(params, "create_proposal")) return false;
  const prompt = promptFromParams(params);
  return /\bproposal\b|\bpropose\b|\bprep\b/i.test(prompt);
}

function shouldRequestEncounterTool(params: unknown): boolean {
  return hasTool(params, "draft_encounter") && /\bencounter\b/i.test(promptFromParams(params));
}

function shouldRequestMemoryTool(params: unknown): boolean {
  return hasTool(params, "create_memory") && /\bmemory\b/i.test(promptFromParams(params));
}

function shouldRequestRollTool(params: unknown): boolean {
  return hasTool(params, "roll_dice") && /\broll\b|\bdice\b/i.test(promptFromParams(params));
}

function shouldRequestCompendiumTool(params: unknown): boolean {
  return hasTool(params, "read_compendium") && /\bcompendium\b|\bspell\b|\bcondition\b|\bitem\b/i.test(promptFromParams(params));
}

function hasTool(params: unknown, toolName: string): boolean {
  if (!isRecord(params)) return false;
  return Array.isArray(params.tools) && params.tools.some((tool) => isRecord(tool) && tool.name === toolName);
}

function memoryExtractionContent(params: unknown): string | undefined {
  const prompt = promptFromParams(params);
  const marker = "Extract durable campaign memory from this source text:";
  if (!prompt.includes(marker)) return undefined;
  const sourceText = prompt.slice(prompt.indexOf(marker) + marker.length).trim();
  if (!sourceText) return "Extracted memory: No source text was provided.";
  return `Extracted memory: ${sourceText.slice(0, 240)}`;
}

function promptFromParams(params: unknown): string {
  if (!isRecord(params) || !Array.isArray(params.messages)) return "";
  return params.messages
    .filter(isRecord)
    .map((message) => (typeof message.content === "string" ? message.content : ""))
    .join(" ");
}

function campaignIdFromParams(params: unknown): string {
  if (!isRecord(params) || !isRecord(params.context) || typeof params.context.campaignId !== "string") return "unknown_campaign";
  return params.context.campaignId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
