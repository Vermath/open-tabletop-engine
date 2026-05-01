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
        requiredPermissions: tool.requiredPermissions
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
