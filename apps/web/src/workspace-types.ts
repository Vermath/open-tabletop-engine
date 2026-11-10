import type { Scene, SceneAnnotationKind } from "@open-tabletop/core";
import type { ArchiveImportCollection, ArchiveImportScope } from "./content-import-data.js";
import type { Dnd5eSrdWeaponMasteryUse } from "./weapon-mastery-controls.js";

/** Shared, state-free types and helpers for the workspace shell. */
export interface FailedArchiveImport {
  file: File;
  message: string;
  attempt: ArchiveImportAttempt;
}

export interface ArchiveImportAttempt {
  idempotencyKey: string;
  mode: ArchiveImportMode;
  scope: ArchiveImportScope;
  collections: ArchiveImportCollection[];
  transport: "json" | "stream";
}
export interface SceneViewportSize {
  width: number;
  height: number;
}

export type ChatExportFormat = "json" | "ndjson";
export type ChatModerationResolution = "open" | "follow_up" | "reviewed";
export type ArchiveExportVersion = "0.2.0";
export type ArchiveRedactionMode = "portable";
export type ArchiveImportMode = "upsert" | "reject_conflicts" | "skip_conflicts" | "dry_run";
export type ManageCategoryId = "account" | "campaign" | "people" | "scenes" | "archives" | "serverAdmin";
export type WorkspaceMode = "live" | "prep" | "ai" | "manage";
export type RulesSaveOutcome = "success" | "failure";
export type ActorActionCommitOptions = { targetActorId?: string; applyEffect?: boolean; consumeResources?: boolean; saveOutcomes?: Record<string, RulesSaveOutcome>; effectChoice?: string; weaponMastery?: Dnd5eSrdWeaponMasteryUse; continuationId?: string; reviewActorNames?: Record<string, string> };
export interface CombatRewardRequestPayload {
  recipientActorIds: string[];
  totalXp?: number;
  totalGp?: number;
  loot?: string[];
  note?: string;
  expectedUpdatedAt: string;
  expectedActorUpdatedAt: Record<string, string>;
}

export type MeasurementTool = "measure-circle" | "measure-cone";
export type AnnotationTool = SceneAnnotationKind | MeasurementTool | null;
export type ActiveAnnotationTool = NonNullable<AnnotationTool>;
export function compareScenesForDisplay(left: Scene, right: Scene): number {
  return left.sortOrder - right.sortOrder || left.createdAt.localeCompare(right.createdAt) || left.name.localeCompare(right.name);
}

export function assetTagsFromInput(value: string): string[] {
  return [...new Set(value.split(",").map((tag) => tag.trim()).filter(Boolean))].slice(0, 12);
}
