import type { AiMessage, AiProvider, AiProviderEvent, AiProviderRequest, AiReasoningEffort, AiToolParameterSchema, PermissionFilteredContext } from "@open-tabletop/ai-core";

export interface JsonRpcTransport {
  request<TResponse>(method: string, params: unknown): Promise<TResponse>;
}

export interface CodexAppServerProviderOptions {
  transport: JsonRpcTransport;
  approvalMode?: "proposal" | "manual";
  reasoningEffort?: AiReasoningEffort;
}

export interface CodexAppServerWebSocketTransportOptions {
  url?: string;
  cwd?: string;
  model?: string;
  modelProvider?: string;
  reasoningEffort?: AiReasoningEffort;
  serviceName?: string;
  requestTimeoutMs?: number;
  turnTimeoutMs?: number;
  webSocketFactory?: (url: string) => CodexWebSocketLike;
}

export interface CodexAppServerImageGenerationInput {
  prompt: string;
  outputFormat?: "png" | "jpeg" | "webp";
  cwd?: string;
  model?: string;
  modelProvider?: string;
  serviceName?: string;
  baseInstructions?: string;
  developerInstructions?: string;
}

export interface CodexAppServerGeneratedImage {
  base64: string;
  revisedPrompt?: string;
  savedPath?: string;
  status?: string;
}

export interface CodexAppServerLoginStart {
  type: "chatgpt" | "chatgptDeviceCode";
  loginId?: string;
  authUrl?: string;
  verificationUrl?: string;
  userCode?: string;
}

export class CodexAppServerAuthRequiredError extends Error {
  readonly code = "codex_auth_required";

  constructor(readonly login: CodexAppServerLoginStart, message = "Codex app-server ChatGPT sign-in is required.") {
    super(message);
    this.name = "CodexAppServerAuthRequiredError";
  }
}

interface CodexWebSocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: "open" | "message" | "error" | "close", listener: (event: CodexWebSocketEvent) => void): void;
  removeEventListener?(type: "open" | "message" | "error" | "close", listener: (event: CodexWebSocketEvent) => void): void;
}

interface CodexWebSocketEvent {
  data?: unknown;
  message?: string;
  reason?: string;
}

interface CodexTransportTool {
  name: string;
  description: string;
  requiredPermissions: string[];
  parameters?: AiToolParameterSchema;
}

interface CodexProviderTurnStartParams {
  threadId: string;
  messages: AiMessage[];
  tools: CodexTransportTool[];
  context: PermissionFilteredContext;
  model?: string;
  reasoningEffort?: AiReasoningEffort;
  surface?: string;
  executeTool?: (toolName: string, input: unknown) => Promise<unknown>;
}

type PendingRpc = {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
};

interface CodexAccountRpc {
  request<TResponse = unknown>(method: string, params: unknown): Promise<TResponse>;
}

export class CodexAppServerProvider implements AiProvider {
  id = "codex-app-server";
  label = "Codex App Server";
  executesToolsInTurn = true;

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
      context: input.context,
      model: input.model,
      reasoningEffort: input.reasoningEffort ?? this.options.reasoningEffort,
      surface: input.surface,
      executeTool: input.executeTool
    });

    for (const event of turn.events) {
      yield event;
    }
  }
}

export class CodexAppServerWebSocketTransport implements JsonRpcTransport {
  private readonly url: string;
  private readonly requestTimeoutMs: number;
  private readonly turnTimeoutMs: number;
  private readonly webSocketFactory: (url: string) => CodexWebSocketLike;
  private clientSessionId = "codex_app_server";

  constructor(private readonly options: CodexAppServerWebSocketTransportOptions = {}) {
    this.url = options.url ?? "ws://127.0.0.1:4500";
    this.requestTimeoutMs = normalizedTimeout(options.requestTimeoutMs, 60_000);
    this.turnTimeoutMs = normalizedTimeout(options.turnTimeoutMs, 180_000);
    this.webSocketFactory = options.webSocketFactory ?? defaultWebSocketFactory;
  }

  async request<TResponse>(method: string, params: unknown): Promise<TResponse> {
    if (method === "initialize") {
      this.clientSessionId = `codex_app_server_${Date.now().toString(36)}`;
      return { sessionId: this.clientSessionId } as TResponse;
    }
    if (method === "turn/start") {
      return { events: await this.runTurn(assertTurnStartParams(params)) } as TResponse;
    }
    throw new Error(`Unsupported Codex app-server transport method: ${method}`);
  }

