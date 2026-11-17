import type { Actor } from "@open-tabletop/core";
import { apiDelete } from "./api.js";
import { sharedMutationIdempotencyKey } from "./shared-mutation.js";

type ActorDeletionContext = {
  actor: Actor;
  actors: Actor[];
  sceneId: string;
  runMutation<T>(task: () => Promise<T>, targetCampaignId?: string, targetSceneId?: string): Promise<T>;
  isCurrent(): boolean;
  onDeleted(nextActorId: string): void;
  onError(error: unknown): void;
  refresh(): Promise<unknown>;
};

export function actorSelectionAfterDelete(actors: Actor[], deleted: Actor): string {
  return actors.find((candidate) => candidate.id !== deleted.id && candidate.type === deleted.type)?.id
    ?? actors.find((candidate) => candidate.id !== deleted.id)?.id
    ?? "";
}

export async function deleteCampaignActor(context: ActorDeletionContext): Promise<void> {
  const { actor } = context;
  const latest = context.actors.find((candidate) => candidate.id === actor.id) ?? actor;
  try {
    await context.runMutation(
      () => apiDelete<Actor>(`/api/v1/actors/${actor.id}?expectedUpdatedAt=${encodeURIComponent(latest.updatedAt)}`, {
        idempotencyKey: sharedMutationIdempotencyKey(`actor:delete:${actor.id}`, latest.updatedAt, {})
      }),
      actor.campaignId,
      context.sceneId
    );
    if (!context.isCurrent()) return;
    context.onDeleted(actorSelectionAfterDelete(context.actors, actor));
    await context.refresh();
  } catch (error) {
    if (context.isCurrent()) context.onError(error);
  }
}
