import { EchoAiProvider, OpenAiResponsesProvider, type AiProvider } from "@open-tabletop/ai-core";
import { CodexAppServerProvider, LoopbackCodexTransport } from "@open-tabletop/codex-app-server-provider";

export function createProviders(env: Record<string, string | undefined> = process.env): AiProvider[] {
  return [
    new EchoAiProvider(),
    new OpenAiResponsesProvider({
      apiKey: env.OPENAI_API_KEY,
      baseUrl: env.OPENAI_BASE_URL,
      model: env.OPENAI_MODEL,
      organization: env.OPENAI_ORGANIZATION ?? env.OPENAI_ORG_ID,
      project: env.OPENAI_PROJECT ?? env.OPENAI_PROJECT_ID,
      timeoutMs: aiProviderTimeoutMs(env)
    }),
    new CodexAppServerProvider({ transport: new LoopbackCodexTransport(), approvalMode: "proposal" })
  ];
}

export const providers = createProviders();

function aiProviderTimeoutMs(env: Record<string, string | undefined>): number {
  const parsed = Number(env.OTTE_AI_PROVIDER_TIMEOUT_MS);
  if (!Number.isFinite(parsed) || parsed < 0) return 30_000;
  return Math.max(0, Math.min(300_000, Math.floor(parsed)));
}
