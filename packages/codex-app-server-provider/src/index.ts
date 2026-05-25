import type { ChildProcess } from "node:child_process";
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
  loginType?: CodexAppServerLoginType;
  serviceName?: string;
  requestTimeoutMs?: number;
  turnTimeoutMs?: number;
  webSocketFactory?: (url: string) => CodexWebSocketLike;
  autoStart?: boolean;
  codexCommand?: string;
  appServerStarter?: CodexAppServerStarter;
}

export interface CodexAppServerStartOptions {
  url: string;
  command?: string;
  timeoutMs: number;
}

export type CodexAppServerStarter = (options: CodexAppServerStartOptions) => Promise<void>;

export interface CodexAppServerCommandCandidate {
  command: string;
  shell: boolean;
}

export interface CodexAppServerCommandCandidateOptions {
  command?: string;
  platform?: NodeJS.Platform;
  env?: Record<string, string | undefined>;
  cwd?: string;
}

export interface CodexAppServerImageGenerationInput {
  prompt: string;
  outputFormat?: "png" | "jpeg" | "webp";
  sourceImages?: Array<{ url: string; mimeType?: string }>;
  cwd?: string;
  model?: string;
  modelProvider?: string;
  serviceName?: string;
  baseInstructions?: string;
  developerInstructions?: string;
  signal?: AbortSignal;
}

export interface CodexAppServerGeneratedImage {
  base64: string;
  revisedPrompt?: string;
  savedPath?: string;
  status?: string;
}

export type CodexAppServerLoginType = "chatgpt" | "chatgptDeviceCode";

export interface CodexAppServerLoginStart {
  type: CodexAppServerLoginType;
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
  signal?: AbortSignal;
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
      signal: input.signal,
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
  private readonly autoStart: boolean;
  private readonly appServerStarter: CodexAppServerStarter;
  private clientSessionId = "codex_app_server";

  constructor(private readonly options: CodexAppServerWebSocketTransportOptions = {}) {
    this.url = options.url ?? "ws://127.0.0.1:4500";
    this.requestTimeoutMs = normalizedTimeout(options.requestTimeoutMs, 60_000);
    this.turnTimeoutMs = normalizedTimeout(options.turnTimeoutMs, 15 * 60_000);
    this.webSocketFactory = options.webSocketFactory ?? defaultWebSocketFactory;
    this.autoStart = options.autoStart ?? false;
    this.appServerStarter = options.appServerStarter ?? startLocalCodexAppServer;
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
    if (input.signal?.aborted) throw codexTurnAbortError();
    const socket = await this.connect();
    const rpc = new CodexAppServerImageRpc(socket, {
      requestTimeoutMs: this.requestTimeoutMs,
      turnTimeoutMs: this.turnTimeoutMs
    });
    const abortTurn = () => socket.close(4000, "OpenTabletop image generation stopped by user");
    input.signal?.addEventListener("abort", abortTurn, { once: true });

    try {
      if (input.signal?.aborted) throw codexTurnAbortError();
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
      if (input.signal?.aborted) throw codexTurnAbortError();
      await ensureCodexAppServerAuthenticated(rpc, this.options.loginType);
      if (input.signal?.aborted) throw codexTurnAbortError();
      const capabilities = await rpc.request<{ imageGeneration?: boolean }>("modelProvider/capabilities/read", {});
      if (capabilities.imageGeneration !== true) {
        throw new Error("Codex app-server does not report imageGeneration capability for the current account/model provider.");
      }
      if (input.signal?.aborted) throw codexTurnAbortError();
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
      if (input.signal?.aborted) throw codexTurnAbortError();
      const generated = rpc.waitForImageTurnCompleted();
      await rpc.request("turn/start", {
        threadId: thread.thread.id,
        input: imageGenerationTurnInput(input),
        approvalPolicy: "never",
        sandboxPolicy: { type: "readOnly", networkAccess: false }
      });
      return await generated;
    } catch (error) {
      if (input.signal?.aborted) throw codexTurnAbortError();
      throw error;
    } finally {
      input.signal?.removeEventListener("abort", abortTurn);
      socket.close();
      rpc.dispose();
    }
  }

