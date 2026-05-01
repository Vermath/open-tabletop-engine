import type { AiProvider, AiProviderEvent, AiProviderRequest, AiToolDefinition, PermissionFilteredContext } from "./index";

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_OPENAI_MODEL = "gpt-5-mini";

export interface OpenAiResponsesProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  organization?: string;
  project?: string;
  maxOutputTokens?: number;
  temperature?: number;
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
  parameters: {
    type: "object";
    properties: Record<string, never>;
    additionalProperties: true;
  };
}

export class OpenAiResponsesProvider implements AiProvider {
  id = "openai-responses";
  label = "OpenAI Responses API";

  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: OpenAiResponsesProviderOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_OPENAI_BASE_URL;
    this.model = options.model ?? DEFAULT_OPENAI_MODEL;
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

    const response = await this.fetchImpl(openAiResponsesEndpoint(this.baseUrl), {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(this.requestBody(input))
    });

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
  return [
    "You are OpenTabletop Engine's in-game tabletop assistant.",
    "Answer using only the permission-filtered campaign context below.",
    "When changing campaign state, call an available function tool instead of claiming a change was already applied.",
    "",
    `Campaign: ${context.campaignId}`,
    `Public context: ${context.publicSummary || "No public context was available."}`,
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
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: true
    }
  };
}

function eventsFromOpenAiResponse(payload: unknown): AiProviderEvent[] {
  const events: AiProviderEvent[] = [];
  const textParts: string[] = [];

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
