import type { AiProviderRequest } from "./index";
import { describe, expect, it } from "vitest";
import { OpenAiResponsesProvider } from "./openai-responses-provider";

const baseRequest: AiProviderRequest = {
  threadId: "thr_test",
  messages: [{ role: "user", content: "Propose a vault encounter note." }],
  context: {
    campaignId: "camp_demo",
    publicSummary: "The Ember Vault: Public Rumor",
    gmSecrets: ["The door password is ember."],
    memory: [{ text: "Valen distrusts the west stairs.", visibility: "gm_only", sourceIds: ["msg_1"] }],
    actors: [
      {
        id: "act_valen",
        name: "Valen Ash",
        type: "character",
        summary: "Valen Ash (18/22 HP)",
        systemId: "generic-fantasy",
        actions: [{ rollId: "spell-item_healing_word-healing", label: "Healing Word Healing", formula: "1d4+0" }]
      }
    ]
  },
  tools: [
    {
      name: "create_proposal",
      description: "Create a pending OpenTabletop proposal for GM approval.",
      requiredPermissions: ["ai.proposeChanges"],
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Proposal title." },
          changes: { type: "array", items: { type: "object", additionalProperties: true } }
        },
        required: ["title"],
        additionalProperties: false
      },
      async execute() {
        return { proposalId: "prop_test" };
      }
    }
  ]
};

describe("OpenAiResponsesProvider", () => {
  it("posts permission-filtered context and tools to the Responses API", async () => {
    const calls: Array<{ url: string | URL | Request; init?: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      calls.push({ url, init });
      return new Response(
        JSON.stringify({
          usage: {
            input_tokens: 120,
            output_tokens: 35,
            total_tokens: 155
          },
          output: [
            {
              type: "function_call",
              name: "create_proposal",
              arguments: JSON.stringify({ title: "Vault Encounter", changes: [] })
            },
            {
              type: "message",
              content: [{ type: "output_text", text: "I drafted a proposal for GM review." }]
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };

    const provider = new OpenAiResponsesProvider({
      apiKey: "sk-test",
      baseUrl: "https://api.example.test/v1",
      model: "gpt-test",
      organization: "org_test",
      project: "proj_test",
      fetch: fetchImpl
    });

    const events = [];
    for await (const event of provider.stream(baseRequest)) events.push(event);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.example.test/v1/responses");
    const headers = new Headers(calls[0]!.init!.headers);
    expect(headers.get("authorization")).toBe("Bearer sk-test");
    expect(headers.get("OpenAI-Organization")).toBe("org_test");
    expect(headers.get("OpenAI-Project")).toBe("proj_test");

    const body = JSON.parse(calls[0]!.init!.body as string);
    expect(body.model).toBe("gpt-test");
    expect(body.input).toContain("Propose a vault encounter note.");
    expect(body.instructions).toContain("The Ember Vault");
    expect(body.instructions).toContain("The door password is ember.");
    expect(body.instructions).toContain("Healing Word Healing [spell-item_healing_word-healing] 1d4+0");
    expect(body.tools).toEqual([
      expect.objectContaining({
        type: "function",
        name: "create_proposal",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string", description: "Proposal title." },
            changes: { type: "array", items: { type: "object", additionalProperties: true } }
          },
          required: ["title"],
          additionalProperties: false
        }
      })
    ]);
    expect(events).toEqual([
      { type: "usage.reported", usage: { inputTokens: 120, outputTokens: 35, totalTokens: 155 } },
      { type: "tool.started", toolName: "create_proposal", input: { title: "Vault Encounter", changes: [] } },
      { type: "message.completed", content: "I drafted a proposal for GM review." }
    ]);
  });

  it("returns a clear configuration message when no API key is present", async () => {
    const provider = new OpenAiResponsesProvider({ fetch: async () => new Response("{}") });
    const events = [];
    for await (const event of provider.stream(baseRequest)) events.push(event);
    expect(events).toEqual([
      {
        type: "message.completed",
        content: "OpenAI Responses provider is not configured. Set OPENAI_API_KEY before selecting OTTE_AI_PROVIDER=openai-responses."
      }
    ]);
  });

  it("includes upstream response text in failed request errors", async () => {
    const provider = new OpenAiResponsesProvider({
      apiKey: "sk-test",
      fetch: async () => new Response("bad credentials", { status: 401 })
    });

    await expect(async () => {
      for await (const _event of provider.stream(baseRequest)) {
        // consume stream
      }
    }).rejects.toThrow("OpenAI Responses API request failed with 401: bad credentials");
  });

  it("aborts hung upstream requests after the configured timeout", async () => {
    const provider = new OpenAiResponsesProvider({
      apiKey: "sk-test",
      timeoutMs: 10,
      fetch: async (_url, init) => {
        await new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => {
              const error = new Error("aborted");
              error.name = "AbortError";
              reject(error);
            },
            { once: true }
          );
        });
        return new Response("{}");
      }
    });

    await expect(async () => {
      for await (const _event of provider.stream(baseRequest)) {
        // consume stream
      }
    }).rejects.toThrow("OpenAI Responses API request timed out after 10ms");
  });
});