  async generateImage(input: CodexAppServerImageGenerationInput): Promise<CodexAppServerGeneratedImage> {
    const socket = await this.connect();
    const rpc = new CodexAppServerImageRpc(socket, {
      requestTimeoutMs: this.requestTimeoutMs,
      turnTimeoutMs: this.turnTimeoutMs
    });

    try {
      await rpc.request("initialize", {
        clientInfo: {
          name: "open-tabletop-engine",
          title: "OpenTabletop Engine",
          version: "0.0.0"
        },
        capabilities: {
          experimentalApi: true,
          optOutNotificationMethods: [
            "command/exec/outputDelta",
            "item/fileChange/outputDelta",
            "item/reasoning/summaryTextDelta",
            "item/reasoning/textDelta"
          ]
        }
      });
      rpc.notify("initialized");
      await ensureCodexAppServerAuthenticated(rpc);
      const capabilities = await rpc.request<{ imageGeneration?: boolean }>("modelProvider/capabilities/read", {});
      if (capabilities.imageGeneration !== true) {
        throw new Error("Codex app-server does not report imageGeneration capability for the current account/model provider.");
      }
      const thread = await rpc.request<{ thread: { id: string } }>("thread/start", {
        cwd: input.cwd ?? this.options.cwd ?? null,
        approvalPolicy: "never",
        approvalsReviewer: null,
        model: input.model ?? this.options.model ?? null,
        modelProvider: input.modelProvider ?? this.options.modelProvider ?? null,
        serviceName: input.serviceName ?? this.options.serviceName ?? "open-tabletop-engine",
        ephemeral: true,
        baseInstructions: input.baseInstructions ?? "You generate raster image assets for OpenTabletop Engine.",
        developerInstructions:
          input.developerInstructions ??
          "When asked for an image, use Codex app-server image generation and return an actual generated raster image. Do not return SVG, HTML, markdown art, or a textual placeholder."
      });
      const generated = rpc.waitForImageTurnCompleted();
      await rpc.request("turn/start", {
        threadId: thread.thread.id,
        input: [{ type: "text", text: input.prompt, text_elements: [] }],
        approvalPolicy: "never",
        sandboxPolicy: { type: "readOnly", networkAccess: false }
      });
      return await generated;
    } finally {
      socket.close();
      rpc.dispose();
    }
  }

  private async runTurn(input: CodexProviderTurnStartParams): Promise<AiProviderEvent[]> {
    const socket = await this.connect();
    const rpc = new CodexAppServerRpc(socket, {
      requestTimeoutMs: this.requestTimeoutMs,
      turnTimeoutMs: this.turnTimeoutMs,
      tools: input.tools,
      executeTool: input.executeTool
    });

    try {
      await rpc.request("initialize", {
        clientInfo: {
          name: "open-tabletop-engine",
          title: "OpenTabletop Engine",
          version: "0.0.0"
        },
        capabilities: {
          experimentalApi: true,
          optOutNotificationMethods: [
            "command/exec/outputDelta",
            "item/fileChange/outputDelta",
            "item/reasoning/summaryTextDelta",
            "item/reasoning/textDelta"
          ]
        }
      });
      rpc.notify("initialized");
      await ensureCodexAppServerAuthenticated(rpc);
      const thread = await rpc.request<{ thread: { id: string } }>("thread/start", {
        cwd: this.options.cwd ?? null,
        approvalPolicy: "never",
        approvalsReviewer: null,
        model: input.model ?? this.options.model ?? null,
        modelProvider: this.options.modelProvider ?? null,
        serviceName: this.options.serviceName ?? "open-tabletop-engine",
        ephemeral: true,
        baseInstructions: codexBaseInstructions(input.context),
        developerInstructions:
          "Use OpenTabletop dynamic tools for campaign reads, campaign proposals, dice rolls, and generated assets. Never use shell or file-editing tools for tabletop state.",
        dynamicTools: input.tools.map(toDynamicToolSpec)
      });
      const turnCompleted = rpc.waitForTurnCompleted();
      await rpc.request("turn/start", {
        threadId: thread.thread.id,
        input: codexTurnInput(input),
        model: input.model ?? this.options.model ?? null,
        effort: input.reasoningEffort ?? this.options.reasoningEffort ?? null,
        approvalPolicy: "never",
        sandboxPolicy: { type: "readOnly", networkAccess: false }
      });
      return await turnCompleted;
    } finally {
      socket.close();
      rpc.dispose();
    }
  }

