import type { Actor, ContentImportBatch, DiceRoll, FogHistoryEntry, VisionPoint, VisionPointSample } from "@open-tabletop/core";
import { probabilityRange } from "@open-tabletop/dice-engine";
import type { AdminJob } from "./api.js";


export function slugId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}


export function numericValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}


export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}


export function formatFogHistoryEntry(entry: FogHistoryEntry): string {
  const shape = entry.region?.shape ?? "circle";
  const mode = entry.region?.mode ?? "reveal";
  const target = entry.targetHistoryId ? ` -> ${entry.targetHistoryId}` : "";
  return `${entry.createdAt}: ${entry.action} ${entry.fogId}${target} (${shape}, ${mode})`;
}


export function formatVisionPointSample(sample: VisionPointSample): string {
  const blockers = sample.blockedBy.slice(0, 4).map((blocker) => {
    const intersection = blocker.intersection ? ` at ${formatVisionPoint(blocker.intersection)}` : "";
    const distance = blocker.distanceFromSource !== undefined ? `, ${formatVisionDistance(blocker.distanceFromSource)} from source` : "";
    return `- ${blocker.wallId} blocks ${blocker.source}:${blocker.sourceId}${intersection}${distance}`;
  });
  return [
    `Vision sample ${formatVisionPoint(sample.point)}: ${sample.visible ? "visible" : "blocked"}`,
    `Fog active: ${sample.fogActive ? "yes" : "no"}`,
    `Revealed by: ${sample.revealedBy.length}`,
    `Hidden by: ${sample.hiddenBy.length}`,
    `Illuminated by: ${sample.illuminatedBy.length}`,
    `Blocked by: ${sample.blockedBy.length}`,
    ...blockers
  ].join("\n");
}


export function formatVisionPoint(point: VisionPoint): string {
  return `${formatVisionDistance(point.x)},${formatVisionDistance(point.y)}`;
}


export function formatVisionDistance(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}


export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}


export function stringArrayValue(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
  return strings.length > 0 ? strings : undefined;
}


export function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}


export function actorRailSubtitle(actor: Actor): string {
  return stringValue(actor.data.class) || titleCaseLabel(actor.type || actor.systemId || "Character");
}


export function titleCaseLabel(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}


export function contentImportStatusClass(status: ContentImportBatch["status"]): string {
  if (status === "applied") return "status-pill completed";
  if (status === "rolled_back") return "status-pill running";
  if (status === "deleted") return "status-pill failed";
  return "status-pill";
}


export function readinessStatusClass(status: "ready" | "action" | "missing"): string {
  if (status === "ready") return "status-pill completed";
  if (status === "missing") return "status-pill running";
  return "status-pill failed";
}


export function jobStatusClass(status: AdminJob["status"]): string {
  if (status === "succeeded") return "status-pill completed";
  if (status === "failed" || status === "cancelled") return "status-pill failed";
  if (status === "running") return "status-pill running";
  return "status-pill";
}


export function formatRollTermName(term: DiceRoll["terms"][number], index: number): string {
  if (term.type === "die") {
    const count = term.count ?? Math.max(1, term.results?.length ?? 1);
    const suffix = term.sides === 100 ? "%" : (term.sides ?? "?");
    const sign = term.sign === -1 ? "-" : "";
    return `${sign}${count}d${suffix}`;
  }
  if (term.type === "modifier") {
    return `Modifier ${formatSignedActionNumber(term.value ?? 0)}`;
  }
  return term.path ? `Binding ${term.path}` : `Binding ${index + 1}`;
}


function formatSignedActionNumber(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}


export function rollTermTotal(term: DiceRoll["terms"][number]): number | undefined {
  if (term.type === "die") {
    const values = term.kept && term.kept.length > 0 ? term.kept : term.results;
    const total = values?.reduce((sum, value) => sum + value, 0);
    return total === undefined ? undefined : term.sign === -1 ? -total : total;
  }
  return typeof term.value === "number" ? term.value : undefined;
}


export function formatRollTermDetail(term: DiceRoll["terms"][number]): string {
  if (term.type === "die") {
    const parts = [
      term.results && term.results.length > 0 ? `rolled ${term.results.join(", ")}` : "no results",
      term.kept && term.kept.length > 0 ? `kept ${term.kept.join(", ")}` : undefined,
      term.drop && term.dropCount !== undefined ? `dropped ${term.dropCount} ${term.drop}` : undefined,
      term.rerolled && term.rerolled.length > 0 ? `rerolled ${term.rerolled.join(", ")}` : undefined,
      term.exploded && term.exploded.length > 0 ? `exploded ${term.exploded.join(", ")}` : undefined
    ].filter(Boolean);
    return parts.join(" - ");
  }
  if (term.type === "modifier") {
    return "static modifier";
  }
  return term.value === undefined ? "resolved binding" : `resolved ${formatSignedActionNumber(term.value)}`;
}


export function safeProbabilityRange(formula: string): { min: number; max: number } | undefined {
  try {
    return probabilityRange(formula);
  } catch {
    return undefined;
  }
}


export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}


export function formatNumber(value?: number): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "0";
}


export function formatCost(value?: number): string {
  return typeof value === "number" && Number.isFinite(value) ? `$${value.toFixed(6)}` : "n/a";
}


export function formatGp(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0 gp";
  return `${Number.isInteger(value) ? value.toLocaleString() : value.toFixed(2)} gp`;
}


export function formatCurrency(value?: Record<string, number>): string {
  if (!value) return "0 gp";
  const gp = numericValue(value.gp, 0);
  const sp = numericValue(value.sp, 0);
  const cp = numericValue(value.cp, 0);
  return [`${gp} gp`, sp > 0 ? `${sp} sp` : undefined, cp > 0 ? `${cp} cp` : undefined].filter(Boolean).join(", ");
}


export function formatPercent(value?: number): string {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value * 100)}%` : "0%";
}


export function formatAdminList(values: string[], limit: number): string {
  const shown = values.slice(0, limit);
  const remaining = values.length - shown.length;
  return remaining > 0 ? `${shown.join(", ")} +${remaining} more` : shown.join(", ");
}


export function formatStorageBytes(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0 B";
  if (value < 1024) return `${value.toLocaleString()} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}


export function formatDuration(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0 ms";
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)} s`;
}


export function formatDurationSeconds(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0 s";
  return formatDuration(value * 1000);
}


export function formatTime(value?: string): string {
  if (!value) return "";
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return value;
  return time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}


export function formatDateTime(value?: string): string {
  if (!value) return "";
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return value;
  return time.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}


export function prettyOriginId(value: string): string {
  return value.split("-").map((word) => (word ? word[0]!.toUpperCase() + word.slice(1) : word)).join(" ");
}



export function registryHostLabel(registryUrl: string): string {
  try {
    const url = new URL(registryUrl);
    return `${url.host}${url.pathname}`;
  } catch {
    return registryUrl;
  }
}



export function downloadJson(fileName: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
