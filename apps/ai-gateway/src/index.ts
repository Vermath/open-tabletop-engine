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
  if (!Number.isFinite(parsed) || parsed < 0) return 30_000;
  return Math.max(0, Math.min(300_000, Math.floor(parsed)));
}

function createCodexTransport(env: Record<string, string | undefined>) {
  if (env.OTTE_AI_PROVIDER !== "codex-app-server") return new LoopbackCodexTransport();
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
