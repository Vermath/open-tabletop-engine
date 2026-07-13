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
  const rawValue = env.OTTE_AI_PROVIDER_TIMEOUT_MS?.trim();
  if (!rawValue) return 15 * 60_000;
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed < 0) return 15 * 60_000;
  return Math.max(0, Math.min(30 * 60_000, Math.floor(parsed)));
}

export function createCodexTransport(env: Record<string, string | undefined>) {
  const provider = env.OTTE_AI_PROVIDER?.trim() || "codex-app-server";
  if (provider === "codex-loopback") return new LoopbackCodexTransport();
  if (provider !== "codex-app-server") throw new Error(`Unsupported OTTE_AI_PROVIDER "${provider}". Use codex-app-server or codex-loopback.`);
  const timeoutMs = aiProviderTimeoutMs(env);
  return new CodexAppServerWebSocketTransport({
    url: trimmedEnvValue(env.OTTE_CODEX_APP_SERVER_URL),
    cwd: trimmedEnvValue(env.OTTE_CODEX_APP_SERVER_CWD),
    model: trimmedEnvValue(env.OTTE_CODEX_MODEL),
    modelProvider: trimmedEnvValue(env.OTTE_CODEX_MODEL_PROVIDER),
    requestTimeoutMs: timeoutMs,
    turnTimeoutMs: timeoutMs === 0 ? 0 : Math.max(timeoutMs, 180_000)
  });
}

function trimmedEnvValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}
