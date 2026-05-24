import type { AiProviderRequest } from "@open-tabletop/ai-core";
import { describe, expect, it } from "vitest";
import { CodexAppServerAuthRequiredError, CodexAppServerProvider, CodexAppServerWebSocketTransport, type CodexAppServerStartOptions } from "./index";

const baseRequest: AiProviderRequest = {
  threadId: "thr_test",
  messages: [{ role: "user", content: "Generate a map asset for the active scene." }],
  context: {
    campaignId: "camp_demo",
    publicSummary: "The Ember Vault",
    gmSecrets: [],
    memory: [],
    scenes: [{ id: "scn_vault", name: "Vault Entry", active: true }]
  },
  tools: [
    {
      name: "generate_map_asset",
      description: "Generate a map image asset as a reviewable proposal.",
      requiredPermissions: ["ai.proposeChanges", "scene.update"],
      parameters: {
        type: "object",
        required: ["prompt", "name"],
        additionalProperties: false,
        properties: {
          prompt: { type: "string" },
          name: { type: "string" },
          sceneId: { type: "string" }
        }
      },
      async execute() {
        return { proposalId: "prop_map" };
      }
    }
  ]
};

describe("CodexAppServerWebSocketTransport", () => {
  it("bridges Codex dynamic tool requests into OpenTabletop provider events", async () => {
    let socket: FakeCodexSocket | undefined;
    const provider = new CodexAppServerProvider({
      transport: new CodexAppServerWebSocketTransport({
        url: "ws://codex.test",
        requestTimeoutMs: 1000,
        turnTimeoutMs: 1000,
        webSocketFactory: () => {
          socket = new FakeCodexSocket();
          return socket;
        }
      })
    });

    const events = [];
    for await (const event of provider.stream(baseRequest)) events.push(event);

    expect(events).toEqual([
      {
        type: "tool.started",
        toolName: "generate_map_asset",
        input: { prompt: "ember vault tactical battlemap", name: "Ember Vault Map", sceneId: "scn_vault" }
      },
      { type: "message.completed", content: "The map request was handed to OpenTabletop." }
    ]);
    expect(socket?.sent.find((message) => message.method === "initialize")?.params).toMatchObject({
      capabilities: { experimentalApi: true }
    });
    expect(socket?.sent.find((message) => message.method === "thread/start")?.params).toMatchObject({
      dynamicTools: [
        expect.objectContaining({
          namespace: "open_tabletop",
          name: "generate_map_asset",
          inputSchema: baseRequest.tools[0]!.parameters
        })
      ]
    });
    expect(socket?.toolResponse).toMatchObject({
      id: 1,
      result: {
        success: true,
        contentItems: [expect.objectContaining({ type: "inputText" })]
      }
    });
  });

  it("starts the managed ChatGPT login flow when Codex has no account", async () => {
    let socket: FakeCodexSocket | undefined;
    const provider = new CodexAppServerProvider({
      transport: new CodexAppServerWebSocketTransport({
        url: "ws://codex.test",
        requestTimeoutMs: 1000,
        turnTimeoutMs: 1000,
        webSocketFactory: () => {
          socket = new FakeCodexSocket({ account: { authMode: null } });
          return socket;
        }
      })
    });

    await expect(async () => {
      for await (const _event of provider.stream(baseRequest)) {
        // The unauthenticated account should fail before any model events stream.
      }
    }).rejects.toMatchObject({
      code: "codex_auth_required",
      login: {
        type: "chatgpt",
        loginId: "login_test",
        authUrl: "https://chatgpt.test/oauth"
      }
    } satisfies Partial<CodexAppServerAuthRequiredError>);
    expect(socket?.sent.find((message) => message.method === "account/read")).toBeTruthy();
    expect(socket?.sent.find((message) => message.method === "account/login/start")?.params).toEqual({ type: "chatgpt" });
    expect(socket?.sent.some((message) => message.method === "thread/start")).toBe(false);
  });

  it("auto-starts a local Codex app-server before retrying an agent turn", async () => {
    const starts: CodexAppServerStartOptions[] = [];
    let attempts = 0;
    let socket: FakeCodexSocket | undefined;
    const provider = new CodexAppServerProvider({
      transport: new CodexAppServerWebSocketTransport({
        url: "ws://127.0.0.1:4500",
        requestTimeoutMs: 1000,
        turnTimeoutMs: 1000,
        autoStart: true,
        appServerStarter: async (options) => {
          starts.push(options);
        },
        webSocketFactory: () => {
          attempts += 1;
          if (attempts === 1) return new FailingCodexSocket("Received network error or non-101 status code");
          socket = new FakeCodexSocket();
          return socket;
        }
      })
    });

    const events = [];
    for await (const event of provider.stream(baseRequest)) events.push(event);

    expect(starts).toEqual([{ url: "ws://127.0.0.1:4500", command: undefined, timeoutMs: 1000 }]);
    expect(attempts).toBe(2);
    expect(socket?.sent.find((message) => message.method === "account/read")).toBeTruthy();
    expect(events).toEqual(expect.arrayContaining([{ type: "message.completed", content: "The map request was handed to OpenTabletop." }]));
  });

  it("reports Codex app-server command startup failures through the provider error", async () => {
    const provider = new CodexAppServerProvider({
      transport: new CodexAppServerWebSocketTransport({
        url: "ws://127.0.0.1:4500",
        requestTimeoutMs: 1000,
        turnTimeoutMs: 1000,
        autoStart: true,
        codexCommand: "__missing_codex_app_server_command__",
        webSocketFactory: () => new FailingCodexSocket("Received network error or non-101 status code")
      })
    });

    await expect(async () => {
      for await (const _event of provider.stream(baseRequest)) {
        // The missing app-server command should fail before any model events stream.
      }
    }).rejects.toThrow(/Failed to start Codex app-server.*ENOENT/);
  });

  it("returns generated image bytes from Codex app-server imageGeneration items", async () => {
    let socket: FakeCodexImageSocket | undefined;
    const transport = new CodexAppServerWebSocketTransport({
      url: "ws://codex.test",
      requestTimeoutMs: 1000,
      turnTimeoutMs: 1000,
      webSocketFactory: () => {
        socket = new FakeCodexImageSocket();
        return socket;
      }
    });

    const image = await transport.generateImage({
      prompt: "Generate a PNG battle map.",
      outputFormat: "png"
    });

    expect(image).toEqual({
      base64: "aGVsbG8=",
      revisedPrompt: "Revised image prompt",
      savedPath: "C:\\Users\\treyg\\.codex\\generated_images\\probe.png",
      status: "generating"
    });
    expect(socket?.sent.find((message) => message.method === "modelProvider/capabilities/read")).toBeTruthy();
    expect(socket?.sent.find((message) => message.method === "thread/start")?.params).toMatchObject({
      developerInstructions: expect.stringContaining("Do not return SVG")
    });
  });
});