  private async runTurn(input: CodexProviderTurnStartParams): Promise<AiProviderEvent[]> {
    if (input.signal?.aborted) throw codexTurnAbortError();
    const socket = await this.connect();
    const rpc = new CodexAppServerRpc(socket, {
      requestTimeoutMs: this.requestTimeoutMs,
      turnTimeoutMs: this.turnTimeoutMs,
      tools: input.tools,
      executeTool: input.executeTool
    });
    const abortTurn = () => socket.close(4000, "OpenTabletop agent turn stopped by user");
    input.signal?.addEventListener("abort", abortTurn, { once: true });

    try {
      if (input.signal?.aborted) throw codexTurnAbortError();
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
            "item/reasoning/textDelta"
          ]
        }
      });
      rpc.notify("initialized");
      if (input.signal?.aborted) throw codexTurnAbortError();
      await ensureCodexAppServerAuthenticated(rpc, this.options.loginType);
      if (input.signal?.aborted) throw codexTurnAbortError();
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
      if (input.signal?.aborted) throw codexTurnAbortError();
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
    } catch (error) {
      if (input.signal?.aborted) throw codexTurnAbortError();
      throw error;
    } finally {
      input.signal?.removeEventListener("abort", abortTurn);
      socket.close();
      rpc.dispose();
    }
  }

  private async connect(): Promise<CodexWebSocketLike> {
    try {
      return await this.openSocket();
    } catch (error) {
      if (!this.autoStart || !isAutoStartableCodexUrl(this.url)) throw asError(error);
      try {
        await this.appServerStarter({ url: this.url, command: this.options.codexCommand, timeoutMs: this.requestTimeoutMs });
      } catch (startError) {
        throw new Error(`Failed to start Codex app-server for ${this.url}: ${errorMessage(startError)}. Original connection error: ${errorMessage(error)}`);
      }
      try {
        return await this.openSocket();
      } catch (reconnectError) {
        throw new Error(`Started Codex app-server for ${this.url}, but the WebSocket connection still failed: ${errorMessage(reconnectError)}. Original connection error: ${errorMessage(error)}`);
      }
    }
  }

  private openSocket(): Promise<CodexWebSocketLike> {
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

const codexAppServerStartups = new Map<string, Promise<void>>();
const codexAppServerChildren = new Map<string, ChildProcess>();

async function startLocalCodexAppServer(options: CodexAppServerStartOptions): Promise<void> {
  const listenUrl = codexListenUrl(options.url);
  if (!listenUrl) throw new Error(`Codex app-server auto-start only supports loopback ws://IP:PORT URLs without a path; received ${options.url}`);
  if (await isCodexAppServerReady(listenUrl)) return;

  const existing = codexAppServerStartups.get(listenUrl);
  if (existing) return existing;

  const startup = spawnAndWaitForCodexAppServer(listenUrl, options);
  codexAppServerStartups.set(listenUrl, startup);
  try {
    await startup;
  } finally {
    codexAppServerStartups.delete(listenUrl);
  }
}

async function spawnAndWaitForCodexAppServer(listenUrl: string, options: CodexAppServerStartOptions): Promise<void> {
  const existingChild = codexAppServerChildren.get(listenUrl);
  if (existingChild && existingChild.exitCode === null && !existingChild.killed) {
    await waitForCodexAppServerReady(listenUrl, options.timeoutMs, [], existingChild);
    return;
  }

  const errors: string[] = [];
  const { spawn } = await import("node:child_process");
  const candidates = codexAppServerCommandCandidates({ command: options.command });
  for (const candidate of candidates) {
    try {
      await spawnCodexAppServerCandidate(listenUrl, options.timeoutMs, candidate, spawn);
      return;
    } catch (error) {
      errors.push(`${candidate.command}: ${errorMessage(error)}`);
      if (!isRecoverableCodexSpawnError(error)) {
        throw new Error(`Failed to start Codex app-server with ${candidate.command}: ${errorMessage(error)}${formatStartupErrors(errors)}`);
      }
    }
  }
  throw new Error(`Unable to start Codex app-server. Tried ${candidates.map((candidate) => candidate.command).join(", ")}.${formatStartupErrors(errors)}`);
}

async function spawnCodexAppServerCandidate(
  listenUrl: string,
  timeoutMs: number,
  candidate: CodexAppServerCommandCandidate,
  spawn: typeof import("node:child_process").spawn
): Promise<void> {
  const output: string[] = [];
  const child = spawn(candidate.command, ["app-server", "--listen", listenUrl], {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    shell: candidate.shell
  });
  codexAppServerChildren.set(listenUrl, child);
  child.stdout?.on("data", (chunk) => appendStartupOutput(output, chunk));
  child.stderr?.on("data", (chunk) => appendStartupOutput(output, chunk));
  const spawnFailed = new Promise<never>((_resolve, reject) => {
    child.once("error", (error) => reject(error));
  });
  child.once("exit", () => {
    if (codexAppServerChildren.get(listenUrl) === child) codexAppServerChildren.delete(listenUrl);
  });

  try {
    await Promise.race([waitForCodexAppServerReady(listenUrl, timeoutMs, output, child), spawnFailed]);
  } catch (error) {
    child.kill();
    throw error;
  }
}

async function waitForCodexAppServerReady(listenUrl: string, timeoutMs: number, output: string[], child?: ChildProcess): Promise<void> {
  const deadline = Date.now() + Math.max(1_000, timeoutMs);
  let lastProbeError = "";
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) {
      throw new Error(`Codex app-server process exited with code ${child.exitCode}.${formatStartupOutput(output)}`);
    }
    try {
      if (await isCodexAppServerReady(listenUrl)) return;
    } catch (error) {
      lastProbeError = errorMessage(error);
    }
    await delay(100);
  }
  throw new Error(`Timed out waiting for Codex app-server readiness at ${readyzUrlForCodexListenUrl(listenUrl)}.${lastProbeError ? ` Last probe error: ${lastProbeError}.` : ""}${formatStartupOutput(output)}`);
}

