import type { AiProvider, AiProviderEvent, AiProviderRequest } from "@open-tabletop/ai-core";
import { createTimestamped, type ContentImportBatch, type PermissionGrant } from "@open-tabletop/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "./fixtures/legacy-build-app.js";
import { MemoryStateStore } from "./store.js";

class PdfImportAiProvider implements AiProvider {
  readonly id = "test-codex-app-server";
  readonly label = "Test Codex App Server";
  readonly requests: AiProviderRequest[] = [];

  async *stream(input: AiProviderRequest): AsyncIterable<AiProviderEvent> {
    this.requests.push(input);
    const prompt = input.messages.at(-1)?.content ?? "";
    const pageMatch = /page\s+(\d+)\s+of\s+(\d+)/i.exec(prompt);
    const pageNumber = pageMatch ? Number(pageMatch[1]) : 1;
    const content =
      pageNumber === 1
        ? {
            entities: [
              {
                kind: "monster",
                name: "Ash Drake",
                body: "A young drake wreathed in cinders.",
                data: { armorClass: 15, hitPoints: 42 }
              },
              {
                kind: "spell",
                name: "Starfire",
                body: "A second-level evocation that erupts in silver flame.",
                data: { level: 2, school: "evocation" }
              }
            ]
          }
        : {
            entities: [
              {
                kind: "class",
                name: "Oath of Embers",
                body: "A martial class sworn to banks of living flame.",
                data: { hitDie: "d10" }
              },
              {
                kind: "encounter",
                name: "Bridge Ambush",
                summary: "Two ash drakes harry the party on a burning bridge.",
                difficulty: "hard"
              }
            ]
          };
    yield { type: "message.completed", content: JSON.stringify(content) };
  }
}

describe("AI PDF content import", () => {
  it("extracts each PDF page through the AI provider and creates a reviewable import batch", async () => {
    const store = new MemoryStateStore();
    const aiProvider = new PdfImportAiProvider();
    const app = await buildApp({
      store,
      aiProvider,
      pdfTextExtractor: async () => [
        { pageNumber: 1, text: "Ash Drake\nStarfire" },
        { pageNumber: 2, text: "Oath of Embers\nBridge Ambush" }
      ]
    });

    try {
      const previewResponse = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/content-imports/pdf/ai",
        headers: {
          "content-type": "application/pdf",
          "x-source-name": "ember-vault.pdf",
          "x-user-id": "usr_demo_gm"
        },
        payload: Buffer.from("%PDF-1.7\n%test")
      });

      expect(previewResponse.statusCode).toBe(200);
      expect(aiProvider.requests).toHaveLength(2);
      expect(aiProvider.requests.map((request) => request.surface)).toEqual(["pdf_content_import", "pdf_content_import"]);
      expect(aiProvider.requests[0]?.messages.at(-1)?.content).toContain("page 1 of 2");
      expect(aiProvider.requests[1]?.messages.at(-1)?.content).toContain("page 2 of 2");

      const batch = previewResponse.json<ContentImportBatch>();
      expect(batch.status).toBe("previewed");
      expect(batch.source).toMatchObject({
        sourceType: "adapter",
        adapterId: "codex-pdf-content-import-v1",
        sourceName: "ember-vault.pdf",
        license: {
          name: "User-provided private table content",
          usage: "private_home_game"
        }
      });
      expect(batch.entities.map((entity) => [entity.kind, entity.name, entity.data.type])).toEqual([
        ["actor", "Ash Drake", "monster"],
        ["item", "Starfire", "spell"],
        ["item", "Oath of Embers", "class"],
        ["encounter", "Bridge Ambush", undefined]
      ]);
      expect(batch.entities[0]?.data.data).toMatchObject({ sourcePage: 1, armorClass: 15, hitPoints: 42 });
      expect(batch.entities[3]?.data).toMatchObject({
        summary: "Two ash drakes harry the party on a burning bridge.",
        difficulty: "hard",
        sourcePage: 2
      });

      const applyResponse = await app.inject({
        method: "POST",
        url: `/api/v1/content-imports/${batch.id}/apply`,
        headers: { "x-user-id": "usr_demo_gm" },
        payload: { selectedEntityIds: batch.entities.map((entity) => entity.id) }
      });

      expect(applyResponse.statusCode).toBe(200);
      const applied = applyResponse.json<ContentImportBatch>();
      expect(applied.appliedRecords.map((record) => record.collection)).toEqual(["actors", "items", "items", "encounters"]);
      expect(store.state.encounters.some((encounter) => encounter.name === "Bridge Ambush" && encounter.difficulty === "hard")).toBe(true);
    } finally {
      await app.close();
    }
  });

  it("requires both campaign update and AI proposal permission before analyzing PDFs", async () => {
    const store = new MemoryStateStore();
    store.state.permissionGrants.push(
      createTimestamped("grant", {
        campaignId: "camp_demo",
        subjectType: "user" as const,
        subjectId: "usr_demo_player",
        permissions: ["campaign.update"]
      }) satisfies PermissionGrant
    );
    const aiProvider = new PdfImportAiProvider();
    const app = await buildApp({
      store,
      aiProvider,
      pdfTextExtractor: async () => [{ pageNumber: 1, text: "Player-only request" }]
    });

    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/campaigns/camp_demo/content-imports/pdf/ai",
        headers: {
          "content-type": "application/pdf",
          "x-source-name": "player.pdf",
          "x-user-id": "usr_demo_player"
        },
        payload: Buffer.from("%PDF-1.7\n%test")
      });

      expect(response.statusCode).toBe(403);
      expect(aiProvider.requests).toHaveLength(0);
    } finally {
      await app.close();
    }
  });
});