  private connect(): Promise<CodexWebSocketLike> {
    const socket = this.webSocketFactory(this.url);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out connecting to Codex app-server at ${this.url}`));
        socket.close();
      }, this.requestTimeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        removeListener(socket, "open", onOpen);
        removeListener(socket, "error", onError);
        removeListener(socket, "close", onClose);
      };
      const onOpen = () => {
        cleanup();
        resolve(socket);
      };
      const onError = (event: CodexWebSocketEvent) => {
        cleanup();
        reject(new Error(`Failed to connect to Codex app-server at ${this.url}: ${event.message ?? "websocket error"}`));
      };
      const onClose = (event: CodexWebSocketEvent) => {
        cleanup();
        reject(new Error(`Codex app-server socket closed before connection opened${event.reason ? `: ${event.reason}` : ""}`));
      };
      socket.addEventListener("open", onOpen);
      socket.addEventListener("error", onError);
      socket.addEventListener("close", onClose);
    });
  }
}

class CodexAppServerImageRpc {
  private readonly pending = new Map<string, PendingRpc>();
  private readonly images: CodexAppServerGeneratedImage[] = [];
  private readonly agentMessages: string[] = [];
  private turnCompleted?: { resolve(image: CodexAppServerGeneratedImage): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> };
  private nextId = 1;

  constructor(
    private readonly socket: CodexWebSocketLike,
    private readonly options: { requestTimeoutMs: number; turnTimeoutMs: number }
  ) {
    this.socket.addEventListener("message", this.onMessage);
    this.socket.addEventListener("close", this.onClose);
    this.socket.addEventListener("error", this.onError);
  }

  request<TResponse = unknown>(method: string, params: unknown): Promise<TResponse> {
    const id = `otte-img-${this.nextId++}`;
    return new Promise<TResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for Codex app-server method ${method}`));
      }, this.options.requestTimeoutMs);
      this.pending.set(id, {
        resolve: (value) => resolve(value as TResponse),
        reject,
        timer
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  notify(method: string, params?: unknown): void {
    this.socket.send(JSON.stringify(params === undefined ? { method } : { method, params }));
  }

  waitForImageTurnCompleted(): Promise<CodexAppServerGeneratedImage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timed out waiting ${this.options.turnTimeoutMs}ms for Codex app-server image generation`));
      }, this.options.turnTimeoutMs);
      this.turnCompleted = { resolve, reject, timer };
    });
  }

  dispose(): void {
    this.socket.removeEventListener?.("message", this.onMessage);
    this.socket.removeEventListener?.("close", this.onClose);
    this.socket.removeEventListener?.("error", this.onError);
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`Codex app-server request ${id} was disposed`));
    }
    this.pending.clear();
    if (this.turnCompleted) clearTimeout(this.turnCompleted.timer);
  }

  private readonly onMessage = (event: CodexWebSocketEvent): void => {
    const message = parseJsonRpcMessage(event.data);
    if (!message) return;

    if ("id" in message && (("result" in message) || ("error" in message)) && typeof message.method !== "string") {
      const pending = this.pending.get(String(message.id));
      if (!pending) return;
      this.pending.delete(String(message.id));
      clearTimeout(pending.timer);
      if ("error" in message && message.error) pending.reject(new Error(`Codex app-server error: ${JSON.stringify(message.error).slice(0, 500)}`));
      else pending.resolve(message.result);
      return;
    }

    if ("id" in message && typeof message.method === "string") {
      this.handleServerRequest(message.id, message.method);
      return;
    }

    if (typeof message.method === "string") {
      this.handleServerNotification(message.method, message.params);
    }
  };

  private readonly onClose = (event: CodexWebSocketEvent): void => {
    const error = new Error(`Codex app-server socket closed${event.reason ? `: ${event.reason}` : ""}`);
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    if (this.turnCompleted) {
      clearTimeout(this.turnCompleted.timer);
      this.turnCompleted.reject(error);
    }
  };

  private readonly onError = (event: CodexWebSocketEvent): void => {
    if (this.turnCompleted) this.turnCompleted.reject(new Error(`Codex app-server socket error: ${event.message ?? "websocket error"}`));
  };

  private handleServerRequest(id: unknown, method: string): void {
    if (method === "item/commandExecution/requestApproval") {
      this.respond(id, { decision: "cancel" });
      return;
    }
    if (method === "item/fileChange/requestApproval") {
      this.respond(id, { decision: "cancel" });
      return;
    }
    if (method === "item/permissions/requestApproval") {
      this.respond(id, { permissions: {}, scope: "turn", strictAutoReview: true });
      return;
    }
    if (method === "account/chatgptAuthTokens/refresh") {
      this.respondError(id, -32001, "Codex app-server ChatGPT sign-in is required.");
      return;
    }
    this.respondError(id, -32601, `Unsupported Codex app-server image request method: ${method}`);
  }

  private handleServerNotification(method: string, params: unknown): void {
    if (method === "item/completed" && isRecord(params) && isRecord(params.item)) {
      if (params.item.type === "imageGeneration") {
        const image = generatedImageFromCodexItem(params.item, "revisedPrompt");
        if (image) this.images.push(image);
        return;
      }
      if (params.item.type === "agentMessage" && typeof params.item.text === "string") {
        this.agentMessages.push(params.item.text);
        return;
      }
    }
    if (method === "rawResponseItem/completed" && isRecord(params) && isRecord(params.item) && params.item.type === "image_generation_call") {
      const image = generatedImageFromCodexItem(params.item, "revised_prompt");
      if (image) this.images.push(image);
      return;
    }
    if (method === "turn/completed" && this.turnCompleted) {
      const completed = this.turnCompleted;
      this.turnCompleted = undefined;
      clearTimeout(completed.timer);
      const image = this.images.at(-1);
      if (image) {
        completed.resolve(image);
        return;
      }
      completed.reject(new Error(`Codex app-server image turn completed without an image result.${this.agentMessages.length > 0 ? ` Last message: ${this.agentMessages.at(-1)}` : ""}`));
    }
  }

  private respond(id: unknown, result: unknown): void {
    this.socket.send(JSON.stringify({ id, result }));
  }

  private respondError(id: unknown, code: number, message: string): void {
    this.socket.send(JSON.stringify({ id, error: { code, message } }));
  }
}

class CodexAppServerRpc {
  private readonly pending = new Map<string, PendingRpc>();
  private readonly events: AiProviderEvent[] = [];
  private turnCompleted?: { resolve(events: AiProviderEvent[]): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> };
  private nextId = 1;

  constructor(
    private readonly socket: CodexWebSocketLike,
    private readonly options: { requestTimeoutMs: number; turnTimeoutMs: number; tools: CodexTransportTool[]; executeTool?: (toolName: string, input: unknown) => Promise<unknown> }
  ) {
    this.socket.addEventListener("message", this.onMessage);
    this.socket.addEventListener("close", this.onClose);
    this.socket.addEventListener("error", this.onError);
  }

  request<TResponse = unknown>(method: string, params: unknown): Promise<TResponse> {
    const id = `otte-${this.nextId++}`;
    return new Promise<TResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for Codex app-server method ${method}`));
      }, this.options.requestTimeoutMs);
      this.pending.set(id, {
        resolve: (value) => resolve(value as TResponse),
        reject,
        timer
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  notify(method: string, params?: unknown): void {
    this.socket.send(JSON.stringify(params === undefined ? { method } : { method, params }));
  }

  waitForTurnCompleted(): Promise<AiProviderEvent[]> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timed out waiting ${this.options.turnTimeoutMs}ms for Codex app-server turn completion`));
      }, this.options.turnTimeoutMs);
      this.turnCompleted = { resolve, reject, timer };
    });
  }

  dispose(): void {
    this.socket.removeEventListener?.("message", this.onMessage);
    this.socket.removeEventListener?.("close", this.onClose);
    this.socket.removeEventListener?.("error", this.onError);
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(`Codex app-server request ${id} was disposed`));
    }
    this.pending.clear();
    if (this.turnCompleted) clearTimeout(this.turnCompleted.timer);
  }

  private readonly onMessage = (event: CodexWebSocketEvent): void => {
    const message = parseJsonRpcMessage(event.data);
    if (!message) return;

    if ("id" in message && (("result" in message) || ("error" in message))) {
      const pending = this.pending.get(String(message.id));
      if (!pending) return;
      this.pending.delete(String(message.id));
      clearTimeout(pending.timer);
      if ("error" in message && message.error) pending.reject(new Error(`Codex app-server error: ${JSON.stringify(message.error).slice(0, 500)}`));
      else pending.resolve(message.result);
      return;
    }

    if ("id" in message && typeof message.method === "string") {
      void this.handleServerRequest(message.id, message.method, message.params);
      return;
    }

    if (typeof message.method === "string") {
      this.handleServerNotification(message.method, message.params);
    }
  };

  private readonly onClose = (event: CodexWebSocketEvent): void => {
    const error = new Error(`Codex app-server socket closed${event.reason ? `: ${event.reason}` : ""}`);
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    if (this.turnCompleted) {
      clearTimeout(this.turnCompleted.timer);
      this.turnCompleted.reject(error);
    }
  };

  private readonly onError = (event: CodexWebSocketEvent): void => {
    if (this.turnCompleted) this.turnCompleted.reject(new Error(`Codex app-server socket error: ${event.message ?? "websocket error"}`));
  };

  private async handleServerRequest(id: unknown, method: string, params: unknown): Promise<void> {
    if (method === "item/tool/call") {
      const toolCall = dynamicToolCallFromParams(params);
      this.events.push({ type: "tool.started", toolName: toolCall.tool, input: toolCall.arguments });
      if (this.options.executeTool) {
        try {
          const output = await this.options.executeTool(toolCall.tool, toolCall.arguments);
          this.events.push({ type: "tool.completed", toolName: toolCall.tool, output });
          this.respond(id, {
            success: true,
            contentItems: [
              {
                type: "inputText",
                text: JSON.stringify(output)
              }
            ]
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Tool execution failed.";
          const output = { error: "tool_execution_failed", message };
          this.events.push({ type: "tool.completed", toolName: toolCall.tool, output });
          this.respond(id, {
            success: false,
            contentItems: [
              {
                type: "inputText",
                text: JSON.stringify(output)
              }
            ]
          });
        }
        return;
      }
      this.respond(id, {
        success: true,
        contentItems: [
          {
            type: "inputText",
            text: `OpenTabletop accepted ${toolCall.tool} for host-side permission-checked execution. The host will execute it after this turn and record the result.`
          }
        ]
      });
      return;
    }
    if (method === "item/commandExecution/requestApproval") {
      this.respond(id, { decision: "cancel" });
      return;
    }
    if (method === "item/fileChange/requestApproval") {
      this.respond(id, { decision: "cancel" });
      return;
    }
    if (method === "item/permissions/requestApproval") {
      this.respond(id, { permissions: {}, scope: "turn", strictAutoReview: true });
      return;
    }
    if (method === "item/tool/requestUserInput" || method === "mcpServer/elicitation/request") {
      this.respondError(id, -32000, "OpenTabletop Codex transport does not support interactive server prompts.");
      return;
    }
    if (method === "account/chatgptAuthTokens/refresh") {
      this.respondError(id, -32001, "Codex app-server ChatGPT sign-in is required.");
      return;
    }
    this.respondError(id, -32601, `Unsupported Codex app-server request method: ${method}`);
  }

  private handleServerNotification(method: string, params: unknown): void {
    if (method === "item/agentMessage/delta" && isRecord(params) && typeof params.delta === "string") {
      this.events.push({ type: "message.delta", delta: params.delta });
      return;
    }
    if (method === "item/completed" && isRecord(params) && isRecord(params.item) && params.item.type === "agentMessage" && typeof params.item.text === "string") {
      this.events.push({ type: "message.completed", content: params.item.text });
      return;
    }
    if (method === "thread/tokenUsage/updated") {
      const usage = usageFromTokenNotification(params);
      if (usage) this.events.push({ type: "usage.reported", usage });
      return;
    }
    if (method === "turn/completed" && this.turnCompleted) {
      const completed = this.turnCompleted;
      this.turnCompleted = undefined;
      clearTimeout(completed.timer);
      completed.resolve([...this.events]);
    }
  }

  private respond(id: unknown, result: unknown): void {
    this.socket.send(JSON.stringify({ id, result }));
  }

  private respondError(id: unknown, code: number, message: string): void {
    this.socket.send(JSON.stringify({ id, error: { code, message } }));
  }
}

function defaultWebSocketFactory(url: string): CodexWebSocketLike {
  if (typeof WebSocket === "undefined") {
    throw new Error("Codex app-server WebSocket transport requires a runtime with global WebSocket support.");
  }
  return new WebSocket(url);
}

function removeListener(socket: CodexWebSocketLike, type: "open" | "message" | "error" | "close", listener: (event: CodexWebSocketEvent) => void): void {
  socket.removeEventListener?.(type, listener);
}

function normalizedTimeout(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

async function ensureCodexAppServerAuthenticated(rpc: CodexAccountRpc): Promise<void> {
  let account: unknown;
  try {
    account = await rpc.request("account/read", {});
  } catch (error) {
    if (isCodexMethodNotFoundError(error)) return;
    if (!isCodexAuthError(error)) throw error;
    const login = await requestCodexManagedLogin(rpc);
    throw new CodexAppServerAuthRequiredError(login);
  }
  if (!codexAccountNeedsLogin(account)) return;
  const login = await requestCodexManagedLogin(rpc);
  throw new CodexAppServerAuthRequiredError(login);
}

async function requestCodexManagedLogin(rpc: CodexAccountRpc): Promise<CodexAppServerLoginStart> {
  const login = await rpc.request("account/login/start", { type: "chatgpt" });
  return codexLoginStartFromResponse(login);
}

function codexLoginStartFromResponse(response: unknown): CodexAppServerLoginStart {
  const record = isRecord(response) ? response : {};
  const source = isRecord(record.login) ? record.login : record;
  return {
    type: source.type === "chatgptDeviceCode" ? "chatgptDeviceCode" : "chatgpt",
    loginId: stringFromRecord(source, "loginId"),
    authUrl: stringFromRecord(source, "authUrl"),
    verificationUrl: stringFromRecord(source, "verificationUrl"),
    userCode: stringFromRecord(source, "userCode")
  };
}

function codexAccountNeedsLogin(account: unknown): boolean {
  if (!isRecord(account)) return false;
  if (account.authenticated === false || account.requiresLogin === true) return true;
  if ("account" in account) {
    if (account.account === null) return true;
    if (isRecord(account.account)) return codexAccountNeedsLogin(account.account);
  }
  const authMode = nullableStringFromRecord(account, "authMode");
  if (authMode === undefined) return false;
  if (authMode === null) return true;
  return ["", "none", "unauthenticated"].includes(authMode.toLowerCase());
}

function isCodexMethodNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("\"code\":-32601") || message.includes("Method not found");
}

function isCodexAuthError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /unauth|auth|chatgpt|login|sign-in|sign in/i.test(message);
}

function assertTurnStartParams(params: unknown): CodexProviderTurnStartParams {
  if (!isRecord(params)) throw new Error("Codex app-server turn/start params must be an object.");
  if (typeof params.threadId !== "string") throw new Error("Codex app-server turn/start params require threadId.");
  if (!Array.isArray(params.messages)) throw new Error("Codex app-server turn/start params require messages.");
  if (!Array.isArray(params.tools)) throw new Error("Codex app-server turn/start params require tools.");
  if (!isRecord(params.context)) throw new Error("Codex app-server turn/start params require context.");
  return params as unknown as CodexProviderTurnStartParams;
}

function toDynamicToolSpec(tool: CodexTransportTool): Record<string, unknown> {
  return {
    namespace: "open_tabletop",
    name: tool.name,
    description: `${tool.description} Required OpenTabletop permissions: ${tool.requiredPermissions.join(", ") || "none"}.`,
    inputSchema: tool.parameters ?? {
      type: "object",
      properties: {},
      additionalProperties: true
    }
  };
}

function codexBaseInstructions(context: PermissionFilteredContext): string {
  return [
    "You are OpenTabletop Engine's in-game tabletop assistant.",
    "Answer using only the permission-filtered campaign context supplied by the user message.",
    "Never reveal, infer, or invent GM-only information that is not present in the visible context.",
    "Do not fill missing rules, compendium, campaign, or character details from outside knowledge; use visible OpenTabletop tools or ask for clarification.",
    "When changing campaign state or generating map/token assets, call an available open_tabletop dynamic tool instead of claiming a change was already applied.",
    "OpenTabletop campaign edit and asset-generation tools create reviewable proposals. Do not say a scene, actor, journal, token, encounter, memory, map, or token image changed until host-side tool output confirms it.",
    "After any successful board-state mutation or applying an approved proposal that touches scene, token, asset, fog, wall, light, annotation, or combat state, call capture_board_view and read_board_state before your final success response. Compare the screenshot signal and structured board state. If visual capture is unavailable, use read_board_state and explicitly say visual verification was unavailable.",
    "Do not use shell, filesystem, browser, plugin, or MCP tools for tabletop campaign state.",
    "",
    `Campaign id: ${context.campaignId}`
  ].join("\n");
}

function codexTurnInput(input: CodexProviderTurnStartParams): Array<Record<string, unknown>> {
  const items: Array<Record<string, unknown>> = [{ type: "text", text: turnText(input), text_elements: [] }];
  for (const message of input.messages) {
    for (const part of message.parts ?? []) {
      if (part.type === "image_url") {
        items.push({ type: "image", url: part.imageUrl });
      }
    }
  }
  return items;
}

function turnText(input: CodexProviderTurnStartParams): string {
  return [
    "Permission-filtered OpenTabletop context:",
    JSON.stringify(input.context),
    "",
    "Conversation:",
    ...input.messages.map((message) => `${message.role}: ${messageText(message)}`)
  ].join("\n");
}

function messageText(message: AiMessage): string {
  const partText = (message.parts ?? []).filter((part) => part.type === "text").map((part) => part.text).join("\n");
  return [message.content, partText].filter(Boolean).join("\n");
}

function dynamicToolCallFromParams(params: unknown): { tool: string; arguments: unknown } {
  if (!isRecord(params) || typeof params.tool !== "string") return { tool: "unknown_tool", arguments: {} };
  return {
    tool: params.tool,
    arguments: params.arguments ?? {}
  };
}

function parseJsonRpcMessage(data: unknown): Record<string, unknown> | undefined {
  const text = typeof data === "string" ? data : data instanceof ArrayBuffer ? new TextDecoder().decode(data) : undefined;
  if (!text) return undefined;
  try {
    const parsed = JSON.parse(text) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function usageFromTokenNotification(params: unknown): { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined {
  if (!isRecord(params) || !isRecord(params.tokenUsage) || !isRecord(params.tokenUsage.last)) return undefined;
  const last = params.tokenUsage.last;
  const inputTokens = numberFromRecord(last, "inputTokens");
  const outputTokens = numberFromRecord(last, "outputTokens");
  const totalTokens = numberFromRecord(last, "totalTokens");
  if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) return undefined;
  return { inputTokens, outputTokens, totalTokens };
}

function generatedImageFromCodexItem(item: Record<string, unknown>, revisedPromptKey: "revisedPrompt" | "revised_prompt"): CodexAppServerGeneratedImage | undefined {
  const base64 = typeof item.result === "string" ? item.result : undefined;
  if (!base64) return undefined;
  return {
    base64,
    revisedPrompt: typeof item[revisedPromptKey] === "string" ? item[revisedPromptKey] : undefined,
    savedPath: typeof item.savedPath === "string" ? item.savedPath : undefined,
    status: typeof item.status === "string" ? item.status : undefined
  };
}

export class LoopbackCodexTransport implements JsonRpcTransport {
  async request<TResponse>(method: string, params: unknown): Promise<TResponse> {
    if (method === "initialize") return { sessionId: "codex_loopback" } as TResponse;
    if (method === "turn/start") {
      const events: AiProviderEvent[] = [];
      if (shouldRequestMalformedTool(params)) {
        if (hasTool(params, "create_proposal")) {
          events.push({ type: "tool.started", toolName: "create_proposal", input: { rawArguments: "{not-json" } });
        }
        if (hasTool(params, "draft_scene")) {
          events.push({ type: "tool.started", toolName: "draft_scene", input: { width: 900 } });
        }
        if (hasTool(params, "draft_token_update")) {
          events.push({ type: "tool.started", toolName: "draft_token_update", input: { tokenId: "tok_valen", x: "east" } });
        }
        if (hasTool(params, "create_memory")) {
          events.push({ type: "tool.started", toolName: "create_memory", input: "remember this" });
        }
        events.push({ type: "tool.started", toolName: "unknown_tool", input: { title: "No such tool" } });
        events.push({
          type: "message.completed",
          content: "Codex loopback requested malformed tool inputs for integration hardening."
        });
        return { events: await executeLoopbackTools(events, params) } as TResponse;
      }
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
      if (shouldRequestJournalTool(params)) {
        events.push({
          type: "tool.started",
          toolName: "draft_journal_entry",
          input: {
            title: "Loopback Journal Lead",
            body: "The loopback provider drafted this journal clue.",
            visibility: "gm_only",
            tags: ["ai", "codex-loopback"]
          }
        });
      }
      if (shouldRequestSceneTool(params)) {
        events.push({
          type: "tool.started",
          toolName: "draft_scene",
          input: {
            name: "Loopback Test Chamber",
            width: 900,
            height: 700,
            gridSize: 50
          }
        });
      }
      if (shouldRequestMapAssetTool(params)) {
        events.push({
          type: "tool.started",
          toolName: "generate_map_asset",
          input: {
            prompt: "A top-down ember vault chamber with broken pillars, lava-lit channels, and clear tactical lanes.",
            name: "Loopback Ember Vault Map",
            sceneId: "scn_vault_entry",
            size: "1536x1024",
            quality: "low",
            outputFormat: "png"
          }
        });
      }
      if (shouldRequestTokenTool(params)) {
        events.push({
          type: "tool.started",
          toolName: "draft_token_update",
          input: {
            tokenId: "tok_valen",
            x: 220,
            y: 240,
            disposition: "friendly"
          }
        });
      }
      if (shouldRequestTokenAssetTool(params)) {
        events.push({
          type: "tool.started",
          toolName: "generate_token_asset",
          input: {
            prompt: "A heroic ash-haired fighter token portrait with a steel shield and ember-lit armor.",
            name: "Loopback Valen Token",
            tokenId: "tok_valen",
            size: "1024x1024",
            quality: "low",
            outputFormat: "png"
          }
        });
      }
      if (shouldRequestActorTool(params)) {
        events.push({
          type: "tool.started",
          toolName: "draft_actor_update",
          input: {
            actorId: "act_valen",
            data: {
              resources: {
                focus: 4
              }
            }
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
      if (shouldRequestActorActionTool(params)) {
        events.push({
          type: "tool.started",
          toolName: "use_actor_action",
          input: {
            actorId: "act_valen",
            actionName: "Healing Word Healing"
          }
        });
      }
      if (shouldRequestCompendiumTool(params)) {
        events.push({
          type: "tool.started",
          toolName: "read_compendium",
          input: {
            systemId: "dnd-5e-srd"
          }
        });
      }
      events.push({
        type: "message.completed",
        content: memoryExtractionContent(params) ?? `Codex loopback handled ${method} with ${JSON.stringify(params).slice(0, 160)}`
      });
      return { events: await executeLoopbackTools(events, params) } as TResponse;
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

function shouldRequestMalformedTool(params: unknown): boolean {
  return /\bmalformed\b|\binvalid tool\b|\bedge case\b/i.test(promptFromParams(params));
}

function shouldRequestEncounterTool(params: unknown): boolean {
  return hasTool(params, "draft_encounter") && /\bencounter\b/i.test(promptFromParams(params));
}

function shouldRequestJournalTool(params: unknown): boolean {
  return hasTool(params, "draft_journal_entry") && /\bjournal\b|\bnote\b|\bclue\b/i.test(promptFromParams(params));
}

function shouldRequestSceneTool(params: unknown): boolean {
  return hasTool(params, "draft_scene") && /\bscene\b|\bmap\b|\bchamber\b/i.test(promptFromParams(params));
}

function shouldRequestMapAssetTool(params: unknown): boolean {
  return hasTool(params, "generate_map_asset") && /\bgenerate\b|\basset\b|\bimage\b/i.test(promptFromParams(params)) && /\bmap\b|\bbattlemap\b|\bbackground\b/i.test(promptFromParams(params));
}

function shouldRequestTokenTool(params: unknown): boolean {
  return hasTool(params, "draft_token_update") && /\btoken\b|\bposition\b|\bmove\b/i.test(promptFromParams(params));
}

function shouldRequestTokenAssetTool(params: unknown): boolean {
  return hasTool(params, "generate_token_asset") && /\bgenerate\b|\basset\b|\bimage\b|\bart\b/i.test(promptFromParams(params)) && /\btoken\b|\bportrait\b/i.test(promptFromParams(params));
}

function shouldRequestActorTool(params: unknown): boolean {
  return hasTool(params, "draft_actor_update") && /\bactor\b|\bsheet\b|\bcharacter\b/i.test(promptFromParams(params));
}

function shouldRequestMemoryTool(params: unknown): boolean {
  return hasTool(params, "create_memory") && /\bmemory\b/i.test(promptFromParams(params));
}

function shouldRequestRollTool(params: unknown): boolean {
  return hasTool(params, "roll_dice") && /\broll\b|\bdice\b/i.test(promptFromParams(params));
}

function shouldRequestActorActionTool(params: unknown): boolean {
  return hasTool(params, "use_actor_action") && /\buse\b|\baction\b|\bcast\b|\bspell\b/i.test(promptFromParams(params));
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

async function executeLoopbackTools(events: AiProviderEvent[], params: unknown): Promise<AiProviderEvent[]> {
  const executeTool = isRecord(params) && typeof params.executeTool === "function" ? (params.executeTool as (toolName: string, input: unknown) => Promise<unknown>) : undefined;
  if (!executeTool) return events;
  const next: AiProviderEvent[] = [];
  for (const event of events) {
    next.push(event);
    if (event.type !== "tool.started") continue;
    try {
      next.push({ type: "tool.completed", toolName: event.toolName, output: await executeTool(event.toolName, event.input) });
    } catch (error) {
      next.push({ type: "tool.completed", toolName: event.toolName, output: { error: "tool_execution_failed", message: error instanceof Error ? error.message : "Tool execution failed." } });
    }
  }
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberFromRecord(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringFromRecord(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function nullableStringFromRecord(record: Record<string, unknown>, key: string): string | null | undefined {
  if (!(key in record)) return undefined;
  const value = record[key];
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}