class FakeCodexSocket {
  readonly sent: Array<{ id?: string | number; method?: string; params?: unknown; result?: unknown; error?: unknown }> = [];
  toolResponse: unknown;
  private readonly listeners = new Map<string, Set<(event: { data?: unknown; reason?: string; message?: string }) => void>>();

  constructor(private readonly options: { account?: unknown } = {}) {
    queueMicrotask(() => this.emit("open", {}));
  }

  send(data: string): void {
    const message = JSON.parse(data) as { id?: string | number; method?: string; params?: unknown; result?: unknown; error?: unknown };
    this.sent.push(message);
    if (message.result && message.id === 1) {
      this.toolResponse = message;
      this.emitMessage({
        method: "item/completed",
        params: {
          item: {
            type: "agentMessage",
            text: "The map request was handed to OpenTabletop."
          }
        }
      });
      this.emitMessage({ method: "turn/completed", params: { threadId: "codex_thread", turn: { id: "codex_turn", status: "completed" } } });
      return;
    }
    if (message.method === "initialize") {
      this.emitMessage({ id: message.id, result: { userAgent: "fake", codexHome: "C:\\tmp", platformFamily: "windows", platformOs: "windows" } });
      return;
    }
    if (message.method === "account/read") {
      this.emitMessage({ id: message.id, result: this.options.account ?? { authMode: "chatgpt" } });
      return;
    }
    if (message.method === "account/login/start") {
      this.emitMessage({ id: message.id, result: { type: "chatgpt", loginId: "login_test", authUrl: "https://chatgpt.test/oauth" } });
      return;
    }
    if (message.method === "thread/start") {
      this.emitMessage({ id: message.id, result: { thread: { id: "codex_thread" } } });
      return;
    }
    if (message.method === "turn/start") {
      this.emitMessage({ id: message.id, result: { turn: { id: "codex_turn" } } });
      this.emitMessage({
        id: 1,
        method: "item/tool/call",
        params: {
          threadId: "codex_thread",
          turnId: "codex_turn",
          callId: "call_1",
          namespace: "open_tabletop",
          tool: "generate_map_asset",
          arguments: { prompt: "ember vault tactical battlemap", name: "Ember Vault Map", sceneId: "scn_vault" }
        }
      });
    }
  }

