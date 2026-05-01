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
      project: env.OPENAI_PROJECT ?? env.OPENAI_PROJECT_ID
    }),
    new CodexAppServerProvider({ transport: new LoopbackCodexTransport(), approvalMode: "proposal" })
  ];
}

export const providers = createProviders();
