import type { Page } from "@playwright/test";

interface CampaignRecord {
  id: string;
  name: string;
}

interface ActorRecord {
  id: string;
  name: string;
  data?: { hp?: { current?: number } };
}

export async function applyReviewedTypedDamageToHp(
  page: Page,
  input: { apiBaseUrl: string; campaignName: string; actorName: string; targetHp: number },
): Promise<{ actorId: string; currentHp: number }> {
  return page.evaluate(async ({ apiBaseUrl, campaignName, actorName, targetHp }) => {
    const json = async <T>(response: Response): Promise<T> => {
      const body = await response.text();
      if (!response.ok) throw new Error(body);
      return JSON.parse(body) as T;
    };
    const campaigns = await json<CampaignRecord[]>(await fetch(`${apiBaseUrl}/api/v1/campaigns`, { credentials: "include" }));
    const campaign = campaigns.find((candidate) => candidate.name === campaignName);
    if (!campaign) throw new Error(`Campaign ${campaignName} was not available to the current user`);
    const actors = await json<ActorRecord[]>(await fetch(`${apiBaseUrl}/api/v1/campaigns/${campaign.id}/actors`, { credentials: "include" }));
    const actor = actors.find((candidate) => candidate.name === actorName);
    if (!actor) throw new Error(`Actor ${actorName} was not available in ${campaignName}`);
    const currentHp = Number(actor.data?.hp?.current);
    if (!Number.isFinite(currentHp)) throw new Error(`Actor ${actorName} has no numeric current Hit Points`);
    if (currentHp < targetHp) throw new Error(`Reviewed typed damage cannot increase ${actorName} from ${currentHp} to ${targetHp} Hit Points`);
    if (currentHp === targetHp) return { actorId: actor.id, currentHp };

    const route = `${apiBaseUrl}/api/v1/campaigns/${campaign.id}/systems/dnd-5e-srd/actors/${actor.id}`;
    const previewKey = `e2e-typed-damage-preview:${crypto.randomUUID()}`;
    const preview = await json<{
      status?: string;
      blockers?: unknown[];
      preparation?: {
        preparedPreviewKey?: string;
        actorUpdatedAt?: Record<string, string>;
        itemUpdatedAt?: Record<string, string>;
        combatUpdatedAt?: string;
      };
    }>(await fetch(`${route}/rules-preview`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", "idempotency-key": previewKey },
      body: JSON.stringify({ operation: "typed-damage", prepare: true, amount: currentHp - targetHp, damageType: "force" }),
    }));
    if (preview.status !== "ready" || !preview.preparation?.preparedPreviewKey || !preview.preparation.actorUpdatedAt || !preview.preparation.itemUpdatedAt) {
      throw new Error(`Typed damage preview was not ready: ${JSON.stringify(preview)}`);
    }
    const applied = await json<{ actor: ActorRecord }>(await fetch(`${route}/typed-damage/apply`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", "idempotency-key": `e2e-typed-damage-apply:${crypto.randomUUID()}` },
      body: JSON.stringify({
        preparedPreviewKey: preview.preparation.preparedPreviewKey,
        expectedActorUpdatedAt: preview.preparation.actorUpdatedAt,
        expectedItemUpdatedAt: preview.preparation.itemUpdatedAt,
        ...(preview.preparation.combatUpdatedAt ? { expectedCombatUpdatedAt: preview.preparation.combatUpdatedAt } : {}),
      }),
    }));
    return { actorId: actor.id, currentHp: Number(applied.actor.data?.hp?.current) };
  }, input);
}