  close(): void {
    this.emit("close", {});
  }

  addEventListener(type: "open" | "message" | "error" | "close", listener: (event: { data?: unknown; reason?: string; message?: string }) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: "open" | "message" | "error" | "close", listener: (event: { data?: unknown; reason?: string; message?: string }) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  private emitMessage(message: unknown): void {
    this.emit("message", { data: JSON.stringify(message) });
  }

  private emit(type: string, event: { data?: unknown; reason?: string; message?: string }): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

class FailingCodexSocket {
  private readonly listeners = new Map<string, Set<(event: { data?: unknown; reason?: string; message?: string }) => void>>();

  constructor(message: string) {
    queueMicrotask(() => this.emit("error", { message }));
  }

  send(_data: string): void {}

  close(): void {
    this.emit("close", {});
  }

  addEventListener(type: "open" | "message" | "error" | "close", listener: (event: { data?: unknown; reason?: string; message?: string }) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: "open" | "message" | "error" | "close", listener: (event: { data?: unknown; reason?: string; message?: string }) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  private emit(type: string, event: { data?: unknown; reason?: string; message?: string }): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

class FakeCodexImageSocket {
  readonly sent: Array<{ id?: string | number; method?: string; params?: unknown; result?: unknown; error?: unknown }> = [];
  private readonly listeners = new Map<string, Set<(event: { data?: unknown; reason?: string; message?: string }) => void>>();

  constructor() {
    queueMicrotask(() => this.emit("open", {}));
  }

  send(data: string): void {
    const message = JSON.parse(data) as { id?: string | number; method?: string; params?: unknown; result?: unknown; error?: unknown };
    this.sent.push(message);
    if (message.method === "initialize") {
      this.emitMessage({ id: message.id, result: { userAgent: "fake", codexHome: "C:\\tmp", platformFamily: "windows", platformOs: "windows" } });
      return;
    }
    if (message.method === "account/read") {
      this.emitMessage({ id: message.id, result: { authMode: "chatgpt" } });
      return;
    }
    if (message.method === "modelProvider/capabilities/read") {
      this.emitMessage({ id: message.id, result: { namespaceTools: true, imageGeneration: true, webSearch: true } });
      return;
    }
    if (message.method === "thread/start") {
      this.emitMessage({ id: message.id, result: { thread: { id: "codex_image_thread" } } });
      return;
    }
    if (message.method === "turn/start") {
      this.emitMessage({ id: message.id, result: { turn: { id: "codex_image_turn" } } });
      this.emitMessage({
        method: "item/completed",
        params: {
          item: {
            id: "img_1",
            type: "imageGeneration",
            result: "aGVsbG8=",
            revisedPrompt: "Revised image prompt",
            savedPath: "C:\\Users\\treyg\\.codex\\generated_images\\probe.png",
            status: "generating"
          }
        }
      });
      this.emitMessage({ method: "turn/completed", params: { threadId: "codex_image_thread", turn: { id: "codex_image_turn", status: "completed" } } });
    }
  }

  close(): void {
    this.emit("close", {});
  }

  addEventListener(type: "open" | "message" | "error" | "close", listener: (event: { data?: unknown; reason?: string; message?: string }) => void): void {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: "open" | "message" | "error" | "close", listener: (event: { data?: unknown; reason?: string; message?: string }) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  private emitMessage(message: unknown): void {
    this.emit("message", { data: JSON.stringify(message) });
  }

  private emit(type: string, event: { data?: unknown; reason?: string; message?: string }): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}
