import { EchoAiProvider } from "@open-tabletop/ai-core";

export const providers = [
  new EchoAiProvider(),
  {
    id: "openai-placeholder",
    label: "OpenAI Compatible",
    async *stream() {
      yield { type: "message.completed" as const, content: "Configure OPENAI_API_KEY to enable this provider." };
    }
  },
  {
    id: "codex-app-server-placeholder",
    label: "Codex App Server",
    async *stream() {
      yield { type: "message.completed" as const, content: "Configure the Codex transport to enable rich assistant workflows." };
    }
  }
];
