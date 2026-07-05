import type { ContentImportBatch, ContentImportEntityKind, ContentImportSource, MapAsset } from "@open-tabletop/core";
import { recordValue, stringValue } from "./sheet-format.js";


export const contentImportAdapterPresets: Array<{
  id: ContentImportAdapterPresetId;
  label: string;
  description: string;
  adapterId?: string;
  sourceType: ContentImportSource["sourceType"];
  sourceName: string;
  license: ContentImportSource["license"];
}> = [
  {
    id: "manual",
    label: "Manual",
    description: "Create exactly the entities entered below as private table content.",
    sourceType: "manual",
    sourceName: "Web manual content import",
    license: { name: "User-provided private table content", usage: "private_home_game" }
  },
  {
    id: "csv_items",
    label: "CSV item list",
    description: "Parse one item per line using the configured columns.",
    adapterId: "csv-item-list-v1",
    sourceType: "adapter",
    sourceName: "CSV Item List Adapter",
    license: { name: "User-provided reusable item list", usage: "user_provided" }
  },
  {
    id: "markdown_handout",
    label: "Markdown handout",
    description: "Turn Markdown notes into a handout with heading-derived title fallback.",
    adapterId: "markdown-handout-v1",
    sourceType: "adapter",
    sourceName: "Markdown Handout Adapter",
    license: { name: "User-provided Markdown notes", usage: "user_provided" }
  },
  {
    id: "srd_json",
    label: "Open SRD JSON",
    description: "Parse legally reusable SRD JSON entries into private import entities.",
    adapterId: "open-srd-json-v1",
    sourceType: "adapter",
    sourceName: "Open SRD JSON Adapter",
    license: { name: "Open SRD-compatible content", usage: "srd", attribution: "Source-provided SRD attribution required" }
  }
];


export type ContentImportDraftEntity = {
  kind: ContentImportEntityKind;
  name: string;
  body: string;
};


export type ContentImportPreviewSource = Partial<Omit<ContentImportSource, "submittedByUserId" | "submittedAt">>;

export type ContentImportAdapterPresetId = "manual" | "csv_items" | "markdown_handout" | "srd_json";

export type CsvImportConfig = {
  columns: string[];
  delimiter: string;
  kind: ContentImportEntityKind;
  skipHeader: boolean;
};


export function summarizeImport(result: CampaignImportResult): string {
  const collections = ["campaigns", "members", "scenes", "tokens", "actors", "journals", "handouts", "chat", "rolls", "combats", "contentImports"];
  const changed = collections.map((collection) => [collection, result.counts[collection] ?? 0] as const).filter(([, count]) => count > 0);
  const summary = changed.slice(0, 5).map(([collection, count]) => `${count} ${collection}`).join(", ");
  const suffix = result.assetFiles > 0 ? `; restored ${result.assetFiles} asset files` : "";
  return summary ? `${summary}${suffix}` : `No campaign records changed${suffix}`;
}


export function contentImportEntityData(kind: ContentImportEntityKind, body: string): Record<string, unknown> {
  const trimmedBody = body.trim();
  if (kind === "actor") {
    return {
      type: "npc",
      data: {
        notes: trimmedBody,
        hp: { current: 1, max: 1 }
      }
    };
  }
  if (kind === "item") {
    return {
      type: "loot",
      data: {
        notes: trimmedBody,
        quantity: 1
      }
    };
  }
  if (kind === "encounter") {
    return {
      summary: trimmedBody,
      tokenIds: [],
      difficulty: ""
    };
  }
  return {
    body: trimmedBody,
    visibility: "gm_only",
    tags: ["content-import"]
  };
}


export function contentImportPreviewSource(preset: (typeof contentImportAdapterPresets)[number], sourceName: string, sourceUrl: string, notes: string): ContentImportPreviewSource {
  return {
    sourceType: preset.sourceType,
    adapterId: preset.adapterId,
    sourceName: sourceName.trim() || preset.sourceName,
    sourceUrl: sourceUrl.trim() || undefined,
    notes: notes.trim() || preset.description,
    license: preset.license
  };
}


export function contentImportAdapterEntities(presetId: ContentImportAdapterPresetId, body: string, fallback: ContentImportDraftEntity, config: string): ContentImportDraftEntity[] {
  if (presetId === "manual") return fallback.name ? [fallback] : [];
  if (presetId === "markdown_handout") {
    const name = fallback.name || markdownTitle(body) || "Imported Markdown Handout";
    return body.trim() ? [{ kind: "handout", name, body }] : [];
  }
  if (presetId === "csv_items") return csvItemImportEntities(body, config);
  if (presetId === "srd_json") return srdJsonImportEntities(body, fallback.kind);
  return [];
}


export function markdownTitle(body: string): string | undefined {
  return body.split(/\r?\n/).map((line) => line.trim()).find((line) => line.startsWith("# "))?.replace(/^#+\s*/, "").trim();
}


export function csvItemImportEntities(body: string, config: string): ContentImportDraftEntity[] {
  const csvConfig = parseCsvImportConfig(config);
  const nameIndex = Math.max(0, csvConfig.columns.indexOf("name"));
  const bodyIndex = csvConfig.columns.includes("body") ? csvConfig.columns.indexOf("body") : csvConfig.columns.includes("notes") ? csvConfig.columns.indexOf("notes") : 1;
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(csvConfig.delimiter).map((part) => part.trim()))
    .filter((parts, index) => !(csvConfig.skipHeader && index === 0 && parts[nameIndex]?.toLowerCase() === "name"))
    .filter((parts) => Boolean(parts[nameIndex]))
    .map((parts) => ({
      kind: csvConfig.kind,
      name: parts[nameIndex]!,
      body: parts[bodyIndex] || parts.slice(1).join(", ") || "Imported item"
    }));
}


