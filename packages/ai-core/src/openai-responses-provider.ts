import type { AiUsageMetrics } from "@open-tabletop/core";
import type { AiProvider, AiProviderEvent, AiProviderRequest, AiToolDefinition, AiToolParameterSchema, PermissionFilteredContext } from "./index";

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_MODEL = "gpt-5-mini";
const DEFAULT_OPENAI_TIMEOUT_MS = 30_000;

export interface OpenAiResponsesProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  organization?: string;
  project?: string;
  maxOutputTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

interface OpenAiResponsesRequest {
  model: string;
  input: string;
  instructions: string;
  tools?: OpenAiToolDefinition[];
  max_output_tokens?: number;
  temperature?: number;
}

interface OpenAiToolDefinition {
  type: "function";
  name: string;
  description: string;
  parameters: AiToolParameterSchema;
}

export class OpenAiResponsesProvider implements AiProvider {
  id = "openai-responses";
  label = "OpenAI Responses API";

  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: OpenAiResponsesProviderOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_OPENAI_BASE_URL;
    this.model = options.model ?? DEFAULT_OPENAI_MODEL;
    this.timeoutMs = normalizedTimeoutMs(options.timeoutMs);
    this.fetchImpl = options.fetch ?? fetch;
  }

  async *stream(input: AiProviderRequest): AsyncIterable<AiProviderEvent> {
    if (!this.options.apiKey) {
      yield {
        type: "message.completed",
        content: "OpenAI Responses provider is not configured. Set OPENAI_API_KEY before selecting OTTE_AI_PROVIDER=openai-responses."
      };
      return;
    }

    const timeout = requestTimeout(this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(openAiResponsesEndpoint(this.baseUrl), {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(this.requestBody(input)),
        signal: timeout.signal
      });
    } catch (error) {
      if (timeout.signal?.aborted) throw new Error(`OpenAI Responses API request timed out after ${this.timeoutMs}ms`);
      throw error;
    } finally {
      timeout.cleanup();
    }

    if (!response.ok) {
      throw new Error(`OpenAI Responses API request failed with ${response.status}: ${(await response.text()).slice(0, 500)}`);
    }

    const payload: unknown = await response.json();
    for (const event of eventsFromOpenAiResponse(payload)) {
      yield event;
    }
  }

  private headers(): Headers {
    const headers = new Headers({
      authorization: `Bearer ${this.options.apiKey}`,
      "content-type": "application/json"
    });
    if (this.options.organization) headers.set("OpenAI-Organization", this.options.organization);
    if (this.options.project) headers.set("OpenAI-Project", this.options.project);
    return headers;
  }

  private requestBody(input: AiProviderRequest): OpenAiResponsesRequest {
    const body: OpenAiResponsesRequest = {
      model: this.model,
      instructions: instructionsFromContext(input.context),
      input: input.messages.map((message) => `${message.role}: ${message.content}`).join("\n\n")
    };
    if (input.tools.length > 0) body.tools = input.tools.map(toOpenAiToolDefinition);
    if (this.options.maxOutputTokens !== undefined) body.max_output_tokens = this.options.maxOutputTokens;
    if (this.options.temperature !== undefined) body.temperature = this.options.temperature;
    return body;
  }
}