async function isCodexAppServerReady(listenUrl: string): Promise<boolean> {
  try {
    const response = await fetch(readyzUrlForCodexListenUrl(listenUrl));
    return response.status === 200;
  } catch {
    return false;
  }
}

function codexListenUrl(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "ws:") return undefined;
  if (!isLoopbackHost(parsed.hostname)) return undefined;
  if (!parsed.port) return undefined;
  if (parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.username || parsed.password) return undefined;
  return `ws://${parsed.hostname}:${parsed.port}`;
}

function isAutoStartableCodexUrl(url: string): boolean {
  return codexListenUrl(url) !== undefined;
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.toLowerCase();
  return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1" || normalized === "[::1]";
}

function readyzUrlForCodexListenUrl(listenUrl: string): string {
  const parsed = new URL(listenUrl);
  return `http://${parsed.host}/readyz`;
}

export function codexAppServerCommandCandidates(options: CodexAppServerCommandCandidateOptions = {}): CodexAppServerCommandCandidate[] {
  const platform = options.platform ?? process.platform;
  const command = options.command?.trim();
  if (platform !== "win32") return codexAppServerPosixCommandCandidates(command, options.cwd ?? process.cwd());
  if (command && !isBareCodexCommand(command)) return [{ command, shell: usesWindowsShell(command) }];

  const candidates: CodexAppServerCommandCandidate[] = [];
  const env = options.env ?? process.env;
  const appData = env.APPDATA ?? env.AppData ?? env.appdata;
  if (appData) candidates.push({ command: `${appData}\\npm\\codex.cmd`, shell: true });
  if (command && command.toLowerCase() !== "codex") candidates.push({ command, shell: usesWindowsShell(command) });
  candidates.push({ command: "codex.cmd", shell: true });
  candidates.push({ command: "codex", shell: false });
  return dedupeCodexCommandCandidates(candidates);
}

function codexAppServerPosixCommandCandidates(command: string | undefined, cwd: string): CodexAppServerCommandCandidate[] {
  if (command && !isBareCodexCommand(command)) return [{ command, shell: false }];
  return dedupeCodexCommandCandidates([
    { command: `${cwd}/apps/api/node_modules/.bin/codex`, shell: false },
    { command: `${cwd}/node_modules/.bin/codex`, shell: false },
    { command: command || "codex", shell: false }
  ]);
}

function isBareCodexCommand(command: string): boolean {
  if (/[\\/]/.test(command)) return false;
  return ["codex", "codex.cmd", "codex.exe", "codex.ps1"].includes(command.toLowerCase());
}

function usesWindowsShell(command: string): boolean {
  return /\.(?:cmd|bat)$/i.test(command);
}