export function parseCsvImportConfig(config: string): CsvImportConfig {
  const trimmed = config.trim();
  const fields: Record<string, string> = {};
  for (const part of trimmed.split(";").map((item) => item.trim()).filter((item) => item.includes("="))) {
    const [key = "", ...value] = part.split("=");
    const normalizedKey = key.trim().toLowerCase();
    if (normalizedKey) fields[normalizedKey] = value.join("=").trim();
  }
  const delimiter = fields.delimiter || ",";
  const columnsInput = fields.columns || (trimmed.includes("=") ? "name,body" : trimmed) || "name,body";
  const columns = columnsInput.split(columnsInput.includes("|") ? "|" : ",").map((column) => column.trim().toLowerCase()).filter(Boolean);
  const requestedKind = fields.kind;
  const kind = requestedKind && ["actor", "item", "journal", "handout", "encounter"].includes(requestedKind) ? (requestedKind as ContentImportEntityKind) : "item";
  return {
    columns: columns.length > 0 ? columns : ["name", "body"],
    delimiter,
    kind,
    skipHeader: fields.skipheader !== "false"
  };
}


export function srdJsonImportEntities(body: string, fallbackKind: ContentImportEntityKind): ContentImportDraftEntity[] {
  try {
    const parsed = JSON.parse(body) as unknown;
    const entries = Array.isArray(parsed) ? parsed : recordValue(parsed).entries;
    if (!Array.isArray(entries)) return [];
    return entries.flatMap((entry) => {
      const record = recordValue(entry);
      const name = stringValue(record.name);
      if (!name) return [];
      const kind = ["actor", "item", "journal", "handout", "encounter"].includes(String(record.kind)) ? (record.kind as ContentImportEntityKind) : fallbackKind;
      const summary = stringValue(record.summary) ?? stringValue(record.body) ?? stringValue(record.description) ?? "Imported SRD entry";
      return [{ kind, name, body: summary }];
    });
  } catch {
    return [];
  }
}



export interface FailedAssetUpload {
  file: File;
  setAsBackground: boolean;
  folder: string;
  tags: string;
  message: string;
}


export type CampaignImportResult = {
  importedCampaignIds: string[];
  counts: Record<string, number>;
  conflicts: Array<{ collection: string; id: string }>;
  skippedConflicts?: Array<{ collection: string; id: string }>;
  assetFiles: number;
  dryRun?: boolean;
  importScope?: ArchiveImportScope;
  importCollections?: ArchiveImportCollection[];
  importWarnings?: string[];
};


export type AssetLifecycleStatus = NonNullable<MapAsset["lifecycle"]>["status"];


export function normalizeAssetFolderPath(value?: string): string {
  return (value ?? "")
    .split(/[\\/]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .join("/");
}


export function assetFolderParts(folder: string): string[] {
  return normalizeAssetFolderPath(folder).split("/").filter(Boolean);
}


export function assetFolderPathOptions(value?: string): string[] {
  const parts = assetFolderParts(value ?? "");
  return parts.map((_part, index) => parts.slice(0, index + 1).join("/"));
}


export function assetMatchesFolderFilter(asset: MapAsset, folderFilter: string): boolean {
  if (folderFilter === "all") return true;
  const folder = normalizeAssetFolderPath(asset.folder);
  return folder === folderFilter || folder.startsWith(`${folderFilter}/`);
}


export function assetFolderBreadcrumbsFor(folderFilter: string): Array<{ path: string; label: string }> {
  if (folderFilter === "all") return [];
  const parts = assetFolderParts(folderFilter);
  return parts.map((part, index) => ({
    path: parts.slice(0, index + 1).join("/"),
    label: part
  }));
}


export function childAssetFolderOptions(folderOptions: string[], currentFolder: string, assets: MapAsset[]): Array<{ path: string; label: string; count: number }> {
  const currentParts = currentFolder === "all" ? [] : assetFolderParts(currentFolder);
  const childPaths = new Map<string, string>();
  for (const folder of folderOptions) {
    const parts = assetFolderParts(folder);
    const isInCurrentFolder = currentParts.every((part, index) => parts[index] === part);
    if (!isInCurrentFolder || parts.length <= currentParts.length) continue;
    const childPath = parts.slice(0, currentParts.length + 1).join("/");
    childPaths.set(childPath, parts[currentParts.length] ?? childPath);
  }
  return [...childPaths.entries()]
    .map(([path, label]) => ({
      path,
      label,
      count: assets.filter((asset) => assetMatchesFolderFilter(asset, path)).length
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}


export type ArchiveImportScope = "all" | "assets_only" | "selected_collections";

export type ArchiveImportCollection = "assets" | "scenes" | "tokens" | "actors" | "items" | "journals" | "handouts" | "chat" | "rolls" | "diceMacros" | "encounters" | "combats" | "contentImports" | "fogPresets";
