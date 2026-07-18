import { existsSync } from "node:fs";
import type { AiProvider, AiProviderEvent, AiProviderRequest } from "../../packages/ai-core/src/index.js";
import { CodexAppServerProvider, LoopbackCodexTransport } from "../../packages/codex-app-server-provider/src/index.js";
import { registerApiRuntimeShutdown, startApiRuntime } from "../../apps/api/src/runtime.js";

const controlledDelayMarker = "[e2e-provider-delay]";

class GatedE2eAiProvider implements AiProvider {
  readonly id = "e2e-gated-codex-loopback";
  readonly label = "E2E gated Codex loopback";
  readonly executesToolsInTurn: boolean;

  constructor(private readonly delegate: AiProvider) {
    this.executesToolsInTurn = delegate.executesToolsInTurn === true;
  }

  async *stream(input: AiProviderRequest): AsyncIterable<AiProviderEvent> {
    if (!input.messages.some((message) => message.content.includes(controlledDelayMarker))) {
      yield* this.delegate.stream(input);
      return;
    }

    const gatePath = process.env.OTTE_E2E_AI_GATE_PATH;
    if (!gatePath) throw new Error("OTTE_E2E_AI_GATE_PATH is required for controlled E2E AI turns");
    await waitForProviderRelease(gatePath, input.signal);
    yield {
      type: "message.completed",
      content: "The controlled E2E provider turn completed after the table mutation.",
    };
  }
}

async function waitForProviderRelease(gatePath: string, signal?: AbortSignal): Promise<void> {
  const configuredMaxWait = Number(process.env.OTTE_E2E_AI_MAX_WAIT_MS ?? 10_000);
  const maxWaitMs = Number.isFinite(configuredMaxWait) && configuredMaxWait > 0 ? configuredMaxWait : 10_000;
  const deadline = Date.now() + maxWaitMs;
  while (!existsSync(gatePath)) {
    if (signal?.aborted) {
      const error = new Error("Controlled E2E provider turn was cancelled");
      error.name = "AbortError";
      throw error;
    }
    if (Date.now() >= deadline) throw new Error(`Controlled E2E provider was not released within ${maxWaitMs}ms`);
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
  }
}

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";
const aiProvider = new GatedE2eAiProvider(new CodexAppServerProvider({
  transport: new LoopbackCodexTransport(),
  approvalMode: "proposal",
  reasoningEffort: "high",
}));

const runtime = await startApiRuntime({
  port,
  host,
  sqlitePath: process.env.OTTE_SQLITE_PATH,
  uploadDir: process.env.OTTE_UPLOAD_DIR,
  pluginRoot: process.env.OTTE_PLUGIN_DIR,
  bundledPluginRoot: process.env.OTTE_BUNDLED_PLUGIN_DIR,
  aiProvider,
});

registerApiRuntimeShutdown(runtime, {
  onError(error, signal) {
    console.error(`E2E API shutdown failed after ${signal ?? "manual close"}`, error);
    process.exitCode = 1;
  },
});