function dedupeCodexCommandCandidates(candidates: CodexAppServerCommandCandidate[]): CodexAppServerCommandCandidate[] {
  const seen = new Set<string>();
  const deduped: CodexAppServerCommandCandidate[] = [];
  for (const candidate of candidates) {
    const key = `${candidate.command.toLowerCase()}\0${candidate.shell}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(candidate);
  }
  return deduped;
}

function isRecoverableCodexSpawnError(error: unknown): boolean {
  if (!isRecord(error)) return false;
  return error.code === "ENOENT" || error.code === "EPERM";
}

function appendStartupOutput(output: string[], chunk: unknown): void {
  const text = String(chunk);
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed) output.push(trimmed);
  }
  while (output.length > 20) output.shift();
}

function formatStartupOutput(output: string[]): string {
  if (output.length === 0) return "";
  return ` Last app-server output: ${output.join("\n").slice(-2_000)}`;
}

function formatStartupErrors(errors: string[]): string {
  if (errors.length === 0) return "";
  return ` Startup attempts: ${errors.join(" | ")}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function codexTurnAbortError(): Error {
  const error = new Error("Codex app-server turn stopped by the user.");
  error.name = "AbortError";
  return error;
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
      const timer = this.createTurnTimeout(reject);
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
          this.refreshTurnTimeoutAfterProgress(output);
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

  private refreshTurnTimeoutAfterProgress(output: unknown): void {
    if (!this.turnCompleted || !isSuccessfulToolOutput(output)) return;
    clearTimeout(this.turnCompleted.timer);
    this.turnCompleted.timer = this.createTurnTimeout(this.turnCompleted.reject);
  }

  private createTurnTimeout(reject: (error: Error) => void): ReturnType<typeof setTimeout> {
    return setTimeout(() => {
      reject(new Error(`Timed out waiting ${this.options.turnTimeoutMs}ms for Codex app-server turn completion`));
    }, this.options.turnTimeoutMs);
  }

  private handleServerNotification(method: string, params: unknown): void {
    if (method === "item/agentMessage/delta" && isRecord(params) && typeof params.delta === "string") {
      this.events.push({ type: "message.delta", delta: params.delta });
      return;
    }
    if (method === "item/reasoning/summaryTextDelta" && isRecord(params) && typeof params.delta === "string") {
      this.events.push({ type: "reasoning.delta", delta: params.delta, summaryIndex: numberFromRecord(params, "summaryIndex") });
      return;
    }
    if (method === "item/completed" && isRecord(params) && isRecord(params.item) && params.item.type === "agentMessage" && typeof params.item.text === "string") {
      this.events.push({ type: "message.completed", content: params.item.text });
      return;
    }
    if (method === "item/completed" && isRecord(params) && isRecord(params.item) && params.item.type === "reasoning") {
      const summary = reasoningSummaryFromItem(params.item);
      if (summary) this.events.push({ type: "reasoning.completed", content: summary });
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

async function ensureCodexAppServerAuthenticated(rpc: CodexAccountRpc, loginType: CodexAppServerLoginType = "chatgpt"): Promise<void> {
  let account: unknown;
  try {
    account = await rpc.request("account/read", {});
  } catch (error) {
    if (isCodexMethodNotFoundError(error)) return;
    if (!isCodexAuthError(error)) throw error;
    throw new CodexAppServerAuthRequiredError(await requestCodexManagedLogin(rpc, loginType));
  }
  if (!codexAccountNeedsLogin(account)) return;
  throw new CodexAppServerAuthRequiredError(await requestCodexManagedLogin(rpc, loginType));
}

async function requestCodexManagedLogin(rpc: CodexAccountRpc, loginType: CodexAppServerLoginType): Promise<CodexAppServerLoginStart> {
  const login = await rpc.request("account/login/start", { type: loginType });
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

function imageGenerationTurnInput(input: CodexAppServerImageGenerationInput): Array<Record<string, unknown>> {
  const items: Array<Record<string, unknown>> = [{ type: "text", text: input.prompt, text_elements: [] }];
  for (const image of input.sourceImages ?? []) {
    items.push({ type: "image", url: image.url, mimeType: image.mimeType });
  }
  return items;
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

function reasoningSummaryFromItem(item: Record<string, unknown>): string | undefined {
  const summary = textFromReasoningSummary(item.summary).trim();
  return summary || undefined;
}

function textFromReasoningSummary(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(textFromReasoningSummary).filter(Boolean).join("\n");
  if (!isRecord(value)) return "";
  if (typeof value.text === "string") return value.text;
  if (typeof value.summary === "string") return value.summary;
  if (Array.isArray(value.parts)) return textFromReasoningSummary(value.parts);
  return "";
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

function isSuccessfulToolOutput(output: unknown): boolean {
  return !isRecord(output) || typeof output.error !== "string";
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
