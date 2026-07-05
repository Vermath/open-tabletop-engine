import { EchoAiProvider, type AiProvider } from "@open-tabletop/ai-core";
import { CodexAppServerProvider, CodexAppServerWebSocketTransport, LoopbackCodexTransport } from "@open-tabletop/codex-app-server-provider";

export function createProviders(env: Record<string, string | undefined> = process.env): AiProvider[] {
  return [
    new EchoAiProvider(),
    new CodexAppServerProvider({ transport: createCodexTransport(env), approvalMode: "proposal" })
  ];
}

export const providers = createProviders();

function aiProviderTimeoutMs(env: Record<string, string | undefined>): number {
  const parsed = Number(env.OTTE_AI_PROVIDER_TIMEOUT_MS);
  if (!Number.isFinite(parsed) || parsed < 0) return 15 * 60_000;
  return Math.max(0, Math.min(30 * 60_000, Math.floor(parsed)));
}

export function createCodexTransport(env: Record<string, string | undefined>) {
  const provider = env.OTTE_AI_PROVIDER?.trim() || "codex-app-server";
  if (provider === "codex-loopback") return new LoopbackCodexTransport();
  if (provider !== "codex-app-server") throw new Error(`Unsupported OTTE_AI_PROVIDER "${provider}". Use codex-app-server or codex-loopback.`);
  const timeoutMs = aiProviderTimeoutMs(env);
  return new CodexAppServerWebSocketTransport({
    url: env.OTTE_CODEX_APP_SERVER_URL,
    cwd: env.OTTE_CODEX_APP_SERVER_CWD,
    model: env.OTTE_CODEX_MODEL,
    modelProvider: env.OTTE_CODEX_MODEL_PROVIDER,
    requestTimeoutMs: timeoutMs,
    turnTimeoutMs: Math.max(timeoutMs, 180_000)
  });
}
