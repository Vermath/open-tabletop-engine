import { EchoAiProvider } from "@open-tabletop/ai-core";
import { CodexAppServerProvider, LoopbackCodexTransport } from "@open-tabletop/codex-app-server-provider";

export const providers = [
  new EchoAiProvider(),
  {
    id: "openai-placeholder",
    label: "OpenAI Compatible",
    async *stream() {
      yield { type: "message.completed" as const, content: "Configure OPENAI_API_KEY to enable this provider." };
    }
  },
  new CodexAppServerProvider({ transport: new LoopbackCodexTransport(), approvalMode: "proposal" })
];
