import type { AiProviderRequest } from "@open-tabletop/ai-core";
import { describe, expect, it } from "vitest";
import {
  CodexAppServerAuthRequiredError,
  CodexAppServerProvider,
  CodexAppServerWebSocketTransport,
  codexAppServerCommandCandidates,
  startLocalCodexAppServer,
  stopLocalCodexAppServers,
  type CodexAppServerStartDependencies,
  type CodexAppServerStartOptions
} from "./index";

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
  it("resolves local Windows Codex launcher aliases to cmd shims", () => {
    expect(codexAppServerCommandCandidates({ command: "codex", platform: "win32", env: { APPDATA: "C:\\Users\\treyg\\AppData\\Roaming" } })).toEqual([
      { command: "C:\\Users\\treyg\\AppData\\Roaming\\npm\\codex.cmd", shell: true },
      { command: "codex.cmd", shell: true },
      { command: "codex", shell: false }
    ]);
    expect(codexAppServerCommandCandidates({ platform: "linux", cwd: "/app", env: {} })).toEqual([
      { command: "/app/apps/api/node_modules/.bin/codex", shell: false },
      { command: "/app/node_modules/.bin/codex", shell: false },
      { command: "codex", shell: false }
    ]);
    expect(codexAppServerCommandCandidates({ command: "C:\\Tools\\codex.cmd", platform: "win32", env: {} })).toEqual([{ command: "C:\\Tools\\codex.cmd", shell: true }]);
  });

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
      { type: "reasoning.delta", delta: "Checking the active scene and available map tools.", summaryIndex: 0 },
      { type: "reasoning.completed", content: "Checked the active scene and selected a proposal-backed map tool." },
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
    const initializeParams = socket?.sent.find((message) => message.method === "initialize")?.params as { capabilities?: { optOutNotificationMethods?: string[] } } | undefined;
    const optOutMethods = initializeParams?.capabilities?.optOutNotificationMethods ?? [];
    expect(optOutMethods).not.toContain("item/reasoning/summaryTextDelta");
    expect(optOutMethods).toContain("item/reasoning/textDelta");
    expect(socket?.sent.find((message) => message.method === "thread/start")?.params).toMatchObject({
      baseInstructions: expect.stringContaining("create missing actor/token records"),
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

  it("yields reasoning summary deltas before Codex turn completion", async () => {
    let socket: ReasoningBeforeCompletionCodexSocket | undefined;
    const provider = new CodexAppServerProvider({
      transport: new CodexAppServerWebSocketTransport({
        url: "ws://codex.test",
        requestTimeoutMs: 1000,
        turnTimeoutMs: 1000,
        webSocketFactory: () => {
          socket = new ReasoningBeforeCompletionCodexSocket();
          return socket;
        }
      })
    });

    const iterator = provider.stream(baseRequest)[Symbol.asyncIterator]();
    const first = await iterator.next();
    expect(first).toEqual({
      done: false,
      value: { type: "reasoning.delta", delta: "Reviewing the requested scene setup.", summaryIndex: 0 }
    });
    expect(socket?.completed).toBe(false);

    const rest = [];
    for (let next = await iterator.next(); !next.done; next = await iterator.next()) rest.push(next.value);
    expect(socket?.completed).toBe(true);
    expect(rest).toEqual([{ type: "message.completed", content: "Scene setup finished." }]);
  });

  it("stops the app-server turn when a streaming consumer returns early", async () => {
    let socket: ReasoningBeforeCompletionCodexSocket | undefined;
    const provider = new CodexAppServerProvider({
      transport: new CodexAppServerWebSocketTransport({
        url: "ws://codex.test",
        requestTimeoutMs: 1000,
        turnTimeoutMs: 1000,
        webSocketFactory: () => {
          socket = new ReasoningBeforeCompletionCodexSocket();
          return socket;
        }
      })
    });

    const iterator = provider.stream(baseRequest)[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toMatchObject({ done: false, value: { type: "reasoning.delta" } });
    await iterator.return?.();

    expect(socket?.closed).toBe(true);
    expect(socket?.completed).toBe(false);
  });

  it("aborts a pending websocket connection even when provider timeouts are disabled", async () => {
    const abortController = new AbortController();
    let socket: NeverOpeningCodexSocket | undefined;
    const provider = new CodexAppServerProvider({
      transport: new CodexAppServerWebSocketTransport({
        url: "ws://codex.test",
        requestTimeoutMs: 0,
        turnTimeoutMs: 0,
        webSocketFactory: () => {
          socket = new NeverOpeningCodexSocket();
          return socket;
        },
      }),
    });
    const iterator = provider.stream({ ...baseRequest, signal: abortController.signal })[Symbol.asyncIterator]();
    const next = iterator.next();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(socket).toBeDefined();
    abortController.abort();

    await expect(next).rejects.toMatchObject({ name: "AbortError" });
    expect(socket?.closed).toBe(true);
  });

  it("aborts a managed startup wait even when provider timeouts are disabled", async () => {
    const abortController = new AbortController();
    let starterSignal: AbortSignal | undefined;
    let starterCalled!: () => void;
    const started = new Promise<void>((resolve) => { starterCalled = resolve; });
    const provider = new CodexAppServerProvider({
      transport: new CodexAppServerWebSocketTransport({
        url: "ws://127.0.0.1:4500",
        requestTimeoutMs: 0,
        turnTimeoutMs: 0,
        autoStart: true,
        appServerStarter: async (options) => {
          starterSignal = options.signal;
          starterCalled();
          await new Promise<void>(() => undefined);
        },
        webSocketFactory: () => new FailingCodexSocket("connection refused"),
      }),
    });
    const iterator = provider.stream({ ...baseRequest, signal: abortController.signal })[Symbol.asyncIterator]();
    const next = iterator.next();
    await started;

    abortController.abort();

    await expect(next).rejects.toMatchObject({ name: "AbortError" });
    expect(starterSignal?.aborted).toBe(true);
  });

  it("aborts the default managed startup, terminates its child, and permits a clean retry", async () => {
    const children: FakeCodexChildProcess[] = [];
    const fetchSignals: Array<AbortSignal | null | undefined> = [];
    const dependencies: CodexAppServerStartDependencies = {
      fetch: async (_input, init) => {
        fetchSignals.push(init?.signal);
        return new Response(null, { status: 503 });
      },
      spawn: (() => {
        const child = new FakeCodexChildProcess();
        children.push(child);
        return child;
      }) as unknown as CodexAppServerStartDependencies["spawn"]
    };
    const options = {
      url: "ws://127.0.0.1:45988",
      command: "C:\\fake\\codex.exe",
      timeoutMs: 0
    };

    const firstAbort = new AbortController();
    const first = startLocalCodexAppServer({ ...options, signal: firstAbort.signal }, dependencies);
    await waitUntil(() => children.length === 1);
    firstAbort.abort();

    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    expect(children[0]?.killed).toBe(true);

    const secondAbort = new AbortController();
    const second = startLocalCodexAppServer({ ...options, signal: secondAbort.signal }, dependencies);
    await waitUntil(() => children.length === 2);
    secondAbort.abort();

    await expect(second).rejects.toMatchObject({ name: "AbortError" });
    expect(children[1]?.killed).toBe(true);
    expect(fetchSignals.length).toBeGreaterThanOrEqual(4);
    expect(fetchSignals.every((signal) => signal instanceof AbortSignal)).toBe(true);
  });

  it("awaits Windows process-tree cleanup when an aborted shell child ignores graceful termination", async () => {
    const child = new FakeCodexChildProcess({ ignoreGracefulKill: true, pid: 45_991 });
    const processTreeTerminations: number[] = [];
    let spawnedWithShell: boolean | undefined;
    let cleanupCompleted = false;
    const abortController = new AbortController();
    const start = startLocalCodexAppServer(
      {
        url: "ws://127.0.0.1:45991",
        command: "C:\\fake\\codex.cmd",
        timeoutMs: 0,
        signal: abortController.signal
      },
      {
        platform: "win32",
        stopTimeoutMs: 0,
        forceKillTimeoutMs: 20,
        fetch: async () => new Response(null, { status: 503 }),
        spawn: ((_command: string, _args: readonly string[], options?: { shell?: boolean }) => {
          spawnedWithShell = options?.shell === true;
          return child;
        }) as unknown as CodexAppServerStartDependencies["spawn"],
        terminateWindowsProcessTree: async (pid) => {
          processTreeTerminations.push(pid);
          await new Promise((resolve) => setTimeout(resolve, 1));
          cleanupCompleted = true;
          throw Object.assign(new Error("process already exited"), { code: 128 });
        }
      }
    );
    await waitUntil(() => spawnedWithShell !== undefined);
    abortController.abort();

    await expect(start).rejects.toMatchObject({ name: "AbortError" });

    expect(spawnedWithShell).toBe(true);
    expect(child.killSignals).toEqual([undefined]);
    expect(processTreeTerminations).toEqual([45_991]);
    expect(cleanupCompleted).toBe(true);
  });

  it("bounds readiness probes even when fetch never settles", async () => {
    const children: FakeCodexChildProcess[] = [];
    const start = startLocalCodexAppServer(
      { url: "ws://127.0.0.1:45989", command: "C:\\fake\\codex.exe", timeoutMs: 15 },
      {
        fetch: async () => await new Promise<Response>(() => undefined),
        spawn: (() => {
          const child = new FakeCodexChildProcess();
          children.push(child);
          return child;
        }) as unknown as CodexAppServerStartDependencies["spawn"]
      }
    );

    await expect(Promise.race([
      start,
      new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("readiness probe was not bounded")), 500))
    ])).rejects.toThrow("Timed out waiting for Codex app-server readiness");
    expect(children).toHaveLength(1);
    expect(children[0]?.killed).toBe(true);
  });

  it("stops a successfully started managed app-server child", async () => {
    const child = new FakeCodexChildProcess();
    let spawned = false;
    await startLocalCodexAppServer(
      { url: "ws://127.0.0.1:45990", command: "C:\\fake\\codex.exe", timeoutMs: 100 },
      {
        fetch: async () => new Response(null, { status: spawned ? 200 : 503 }),
        spawn: (() => {
          spawned = true;
          return child;
        }) as unknown as CodexAppServerStartDependencies["spawn"]
      }
    );

    expect(child.killed).toBe(false);
    await stopLocalCodexAppServers({ timeoutMs: 20, forceKillTimeoutMs: 20 });

    expect(child.killed).toBe(true);
  });

  it("yields app-server item lifecycle activity as safe progress events", async () => {
    let socket: ActivityCodexSocket | undefined;
    const provider = new CodexAppServerProvider({
      transport: new CodexAppServerWebSocketTransport({
        url: "ws://codex.test",
        requestTimeoutMs: 1000,
        turnTimeoutMs: 1000,
        webSocketFactory: () => {
          socket = new ActivityCodexSocket();
          return socket;
        }
      })
    });

    const events = [];
    for await (const event of provider.stream(baseRequest)) events.push(event);

    expect(events).toEqual([
      { type: "activity.reported", message: "Searching the web: forest clearing map references", itemType: "webSearch", itemId: "web_1", status: "started" },
      { type: "activity.reported", message: "Web search complete", itemType: "webSearch", itemId: "web_1", status: "completed" },
      { type: "activity.reported", message: "Using tool: generate map asset", itemType: "dynamicToolCall", itemId: "tool_1", status: "started" },
      { type: "activity.reported", message: "Tool complete", itemType: "dynamicToolCall", itemId: "tool_1", status: "completed" },
      { type: "message.completed", content: "Activity finished." }
    ]);
    expect(socket?.sent.find((message) => message.method === "turn/start")).toBeTruthy();
  });

  it("rejects dynamic tool requests outside the OpenTabletop namespace", async () => {
    let socket: FakeCodexSocket | undefined;
    let executed = false;
    const provider = new CodexAppServerProvider({
      transport: new CodexAppServerWebSocketTransport({
        url: "ws://codex.test",
        requestTimeoutMs: 1000,
        turnTimeoutMs: 1000,
        webSocketFactory: () => {
          socket = new FakeCodexSocket({
            toolCallParams: {
              namespace: "other_namespace",
              tool: "generate_map_asset",
              arguments: { prompt: "ember vault tactical battlemap", name: "Ember Vault Map" }
            }
          });
          return socket;
        }
      })
    });

    const events = [];
    for await (const event of provider.stream({
      ...baseRequest,
      executeTool: async () => {
        executed = true;
        return { proposalId: "prop_map" };
      }
    })) {
      events.push(event);
    }

    expect(executed).toBe(false);
    expect(events.some((event) => event.type === "tool.started")).toBe(false);
    expect(socket?.toolResponse).toMatchObject({ id: 1, result: { success: false } });
  });

  it("rejects dynamic tool requests for tools that were not advertised", async () => {
    let socket: FakeCodexSocket | undefined;
    let executed = false;
    const provider = new CodexAppServerProvider({
      transport: new CodexAppServerWebSocketTransport({
        url: "ws://codex.test",
        requestTimeoutMs: 1000,
        turnTimeoutMs: 1000,
        webSocketFactory: () => {
          socket = new FakeCodexSocket({
            toolCallParams: {
              namespace: "open_tabletop",
              tool: "delete_campaign",
              arguments: { campaignId: "camp_demo" }
            }
          });
          return socket;
        }
      })
    });

    const events = [];
    for await (const event of provider.stream({
      ...baseRequest,
      executeTool: async () => {
        executed = true;
        return { ok: true };
      }
    })) {
      events.push(event);
    }

    expect(executed).toBe(false);
    expect(events.some((event) => event.type === "tool.started")).toBe(false);
    expect(socket?.toolResponse).toMatchObject({ id: 1, result: { success: false } });
  });

  it("extends the turn timeout after successful in-turn tool implementation progress", async () => {
    let socket: SlowCompletionCodexSocket | undefined;
    const provider = new CodexAppServerProvider({
      transport: new CodexAppServerWebSocketTransport({
        url: "ws://codex.test",
        requestTimeoutMs: 1000,
        turnTimeoutMs: 80,
        webSocketFactory: () => {
          socket = new SlowCompletionCodexSocket();
          return socket;
        }
      })
    });

    const events = [];
    for await (const event of provider.stream({
      ...baseRequest,
      executeTool: async () => {
        await new Promise((resolve) => setTimeout(resolve, 60));
        return { proposalId: "prop_map", implemented: true };
      }
    })) events.push(event);

    expect(events).toEqual([
      {
        type: "tool.started",
        toolName: "generate_map_asset",
        input: { prompt: "ember vault tactical battlemap", name: "Ember Vault Map", sceneId: "scn_vault" }
      },
      { type: "tool.completed", toolName: "generate_map_asset", output: { proposalId: "prop_map", implemented: true } },
      { type: "message.completed", content: "The map proposal was implemented." }
    ]);
    expect(socket?.toolResponse).toMatchObject({ id: 1, result: { success: true } });
  });

  it("allows zero to disable request and turn timers", async () => {
    let socket: ReasoningBeforeCompletionCodexSocket | undefined;
    const provider = new CodexAppServerProvider({
      transport: new CodexAppServerWebSocketTransport({
        url: "ws://codex.test",
        requestTimeoutMs: 0,
        turnTimeoutMs: 0,
        webSocketFactory: () => {
          socket = new ReasoningBeforeCompletionCodexSocket();
          return socket;
        },
      }),
    });

    const events = [];
    for await (const event of provider.stream(baseRequest)) events.push(event);

    expect(socket?.completed).toBe(true);
    expect(events).toEqual(expect.arrayContaining([{ type: "message.completed", content: "Scene setup finished." }]));
  });

  it("rejects pending requests on a websocket error when timeouts are disabled", async () => {
    const provider = new CodexAppServerProvider({
      transport: new CodexAppServerWebSocketTransport({
        url: "ws://codex.test",
        requestTimeoutMs: 0,
        turnTimeoutMs: 0,
        webSocketFactory: () => new RpcErrorAfterOpenCodexSocket(),
      }),
    });

    await expect(async () => {
      for await (const _event of provider.stream(baseRequest)) {
        // The RPC fails before any provider event is emitted.
      }
    }).rejects.toThrow("socket error: simulated RPC transport failure");
  });

  it("does not leak a rejected turn-completion promise when turn/start is rejected", async () => {
    const provider = new CodexAppServerProvider({
      transport: new CodexAppServerWebSocketTransport({
        url: "ws://codex.test",
        requestTimeoutMs: 0,
        turnTimeoutMs: 0,
        webSocketFactory: () => new RejectTurnStartCodexSocket(false)
      })
    });

    await expect(async () => {
      for await (const _event of provider.stream(baseRequest)) {
        // turn/start rejects before a completion event can be emitted.
      }
    }).rejects.toThrow("turn_start_rejected");
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

  it("can request Codex device-code login for hosted app-server auth", async () => {
    let socket: FakeCodexSocket | undefined;
    const provider = new CodexAppServerProvider({
      transport: new CodexAppServerWebSocketTransport({
        url: "ws://codex.test",
        requestTimeoutMs: 1000,
        turnTimeoutMs: 1000,
        loginType: "chatgptDeviceCode",
        webSocketFactory: () => {
          socket = new FakeCodexSocket({ account: { authMode: null } });
          return socket;
        }
      })
    });

    await expect(async () => {
      for await (const _event of provider.stream(baseRequest)) {
        // The hosted app-server should fail with a frontend-owned device-code login.
      }
    }).rejects.toMatchObject({
      code: "codex_auth_required",
      login: {
        type: "chatgptDeviceCode",
        loginId: "login_test",
        verificationUrl: "https://auth.openai.test/codex/device",
        userCode: "ABCD-1234"
      }
    } satisfies Partial<CodexAppServerAuthRequiredError>);
    expect(socket?.sent.find((message) => message.method === "account/login/start")?.params).toEqual({ type: "chatgptDeviceCode" });
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

    expect(starts).toEqual([expect.objectContaining({ url: "ws://127.0.0.1:4500", command: undefined, timeoutMs: 1000, signal: expect.any(AbortSignal) })]);
    expect(attempts).toBe(2);
    expect(socket?.sent.find((message) => message.method === "account/read")).toBeTruthy();
    expect(events).toEqual(expect.arrayContaining([{ type: "message.completed", content: "The map request was handed to OpenTabletop." }]));
  });

  it("passes a disabled request timeout through to managed app-server startup", async () => {
    const starts: CodexAppServerStartOptions[] = [];
    const provider = new CodexAppServerProvider({
      transport: new CodexAppServerWebSocketTransport({
        url: "ws://127.0.0.1:4500",
        requestTimeoutMs: 0,
        turnTimeoutMs: 0,
        autoStart: true,
        appServerStarter: async (options) => {
          starts.push(options);
        },
        webSocketFactory: () => new FailingCodexSocket("connection refused"),
      }),
    });

    await expect(async () => {
      for await (const _event of provider.stream(baseRequest)) {
        // Both the initial and post-start connection attempts fail.
      }
    }).rejects.toThrow("still failed");
    expect(starts).toEqual([expect.objectContaining({ url: "ws://127.0.0.1:4500", command: undefined, timeoutMs: 0, signal: expect.any(AbortSignal) })]);
  });

  it("reports Codex app-server command startup failures through the provider error", async () => {
    const provider = new CodexAppServerProvider({
      transport: new CodexAppServerWebSocketTransport({
        url: "ws://127.0.0.1:45987",
        requestTimeoutMs: 1000,
        turnTimeoutMs: 1000,
        autoStart: true,
        codexCommand: "C:\\__missing_codex_app_server_command__\\codex.exe",
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
      outputFormat: "png",
      sourceImages: [{ url: "https://assets.test/source-map.png", mimeType: "image/png" }]
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
    expect(socket?.sent.find((message) => message.method === "turn/start")?.params).toMatchObject({
      input: [
        expect.objectContaining({ type: "text", text: "Generate a PNG battle map." }),
        expect.objectContaining({ type: "image", url: "https://assets.test/source-map.png", mimeType: "image/png" })
      ]
    });
  });

  it("does not leak a rejected image-completion promise when turn/start is rejected", async () => {
    const transport = new CodexAppServerWebSocketTransport({
      url: "ws://codex.test",
      requestTimeoutMs: 0,
      turnTimeoutMs: 0,
      webSocketFactory: () => new RejectTurnStartCodexSocket(true)
    });

    await expect(transport.generateImage({ prompt: "Generate a PNG battle map." })).rejects.toThrow("turn_start_rejected");
  });
});

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Timed out waiting for test condition");
}

class FakeCodexChildProcess {
  exitCode: number | null = null;
  killed = false;
  readonly killSignals: Array<NodeJS.Signals | number | undefined> = [];
  readonly stdout = undefined;
  readonly stderr = undefined;
  readonly pid: number;
  private readonly listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  constructor(private readonly options: { ignoreGracefulKill?: boolean; pid?: number } = {}) {
    this.pid = options.pid ?? 45_000;
  }

  once(event: string, listener: (...args: unknown[]) => void): this {
    const wrapped = (...args: unknown[]) => {
      this.off(event, wrapped);
      listener(...args);
    };
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(wrapped);
    this.listeners.set(event, listeners);
    return this;
  }

  off(event: string, listener: (...args: unknown[]) => void): this {
    const listeners = this.listeners.get(event);
    if (!listeners) return this;
    for (const registered of listeners) {
      if (registered === listener || registered.name === listener.name) listeners.delete(registered);
    }
    return this;
  }

  kill(signal?: NodeJS.Signals | number): boolean {
    this.killed = true;
    this.killSignals.push(signal);
    if (this.options.ignoreGracefulKill && signal !== "SIGKILL") return true;
    this.markExited();
    return true;
  }

  markExited(exitCode = 0): void {
    this.exitCode = exitCode;
    this.emit("exit", exitCode, null);
  }

  private emit(event: string, ...args: unknown[]): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) listener(...args);
  }
}

class RejectTurnStartCodexSocket {
  private readonly listeners = new Map<string, Set<(event: { data?: unknown; reason?: string; message?: string }) => void>>();

  constructor(private readonly imageGeneration: boolean) {
    queueMicrotask(() => this.emit("open", {}));
  }

  send(data: string): void {
    const message = JSON.parse(data) as { id?: string | number; method?: string };
    if (message.method === "initialized") return;
    if (message.method === "initialize") {
      this.emitMessage({ id: message.id, result: { userAgent: "fake" } });
      return;
    }
    if (message.method === "account/read") {
      this.emitMessage({ id: message.id, result: { authMode: "chatgpt" } });
      return;
    }
    if (message.method === "modelProvider/capabilities/read") {
      this.emitMessage({ id: message.id, result: { imageGeneration: this.imageGeneration } });
      return;
    }
    if (message.method === "thread/start") {
      this.emitMessage({ id: message.id, result: { thread: { id: "codex_thread" } } });
      return;
    }
    if (message.method === "turn/start") {
      this.emitMessage({ id: message.id, error: { code: -32_000, message: "turn_start_rejected" } });
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

class FakeCodexSocket {
  readonly sent: Array<{ id?: string | number; method?: string; params?: unknown; result?: unknown; error?: unknown }> = [];
  toolResponse: unknown;
  private readonly listeners = new Map<string, Set<(event: { data?: unknown; reason?: string; message?: string }) => void>>();

  constructor(private readonly options: { account?: unknown; toolCallParams?: Record<string, unknown> } = {}) {
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
      const params = message.params as { type?: string } | undefined;
      if (params?.type === "chatgptDeviceCode") {
        this.emitMessage({ id: message.id, result: { type: "chatgptDeviceCode", loginId: "login_test", verificationUrl: "https://auth.openai.test/codex/device", userCode: "ABCD-1234" } });
        return;
      }
      this.emitMessage({ id: message.id, result: { type: "chatgpt", loginId: "login_test", authUrl: "https://chatgpt.test/oauth" } });
      return;
    }
    if (message.method === "thread/start") {
      this.emitMessage({ id: message.id, result: { thread: { id: "codex_thread" } } });
      return;
    }
    if (message.method === "turn/start") {
      this.emitMessage({ id: message.id, result: { turn: { id: "codex_turn" } } });
      this.emitMessage({ method: "item/reasoning/summaryTextDelta", params: { itemId: "rsn_1", summaryIndex: 0, delta: "Checking the active scene and available map tools." } });
      this.emitMessage({ method: "item/completed", params: { item: { id: "rsn_1", type: "reasoning", summary: [{ text: "Checked the active scene and selected a proposal-backed map tool." }] } } });
      this.emitMessage({
        id: 1,
        method: "item/tool/call",
        params: {
          threadId: "codex_thread",
          turnId: "codex_turn",
          callId: "call_1",
          namespace: "open_tabletop",
          tool: "generate_map_asset",
          arguments: { prompt: "ember vault tactical battlemap", name: "Ember Vault Map", sceneId: "scn_vault" },
          ...this.options.toolCallParams
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

class RpcErrorAfterOpenCodexSocket {
  private readonly listeners = new Map<string, Set<(event: { data?: unknown; reason?: string; message?: string }) => void>>();

  constructor() {
    queueMicrotask(() => this.emit("open", {}));
  }

  send(_data: string): void {
    queueMicrotask(() => this.emit("error", { message: "simulated RPC transport failure" }));
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

  private emit(type: string, event: { data?: unknown; reason?: string; message?: string }): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

class NeverOpeningCodexSocket {
  closed = false;
  private readonly listeners = new Map<string, Set<(event: { data?: unknown; reason?: string; message?: string }) => void>>();

  send(_data: string): void {}

  close(): void {
    this.closed = true;
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

class ReasoningBeforeCompletionCodexSocket {
  readonly sent: Array<{ id?: string | number; method?: string; params?: unknown; result?: unknown; error?: unknown }> = [];
  completed = false;
  closed = false;
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
    if (message.method === "thread/start") {
      this.emitMessage({ id: message.id, result: { thread: { id: "codex_thread" } } });
      return;
    }
    if (message.method === "turn/start") {
      this.emitMessage({ id: message.id, result: { turn: { id: "codex_turn" } } });
      this.emitMessage({ method: "item/reasoning/summaryTextDelta", params: { itemId: "rsn_1", summaryIndex: 0, delta: "Reviewing the requested scene setup." } });
      setTimeout(() => {
        this.completed = true;
        this.emitMessage({ method: "item/completed", params: { item: { id: "msg_1", type: "agentMessage", text: "Scene setup finished." } } });
        this.emitMessage({ method: "turn/completed", params: { threadId: "codex_thread", turn: { id: "codex_turn", status: "completed" } } });
      }, 50);
    }
  }

  close(): void {
    this.closed = true;
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

class SlowCompletionCodexSocket {
  readonly sent: Array<{ id?: string | number; method?: string; params?: unknown; result?: unknown; error?: unknown }> = [];
  toolResponse: unknown;
  private readonly listeners = new Map<string, Set<(event: { data?: unknown; reason?: string; message?: string }) => void>>();

  constructor() {
    queueMicrotask(() => this.emit("open", {}));
  }

  send(data: string): void {
    const message = JSON.parse(data) as { id?: string | number; method?: string; params?: unknown; result?: unknown; error?: unknown };
    this.sent.push(message);
    if (message.result && message.id === 1) {
      this.toolResponse = message;
      setTimeout(() => {
        this.emitMessage({
          method: "item/completed",
          params: {
            item: {
              type: "agentMessage",
              text: "The map proposal was implemented."
            }
          }
        });
        this.emitMessage({ method: "turn/completed", params: { threadId: "codex_thread", turn: { id: "codex_turn", status: "completed" } } });
      }, 50);
      return;
    }
    if (message.method === "initialize") {
      this.emitMessage({ id: message.id, result: { userAgent: "fake", codexHome: "C:\\tmp", platformFamily: "windows", platformOs: "windows" } });
      return;
    }
    if (message.method === "account/read") {
      this.emitMessage({ id: message.id, result: { authMode: "chatgpt" } });
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

class ActivityCodexSocket {
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
    if (message.method === "thread/start") {
      this.emitMessage({ id: message.id, result: { thread: { id: "codex_thread" } } });
      return;
    }
    if (message.method === "turn/start") {
      this.emitMessage({ id: message.id, result: { turn: { id: "codex_turn" } } });
      this.emitMessage({ method: "item/started", params: { item: { id: "web_1", type: "webSearch", action: { type: "search", query: "forest clearing map references" } } } });
      this.emitMessage({ method: "item/completed", params: { item: { id: "web_1", type: "webSearch", status: "completed" } } });
      this.emitMessage({ method: "item/started", params: { item: { id: "tool_1", type: "dynamicToolCall", tool: "generate_map_asset" } } });
      this.emitMessage({ method: "item/completed", params: { item: { id: "tool_1", type: "dynamicToolCall", status: "completed" } } });
      this.emitMessage({ method: "item/completed", params: { item: { id: "msg_1", type: "agentMessage", text: "Activity finished." } } });
      this.emitMessage({ method: "turn/completed", params: { threadId: "codex_thread", turn: { id: "codex_turn", status: "completed" } } });
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