function instructionsFromContext(context: PermissionFilteredContext): string {
  const memory = context.memory.map((item) => `- [${item.visibility}] ${item.text}`).join("\n") || "- No stored memory visible to this user.";
  const gmSecrets = context.gmSecrets.map((secret) => `- ${secret}`).join("\n") || "- No GM-only secrets are visible to this user.";
  const actors =
    context.actors
      ?.map((actor) => {
        const actions = actor.actions?.length ? ` actions: ${actor.actions.map((action) => `${action.label} [${action.rollId}] ${action.formula}`).join("; ")}` : "";
        return `- ${actor.summary} (${actor.type}${actor.systemId ? `, ${actor.systemId}` : ""})${actions}`;
      })
      .join("\n") || "- No actors are visible to this caller.";
  const scenes = context.scenes?.map((scene) => `- ${scene.name}${scene.active ? " (active)" : ""}`).join("\n") || "- No scenes are visible to this caller.";
  const encounters = context.encounters?.map((encounter) => `- ${encounter.name}: ${encounter.summary}${encounter.difficulty ? ` [${encounter.difficulty}]` : ""}`).join("\n") || "- No encounters are visible to this caller.";
  return [
    "You are OpenTabletop Engine's in-game tabletop assistant.",
    "Answer using only the permission-filtered campaign context below.",
    "Never reveal, infer, or invent GM-only information that is not present in the visible context.",
    "Do not fill missing rules, compendium, campaign, or character details from outside knowledge; use visible compendium tools or ask for clarification.",
    "Prefer concrete tabletop artifacts: proposed journal notes, encounter drafts, memory facts, compendium lookups, and dice rolls.",
    "When changing campaign state, call an available function tool instead of claiming a change was already applied.",
    "Campaign edit tools create reviewable proposals; do not say a scene, actor, journal, token, encounter, or memory changed until the tool result says it was approved or created.",
    "When using actor actions, choose only exact visible action ids from the context; if the needed actor, target, scene, or action is not visible, ask for clarification instead of guessing.",
    "If a tool returns a permission error, explain that the action needs GM approval or a different role.",
    "",
    `Campaign: ${context.campaignId}`,
    `Public context: ${context.publicSummary || "No public context was available."}`,
    "Visible actors:",
    actors,
    "Visible scenes:",
    scenes,
    "Visible encounters:",
    encounters,
    "Visible memory:",
    memory,
    "GM-only context visible to this caller:",
    gmSecrets
  ].join("\n");
}

function toOpenAiToolDefinition(tool: AiToolDefinition): OpenAiToolDefinition {
  return {
    type: "function",
    name: tool.name,
    description: `${tool.description} Required OpenTabletop permissions: ${tool.requiredPermissions.join(", ") || "none"}.`,
    parameters: tool.parameters ?? {
      type: "object",
      properties: {},
      additionalProperties: true
    }
  };
}

function eventsFromOpenAiResponse(payload: unknown): AiProviderEvent[] {
  const events: AiProviderEvent[] = [];
  const textParts: string[] = [];
  const usage = usageFromOpenAiResponse(payload);
  if (usage) events.push({ type: "usage.reported", usage });

  if (isRecord(payload) && Array.isArray(payload.output)) {
    for (const item of payload.output) {
      if (!isRecord(item)) continue;
      if (item.type === "function_call" && typeof item.name === "string") {
        events.push({ type: "tool.started", toolName: item.name, input: parseFunctionArguments(item.arguments) });
      }
      if (Array.isArray(item.content)) {
        for (const part of item.content) {
          const text = textFromContentPart(part);
          if (text) textParts.push(text);
        }
      }
    }
  }

  if (textParts.length === 0 && isRecord(payload) && typeof payload.output_text === "string") {
    textParts.push(payload.output_text);
  }

  const content = textParts.join("").trim();
  if (content) events.push({ type: "message.completed", content });
  return events;
}

function usageFromOpenAiResponse(payload: unknown): AiUsageMetrics | undefined {
  if (!isRecord(payload) || !isRecord(payload.usage)) return undefined;
  const usage: AiUsageMetrics = {};
  const inputTokens = numberFromRecord(payload.usage, "input_tokens");
  const outputTokens = numberFromRecord(payload.usage, "output_tokens");
  const totalTokens = numberFromRecord(payload.usage, "total_tokens");
  if (inputTokens !== undefined) usage.inputTokens = inputTokens;
  if (outputTokens !== undefined) usage.outputTokens = outputTokens;
  if (totalTokens !== undefined) usage.totalTokens = totalTokens;
  if (usage.inputTokens === undefined && usage.outputTokens === undefined && usage.totalTokens === undefined) return undefined;
  return usage;
}

function textFromContentPart(part: unknown): string | undefined {
  if (!isRecord(part)) return undefined;
  if (typeof part.text === "string") return part.text;
  if (isRecord(part.text) && typeof part.text.value === "string") return part.text.value;
  return undefined;
}

function parseFunctionArguments(value: unknown): unknown {
  if (value === undefined || value === null || value === "") return {};
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return { rawArguments: value };
  }
}

function openAiResponsesEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return trimmed.endsWith("/responses") ? trimmed : `${trimmed}/responses`;
}

function normalizedTimeoutMs(value: number | undefined): number | undefined {
  if (value === undefined) return DEFAULT_OPENAI_TIMEOUT_MS;
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return Math.floor(value);
}

function requestTimeout(timeoutMs: number | undefined): { signal?: AbortSignal; cleanup(): void } {
  if (timeoutMs === undefined) return { cleanup() {} };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timer);
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberFromRecord(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
