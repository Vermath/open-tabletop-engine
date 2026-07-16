import type { APIResponse, Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

type RollVisibility = "public" | "gm_only" | "whisper";

type HeroicActor = {
  id: string;
  campaignId: string;
  updatedAt: string;
  data: Record<string, unknown> & { heroicInspiration?: boolean };
};

type HeroicRoll = {
  id: string;
  actorId?: string;
  formula: string;
  label?: string;
  total: number;
  visibility: RollVisibility;
  heroicInspiration?:
    | { kind: "original"; actorId: string; rerollRollId: string }
    | {
        kind: "reroll";
        actorId: string;
        originalRollId: string;
        selectedTermIndex: number;
        selectedResultIndex: number;
        originalResult: number;
        replacementResult: number;
      };
};

type RerollResult = {
  actor: HeroicActor;
  originalRoll: HeroicRoll;
  reroll: HeroicRoll;
  mustUseNewRoll: true;
};

type HeroicPair = Pick<RerollResult, "originalRoll" | "reroll">;

export async function exerciseHeroicInspirationJourney(input: {
  apiBaseUrl: string;
  campaignName: string;
  characterName: string;
  gmPage: Page;
  playerPage: Page;
}): Promise<void> {
  const firstGrant = await grantHeroicInspiration(input.gmPage, input.campaignName, input.characterName);
  const publicPair = await rollAndReroll(input.playerPage, {
    apiBaseUrl: input.apiBaseUrl,
    campaignId: firstGrant.campaignId,
    campaignName: input.campaignName,
    characterName: input.characterName,
    expectedVisibility: "public",
    rollButtonName: /Roll Strength check/,
  });
  expect(publicPair.originalRoll.actorId).toBe(firstGrant.id);

  const secondGrant = await grantHeroicInspiration(input.gmPage, input.campaignName, input.characterName);
  expect(secondGrant.id).toBe(firstGrant.id);
  const privatePair = await rollAndReroll(input.gmPage, {
    apiBaseUrl: input.apiBaseUrl,
    campaignId: firstGrant.campaignId,
    campaignName: input.campaignName,
    characterName: input.characterName,
    expectedVisibility: "gm_only",
    rollButtonName: /Roll Dexterity saving throw/,
  });

  const [playerHistory, gmHistory] = await Promise.all([
    visibleRollHistory(input.playerPage, input.apiBaseUrl, firstGrant.campaignId),
    visibleRollHistory(input.gmPage, input.apiBaseUrl, firstGrant.campaignId),
  ]);
  expectLinkedHistory(playerHistory, publicPair);
  expectHiddenHistory(playerHistory, privatePair);
  expectLinkedHistory(gmHistory, publicPair);
  expectLinkedHistory(gmHistory, privatePair);

  await assertChatHistory(input.playerPage, input.campaignName, publicPair, privatePair, false);
  await assertChatHistory(input.gmPage, input.campaignName, publicPair, privatePair, true);
  await selectRollVisibility(input.gmPage, "public");
}

async function grantHeroicInspiration(page: Page, campaignName: string, characterName: string): Promise<HeroicActor> {
  await page.reload();
  await expect(page.getByRole("heading", { name: campaignName })).toBeVisible();
  const stats = await openActorStats(page, characterName);
  const card = stats.getByRole("region", { name: "Heroic Inspiration", exact: true });
  await expect(card).toContainText("None");
  const response = page.waitForResponse((candidate) =>
    candidate.request().method() === "POST"
    && new URL(candidate.url()).pathname.endsWith("/heroic-inspiration/grant"),
  );
  await card.getByRole("button", { name: "Grant Heroic Inspiration" }).click();
  const result = await expectJsonResponse<{ awardedTo: "actor" | "recipient"; actor: HeroicActor }>(await response);
  expect(result.awardedTo).toBe("actor");
  expect(result.actor.data.heroicInspiration).toBe(true);
  await expect(card).toContainText("Ready");
  await expect(card.getByRole("status")).toContainText(`${characterName} has Heroic Inspiration.`);
  return result.actor;
}

async function rollAndReroll(
  page: Page,
  input: {
    apiBaseUrl: string;
    campaignId: string;
    campaignName: string;
    characterName: string;
    expectedVisibility: "public" | "gm_only";
    rollButtonName: RegExp;
  },
): Promise<HeroicPair> {
  await page.reload();
  await expect(page.getByRole("heading", { name: input.campaignName })).toBeVisible();
  await selectRollVisibility(page, input.expectedVisibility);
  const stats = await openActorStats(page, input.characterName);
  const before = await visibleRollHistory(page, input.apiBaseUrl, input.campaignId);
  await stats.getByRole("button", { name: input.rollButtonName }).click();
  await expect.poll(async () => {
    const current = await visibleRollHistory(page, input.apiBaseUrl, input.campaignId);
    const beforeIds = new Set(before.map((roll) => roll.id));
    return current.some((roll) => !beforeIds.has(roll.id) && roll.actorId && roll.visibility === input.expectedVisibility);
  }).toBe(true);
  const after = await visibleRollHistory(page, input.apiBaseUrl, input.campaignId);
  const beforeIds = new Set(before.map((roll) => roll.id));
  const sourceRoll = after.filter((roll) => !beforeIds.has(roll.id) && roll.actorId && roll.visibility === input.expectedVisibility).at(-1);
  expect(sourceRoll).toBeDefined();

  await page.reload();
  await expect(page.getByRole("heading", { name: input.campaignName })).toBeVisible();
  const refreshedStats = await openActorStats(page, input.characterName);
  const card = refreshedStats.getByRole("region", { name: "Heroic Inspiration", exact: true });
  await expect(card).toContainText("Ready");
  const rerollButton = card.getByRole("button", { name: /Reroll die \d+/ }).first();
  await expect(rerollButton).toBeVisible();

  const rerollResponse = page.waitForResponse((candidate) =>
    candidate.request().method() === "POST"
    && new URL(candidate.url()).pathname.endsWith("/heroic-inspiration/reroll"),
  );
  await Promise.all([
    (async () => {
      const dialog = await page.waitForEvent("dialog", { timeout: 10_000 });
      expect(dialog.type()).toBe("confirm");
      expect(dialog.message()).toContain("Spend Heroic Inspiration");
      expect(dialog.message()).toContain("must use the new roll");
      await dialog.accept();
    })(),
    rerollButton.click(),
  ]);
  const result = await expectJsonResponse<RerollResult>(await rerollResponse);
  expect(result.mustUseNewRoll).toBe(true);
  expect(result.actor.data.heroicInspiration).toBe(false);
  expect(result.originalRoll.id).toBe(sourceRoll!.id);
  expect(result.originalRoll.visibility).toBe(input.expectedVisibility);
  expect(result.reroll.visibility).toBe(input.expectedVisibility);
  expect(result.originalRoll.heroicInspiration).toEqual({
    kind: "original",
    actorId: result.actor.id,
    rerollRollId: result.reroll.id,
  });
  expect(result.reroll.heroicInspiration).toMatchObject({
    kind: "reroll",
    actorId: result.actor.id,
    originalRollId: result.originalRoll.id,
  });
  await expect(card.getByRole("status")).toContainText("Heroic Inspiration spent.");
  await expect(card).toContainText("None");
  return { originalRoll: result.originalRoll, reroll: result.reroll };
}

async function openActorStats(page: Page, characterName: string): Promise<Locator> {
  const actor = page.getByRole("region", { name: "Party" }).getByRole("button").filter({ hasText: characterName });
  await expect(actor).toBeVisible();
  await actor.click();
  await page.locator(".inspector-tabs").getByRole("tab", { name: "Actors", exact: true }).click();
  const inspector = page.locator(".inspector");
  await inspector.getByRole("tab", { name: "Stats" }).click();
  const stats = inspector.getByRole("region", { name: "Actor stats sheet" });
  await expect(stats).toBeVisible();
  return stats;
}

async function selectRollVisibility(page: Page, visibility: "public" | "gm_only"): Promise<void> {
  await page.locator(".inspector-tabs").getByRole("tab", { name: "Chat", exact: true }).click();
  const chat = page.locator(".inspector").getByRole("region", { name: "Chat", exact: true });
  await expect(chat).toBeVisible();
  await chat.getByRole("combobox", { name: "Dice roll visibility" }).selectOption(visibility);
}

async function assertChatHistory(
  page: Page,
  campaignName: string,
  publicPair: HeroicPair,
  privatePair: HeroicPair,
  canSeePrivate: boolean,
): Promise<void> {
  await page.reload();
  await expect(page.getByRole("heading", { name: campaignName })).toBeVisible();
  await page.locator(".inspector-tabs").getByRole("tab", { name: "Chat", exact: true }).click();
  const chat = page.locator(".inspector").getByRole("region", { name: "Chat", exact: true });
  await expect(chat).toBeVisible();
  await expectHistoryVisibility(chat, publicPair, "Public");
  if (canSeePrivate) {
    await expectHistoryVisibility(chat, privatePair, "GM");
  } else {
    const privateOriginalLabel = privatePair.originalRoll.label ?? privatePair.originalRoll.formula;
    const privateRerollLabel = privatePair.reroll.label ?? privatePair.reroll.formula;
    await expect(chat.locator("article.chat-message").filter({ hasText: privateOriginalLabel })).toHaveCount(0);
    await expect(chat.locator("article.chat-message").filter({ hasText: privateRerollLabel })).toHaveCount(0);
  }
}

async function expectHistoryVisibility(chat: Locator, pair: HeroicPair, visibilityLabel: "Public" | "GM"): Promise<void> {
  const originalLabel = pair.originalRoll.label ?? pair.originalRoll.formula;
  const rerollLabel = pair.reroll.label ?? pair.reroll.formula;
  const original = chat.locator("article.chat-message").filter({ hasText: originalLabel }).first();
  const reroll = chat.locator("article.chat-message").filter({ hasText: rerollLabel }).first();
  await expect(original).toBeVisible();
  await expect(original.locator(".chat-visibility")).toHaveText(visibilityLabel);
  await expect(reroll).toBeVisible();
  await expect(reroll.locator(".chat-visibility")).toHaveText(visibilityLabel);
}

async function visibleRollHistory(page: Page, apiBaseUrl: string, campaignId: string): Promise<HeroicRoll[]> {
  return page.evaluate(async ({ baseUrl, id }) => {
    const token = localStorage.getItem("otte:sessionToken");
    if (!token) throw new Error("Missing active session token");
    const response = await fetch(`${baseUrl}/api/v1/campaigns/${id}/rolls`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const body = await response.text();
    if (!response.ok) throw new Error(body);
    return JSON.parse(body) as HeroicRoll[];
  }, { baseUrl: apiBaseUrl, id: campaignId });
}

function expectLinkedHistory(history: HeroicRoll[], pair: HeroicPair): void {
  const original = history.find((roll) => roll.id === pair.originalRoll.id);
  const reroll = history.find((roll) => roll.id === pair.reroll.id);
  expect(original?.heroicInspiration).toEqual(pair.originalRoll.heroicInspiration);
  expect(reroll?.heroicInspiration).toEqual(pair.reroll.heroicInspiration);
  expect(original?.visibility).toBe(pair.originalRoll.visibility);
  expect(reroll?.visibility).toBe(pair.reroll.visibility);
}

function expectHiddenHistory(history: HeroicRoll[], pair: HeroicPair): void {
  expect(history.some((roll) => roll.id === pair.originalRoll.id)).toBe(false);
  expect(history.some((roll) => roll.id === pair.reroll.id)).toBe(false);
}

async function expectJsonResponse<T>(response: Pick<APIResponse, "ok" | "text">): Promise<T> {
  const body = await response.text();
  expect(response.ok(), body).toBeTruthy();
  return JSON.parse(body) as T;
}
