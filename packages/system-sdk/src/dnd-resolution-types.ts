/** Shared data-only transaction shapes used by focused D&D rules modules. */
export interface RulesResolutionActorUpdate {
  actorId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  reason: string;
}

export interface Dnd5eSrdConcentrationCleanup {
  sourceActorId: string;
  rollId: string;
  startedAt?: string;
  targetActorIds: string[];
  reason: "broken" | "replaced" | "expired" | "incapacitated" | "ended";
}
