import type { ContentImportEntity, ContentImportEntityKind } from "@open-tabletop/core";

export interface PdfTextPage {
  pageNumber: number;
  text: string;
}

export type PdfTextExtractor = (body: Buffer | Uint8Array) => Promise<PdfTextPage[]>;

export type PdfContentImportEntityInput = Partial<ContentImportEntity> & {
  kind: ContentImportEntityKind;
  name: string;
};

const actorKinds = new Set(["actor", "monster", "npc", "creature"]);
const itemKinds = new Set(["item", "class", "subclass", "feat", "spell", "equipment", "loot", "rule", "background", "species", "ancestry"]);
const textKinds = new Set(["journal", "handout"]);

export async function extractPdfTextPages(body: Buffer | Uint8Array): Promise<PdfTextPage[]> {
  const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as {
    getDocument(options: Record<string, unknown>): { promise: Promise<PdfDocumentProxy> };
  };
  const data = body instanceof Buffer ? new Uint8Array(body) : new Uint8Array(body);
  const loadingTask = pdfjs.getDocument({
    data,
    disableFontFace: true,
    isEvalSupported: false,
    useWorkerFetch: false
  });
  const document = await loadingTask.promise;
  const pages: PdfTextPage[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const text = textContent.items.map(pdfTextItemString).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
      pages.push({ pageNumber, text });
      page.cleanup?.();
    }
  } finally {
    await document.destroy?.();
  }
  return pages;
}

export function pdfContentImportPagePrompt(input: { sourceName: string; pageNumber: number; pageCount: number; text: string }): string {
  return [
    "You are importing user-provided tabletop RPG content into OpenTabletop.",
    `Read PDF page ${input.pageNumber} of ${input.pageCount} from ${input.sourceName}.`,
    "Return JSON only. Do not include markdown fences.",
    "Schema: {\"entities\":[{\"kind\":\"monster|npc|class|subclass|feat|spell|item|rule|encounter|journal|handout\",\"name\":\"...\",\"body\":\"...\",\"summary\":\"...\",\"difficulty\":\"...\",\"data\":{}}]}",
    "Use monster/npc for creatures, spell/feat/class/subclass/item/rule for reusable rules content, encounter for encounter setups, journal for lore or GM notes, and handout for player-facing text.",
    "Keep the user's wording concise. Do not invent missing mechanics; put uncertain details in body or data.notes.",
    "",
    "Page text:",
    input.text.trim()
  ].join("\n");
}

export function parsePdfContentImportEntities(input: { providerOutput: string; page: PdfTextPage; campaignSystemId: string }): PdfContentImportEntityInput[] {
  const parsed = parseJsonPayload(input.providerOutput);
  const records = Array.isArray(parsed) ? parsed : arrayFromRecord(recordValue(parsed), "entities");
  return records.flatMap((record) => normalizePdfAiEntity(recordValue(record), input.page, input.campaignSystemId));
}

interface PdfDocumentProxy {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPageProxy>;
  destroy?(): Promise<void> | void;
}

interface PdfPageProxy {
  getTextContent(): Promise<{ items: unknown[] }>;
  cleanup?(): void;
}

function pdfTextItemString(item: unknown): string {
  const record = recordValue(item);
  return typeof record.str === "string" ? record.str : "";
}

function normalizePdfAiEntity(record: Record<string, unknown>, page: PdfTextPage, campaignSystemId: string): PdfContentImportEntityInput[] {
  const name = stringFromRecord(record, "name")?.trim();
  if (!name) return [];
  const rawKind = normalizeKind(stringFromRecord(record, "kind") ?? stringFromRecord(record, "type") ?? "journal");
  const body = stringFromRecord(record, "body") ?? stringFromRecord(record, "description") ?? stringFromRecord(record, "text") ?? stringFromRecord(record, "summary") ?? "";
  const data = recordFromRecord(record, "data");
  const commonData = {
    ...data,
    sourcePage: page.pageNumber,
    sourceKind: rawKind,
    notes: data.notes ?? body
  };

  if (actorKinds.has(rawKind)) {
    const actorType = rawKind === "actor" ? stringFromRecord(record, "actorType") ?? stringFromRecord(record, "subtype") ?? "npc" : rawKind === "creature" ? "monster" : rawKind;
    return [
      {
        kind: "actor",
        name,
        selectedByDefault: true,
        data: {
          systemId: campaignSystemId,
          type: actorType,
          data: commonData
        }
      }
    ];
  }

  if (itemKinds.has(rawKind)) {
    const itemType = rawKind === "equipment" ? "item" : rawKind;
    return [
      {
        kind: "item",
        name,
        selectedByDefault: true,
        data: {
          systemId: campaignSystemId,
          type: itemType,
          data: {
            ...commonData,
            description: body
          }
        }
      }
    ];
  }

  if (rawKind === "encounter") {
    return [
      {
        kind: "encounter",
        name,
        selectedByDefault: true,
        data: {
          summary: stringFromRecord(record, "summary") ?? body,
          difficulty: stringFromRecord(record, "difficulty"),
          tokenIds: stringArrayFromRecord(record, "tokenIds"),
          body,
          sourcePage: page.pageNumber,
          sourceKind: rawKind
        }
      }
    ];
  }

  const kind: ContentImportEntityKind = textKinds.has(rawKind) ? (rawKind as "journal" | "handout") : "journal";
  return [
    {
      kind,
      name,
      selectedByDefault: true,
      data: {
        body,
        visibility: "gm_only",
        tags: ["content-import", "pdf-import"],
        sourcePage: page.pageNumber,
        sourceKind: rawKind
      },
      warnings: textKinds.has(rawKind) ? [] : [`unsupported_pdf_entity_kind:${rawKind}`]
    }
  ];
}

function parseJsonPayload(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
    if (fenced?.[1]) return parseJsonPayload(fenced[1]);
    const objectStart = trimmed.indexOf("{");
    const objectEnd = trimmed.lastIndexOf("}");
    if (objectStart !== -1 && objectEnd > objectStart) {
      try {
        return JSON.parse(trimmed.slice(objectStart, objectEnd + 1));
      } catch {
        return {};
      }
    }
    const arrayStart = trimmed.indexOf("[");
    const arrayEnd = trimmed.lastIndexOf("]");
    if (arrayStart !== -1 && arrayEnd > arrayStart) {
      try {
        return JSON.parse(trimmed.slice(arrayStart, arrayEnd + 1));
      } catch {
        return {};
      }
    }
    return {};
  }
}

function normalizeKind(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_]+/g, "-").replace(/-/g, "_");
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function recordFromRecord(record: Record<string, unknown>, key: string): Record<string, unknown> {
  return recordValue(record[key]);
}

function stringFromRecord(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function arrayFromRecord(record: Record<string, unknown>, key: string): unknown[] {
  const value = record[key];
  return Array.isArray(value) ? value : [];
}

function stringArrayFromRecord(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}
