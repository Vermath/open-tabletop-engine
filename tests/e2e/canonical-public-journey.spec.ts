import type { APIResponse, Browser, ConsoleMessage, Locator, Page, Request } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { dnd5eSrdCompendium } from "../../packages/system-sdk/src/index.js";
import { exerciseHeroicInspirationJourney } from "./heroic-inspiration-journey.js";
import { applyReviewedTypedDamageToHp } from "./reviewed-typed-damage.js";

const apiPort = Number(process.env.OTTE_E2E_CANONICAL_API_PORT ?? 4120);
const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
const apiControlBaseUrl = `http://127.0.0.1:${apiPort + 1000}`;

function observeFirstPartyUrls(page: Page, urls: string[]): void {
  const record = (url: string) => {
    try {
      const parsed = new URL(url);
      if (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") urls.push(url);
    } catch {
      // Ignore browser-internal URLs; only network and WebSocket URLs are relevant.
    }
  };
  page.on("request", (request) => record(request.url()));
  page.on("websocket", (socket) => record(socket.url()));
}

function expectNoSessionTokenInUrls(urls: string[]): void {
  expect(urls.length).toBeGreaterThan(0);
  expect(urls.filter((url) => decodeURIComponent(url).toLocaleLowerCase().includes("sessiontoken")).length).toBe(0);
}

function statusMessage(page: Page, text: string | RegExp): Locator {
  return page.getByRole("status").filter({ hasText: text }).first();
}

async function expectJsonResponse<T>(response: Pick<APIResponse, "ok" | "text">): Promise<T> {
  const body = await response.text();
  expect(response.ok(), body).toBeTruthy();
  return JSON.parse(body) as T;
}

async function openDetails(details: Locator): Promise<void> {
  await expect(details.locator("summary")).toBeVisible();
  if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await details.evaluate((element) => {
      (element as HTMLDetailsElement).open = true;
      element.scrollIntoView({ block: "nearest" });
    });
  }
}

async function openManageCategory(page: Page, categoryName: string): Promise<Locator> {
  const panel = page.getByRole("region", { name: "Manage workspace panel" });
  if (!(await panel.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: "Manage", exact: true }).click();
  }
  await expect(panel).toBeVisible();
  await panel.locator(".manage-category-button", { hasText: categoryName }).click();
  return panel;
}

async function closeManage(page: Page): Promise<void> {
  const panel = page.getByRole("region", { name: "Manage workspace panel" });
  await panel.getByRole("button", { name: "Close", exact: true }).click();
  await expect(panel).toBeHidden();
}

async function openInspectorPanel(page: Page, panelName: string): Promise<void> {
  await page.locator(".inspector-tabs").getByRole("tab", { name: panelName, exact: true }).click();
}

function selectedActorPanel(page: Page): Locator {
  return page.locator(".inspector");
}

function combatTrackerPanel(page: Page): Locator {
  return page.locator(".inspector .panel-stack").filter({ has: page.locator(".combat-hero") });
}

async function openActorDisclosure(root: Locator, summaryText: string): Promise<void> {
  await openDetails(root.locator("details.actor-detail-disclosure").filter({ hasText: summaryText }).first());
}

async function selectPartyActor(page: Page, actorName: string): Promise<void> {
  const actor = page.getByRole("region", { name: "Party" }).getByRole("button").filter({ hasText: actorName });
  await expect(actor).toBeVisible();
  await actor.click();
  await expect(actor).toHaveClass(/\bselected\b/);
}

async function satisfyCountedCheckboxGroups(dialog: Locator): Promise<void> {
  const groups = dialog.locator("fieldset");
  for (let groupIndex = 0; groupIndex < await groups.count(); groupIndex += 1) {
    const group = groups.nth(groupIndex);
    const legend = (await group.locator("legend").textContent()) ?? "";
    const counts = legend.match(/\((\d+)\/(\d+)\)/);
    if (!counts) continue;
    let selected = Number(counts[1]);
    const required = Number(counts[2]);
    while (selected < required) {
      const choice = group.locator('input[type="checkbox"]:not(:checked):not(:disabled)').first();
      await expect(choice, `available choice for ${legend}`).toBeVisible();
      await choice.check();
      selected += 1;
    }
  }
}

async function checkCreatorChoice(dialog: Locator, label: string): Promise<void> {
  const choice = dialog.locator("label").filter({ hasText: label }).getByRole("checkbox").first();
  await expect(choice, `creator choice ${label}`).toBeVisible();
  if (!(await choice.isChecked())) await choice.check();
}

async function createPlayerBard(page: Page, input: { characterName: string; playerName: string }): Promise<void> {
  await page.getByRole("button", { name: "Open character creator", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Character creator" });
  await expect(dialog).toBeVisible();

  await dialog.getByRole("radio").filter({ hasText: "Bard" }).click();
  await dialog.getByRole("button", { name: /Next/ }).click();

  await dialog.getByRole("radio").filter({ hasText: "Dwarf" }).click();
  await satisfyCountedCheckboxGroups(dialog);
  await dialog.getByRole("button", { name: /Next/ }).click();

  await dialog.getByRole("radio").filter({ hasText: "Soldier" }).click();
  await checkCreatorChoice(dialog, "Dancing Lights");
  await checkCreatorChoice(dialog, "Vicious Mockery");
  await checkCreatorChoice(dialog, "Healing Word");
  await checkCreatorChoice(dialog, "Bane");
  await satisfyCountedCheckboxGroups(dialog);
  const backgroundTool = dialog.getByRole("combobox", { name: "Background tool proficiency" });
  if (await backgroundTool.isVisible().catch(() => false)) await backgroundTool.selectOption({ index: 1 });
  const finishBackground = dialog.getByRole("button", { name: /Next/ });
  await expect(finishBackground, (await dialog.locator(".creator-validation").allTextContents()).join("\n")).toBeEnabled();
  await finishBackground.click();

  await dialog.getByRole("textbox", { name: "Character name" }).fill(input.characterName);
  const owner = dialog.getByRole("combobox", { name: "Character owner" });
  const playerOptionValue = await owner.locator("option").filter({ hasText: input.playerName }).first().getAttribute("value");
  expect(playerOptionValue).toBeTruthy();
  await owner.selectOption(playerOptionValue!);
  await dialog.getByRole("button", { name: "Create character" }).click();
  await expect(dialog).toBeHidden({ timeout: 60_000 });
  await expect(statusMessage(page, `${input.characterName} joined the party`)).toBeVisible({ timeout: 60_000 });
}

async function clickAndReviewPreparedDndAction(
  locator: Locator,
  options: {
    cancelFirst?: boolean;
    expectedSupport?: "Automated" | "DM decision" | "Unsupported";
    requiredSections?: string[];
    unchangedInput?: Locator;
  } = {},
): Promise<void> {
  const page = locator.page();
  const commitRequests: string[] = [];
  const observeCommit = (request: { method(): string; url(): string; postData(): string | null }) => {
    if (request.method() !== "POST" || !/\/actors\/[^/]+\/roll$/.test(new URL(request.url()).pathname)) return;
    try {
      const body = JSON.parse(request.postData() ?? "{}") as { commit?: boolean; preparedPreviewKey?: string };
      if (body.commit === true || typeof body.preparedPreviewKey === "string") commitRequests.push(request.url());
    } catch {
      // The acceptance check only classifies JSON action requests.
    }
  };
  page.on("request", observeCommit);

  const openReview = async (): Promise<Locator> => {
    await locator.click();
    const dialog = page.getByRole("dialog", { name: /Review .* action/ });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Structured consequence review", { exact: true })).toBeVisible();
    await expect(dialog.locator(".account-summary")).toContainText("Rule source: D&D 5e SRD server resolver");
    if (options.expectedSupport) {
      await expect(dialog.getByRole("note", { name: `Rules support: ${options.expectedSupport}`, exact: true })).toBeVisible();
    }
    for (const section of options.requiredSections ?? []) {
      await expect(dialog.getByRole("heading", { name: section, exact: true })).toBeVisible();
    }
    const reviewText = await dialog.innerText();
    expect(reviewText).not.toContain("preparedPreviewKey");
    expect(reviewText).not.toContain("commitMode");
    expect(reviewText).not.toContain("actorUpdates");
    await expect(dialog.locator("pre, code")).toHaveCount(0);
    return dialog;
  };

  try {
    if (options.cancelFirst) {
      const unchangedValue = options.unchangedInput ? await options.unchangedInput.inputValue() : undefined;
      const cancelledReview = await openReview();
      await expect(cancelledReview.getByRole("heading", { level: 2 })).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(cancelledReview.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(cancelledReview).toBeHidden();
      await expect(statusMessage(page, /action cancelled after review/)).toBeVisible();
      expect(commitRequests).toHaveLength(0);
      if (options.unchangedInput && unchangedValue !== undefined) await expect(options.unchangedInput).toHaveValue(unchangedValue);
    }

    const review = await openReview();
    await expect(review.getByRole("heading", { level: 2 })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(review.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    const commit = review.getByRole("button", { name: "Commit exact action", exact: true });
    await expect(commit).toBeFocused();
    await expect(commit).toBeEnabled();
    await page.keyboard.press("Enter");
    await expect(review).toBeHidden();
    await expect.poll(() => commitRequests.length).toBe(1);
  } finally {
    page.off("request", observeCommit);
  }
}

async function visibleRollIds(page: Page, campaignName: string): Promise<string[]> {
  return page.evaluate(async ({ apiBaseUrl, campaignName }) => {
    const json = async <T>(response: Response): Promise<T> => {
      const body = await response.text();
      if (!response.ok) throw new Error(body);
      return JSON.parse(body) as T;
    };
    const campaigns = await json<Array<{ id: string; name: string }>>(await fetch(`${apiBaseUrl}/api/v1/campaigns`, { credentials: "include" }));
    const campaign = campaigns.find((candidate) => candidate.name === campaignName);
    if (!campaign) throw new Error(`Campaign ${campaignName} was not found while checking roll history`);
    const rolls = await json<Array<{ id: string }>>(await fetch(`${apiBaseUrl}/api/v1/campaigns/${campaign.id}/rolls`, { credentials: "include" }));
    return rolls.map((roll) => roll.id);
  }, { apiBaseUrl, campaignName });
}

async function rollCoreStatistic(page: Page, button: Locator, campaignName: string): Promise<void> {
  const before = new Set(await visibleRollIds(page, campaignName));
  const rollRequests: Array<{ method: string; url: string; body: string | null }> = [];
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const observeRequest = (request: Request) => {
    if (/\/actors\/[^/]+\/roll$/.test(new URL(request.url()).pathname)) {
      rollRequests.push({ method: request.method(), url: request.url(), body: request.postData() });
    }
  };
  const observePageError = (error: Error) => pageErrors.push(error.message);
  const observeConsole = (message: ConsoleMessage) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  };
  page.on("request", observeRequest);
  page.on("pageerror", observePageError);
  page.on("console", observeConsole);
  try {
    await button.click();
    await expect.poll(async () => (await visibleRollIds(page, campaignName)).some((rollId) => !before.has(rollId)), {
      timeout: 30_000,
      message: "the core statistic roll should persist a new authoritative roll",
    }).toBe(true);
  } catch (error) {
    const diagnostics = {
      button: await button.evaluate((element) => ({ disabled: (element as HTMLButtonElement).disabled, text: element.textContent })),
      selectedInspectorTabs: await page.locator('.inspector-tabs [role="tab"][aria-selected="true"]').allTextContents(),
      dialogs: await page.getByRole("dialog").allTextContents(),
      statuses: await page.getByRole("status").allTextContents(),
      rollRequests,
      pageErrors,
      consoleErrors,
    };
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nCore roll diagnostics: ${JSON.stringify(diagnostics)}`);
  } finally {
    page.off("request", observeRequest);
    page.off("pageerror", observePageError);
    page.off("console", observeConsole);
  }
}

async function exercisePlayerSheetBeforeCombat(page: Page, characterName: string): Promise<void> {
  await selectPartyActor(page, characterName);
  await openInspectorPanel(page, "Actors");
  const actorPanel = selectedActorPanel(page);
  await expect(actorPanel.getByRole("heading", { name: characterName, exact: true })).toBeVisible();
  await actorPanel.getByRole("tab", { name: "Stats" }).click();
  const stats = actorPanel.getByRole("region", { name: "Actor stats sheet" });

  await rollCoreStatistic(page, stats.getByRole("button", { name: /Roll Strength check/ }), "Canonical Ember Campaign");
  await rollCoreStatistic(page, stats.getByRole("button", { name: /Roll Dexterity saving throw/ }), "Canonical Ember Campaign");

  const hp = stats.getByLabel("Actor sheet current HP");
  await applyReviewedTypedDamageToHp(page, { apiBaseUrl, campaignName: "Canonical Ember Campaign", actorName: characterName, targetHp: 5 });
  await expect(hp).toHaveValue("5");
  const prone = stats.getByRole("group", { name: "Toggle common conditions" }).getByRole("button", { name: "Prone" });
  await prone.click();
  await expect(prone).toHaveAttribute("aria-pressed", "true");

  await actorPanel.getByRole("tab", { name: "Actions" }).click();
  await openActorDisclosure(actorPanel, "Actor details");
  await actorPanel.getByRole("combobox", { name: "Action target actor" }).selectOption({ label: characterName });
  const applyEffect = actorPanel.getByRole("checkbox", { name: "Apply action effect" });
  const consumeResources = actorPanel.getByRole("checkbox", { name: "Consume action resources" });
  const actionSheet = actorPanel.getByRole("region", { name: "Actor action sheet" });

  if (await applyEffect.isChecked()) await applyEffect.uncheck();
  if (!(await consumeResources.isChecked())) await consumeResources.check();
  const inspiration = actionSheet.locator("article", { hasText: "Bardic Inspiration" }).first();
  const inspirationResource = actorPanel.getByLabel("Bardic Inspiration resource current");
  await expect(inspirationResource).toHaveValue("3");
  await clickAndReviewPreparedDndAction(inspiration.getByRole("button", { name: "Continue to final review" }), {
    cancelFirst: true,
    expectedSupport: "Automated",
    requiredSections: ["Rolls", "Resources"],
    unchangedInput: inspirationResource,
  });
  await expect(statusMessage(page, new RegExp(`${characterName} used action: Bardic Inspiration \\d+`))).toBeVisible();


  if (!(await applyEffect.isChecked())) await applyEffect.check();
  if (!(await consumeResources.isChecked())) await consumeResources.check();
  const healingWord = actionSheet.locator("article", { hasText: "Healing Word Healing" }).first();
  await expect(healingWord).toContainText("effect supported");
  await healingWord.getByRole("button", { name: "Preview" }).click();
  const healingPreview = actionSheet.getByRole("region", { name: "Action resolution preview" });
  await expect(healingPreview.locator(".operator-row", { hasText: "Previewed action" })).toContainText("Healing Word Healing");
  await clickAndReviewPreparedDndAction(healingPreview.getByRole("button", { name: "Continue to final review for previewed action" }), {
    expectedSupport: "Automated",
    requiredSections: ["Rolls", "Targets", "Damage, healing and effects", "Resources"],
  });
  await expect(statusMessage(page, new RegExp(`${characterName} used action: Level 1 Spell Slot \\d+; healing applied`))).toBeVisible();

  await actorPanel.getByRole("tab", { name: "Stats" }).click();
  const recovery = actorPanel.locator("details.actor-rest-card").first();
  await openDetails(recovery);
  await recovery.getByRole("button", { name: "Review long rest" }).click();
  const restReview = recovery.locator('[aria-label="Exact long rest review"]');
  await expect(restReview).toBeVisible();
  await restReview.getByLabel("Confirm exact rest review").check();
  await restReview.getByRole("button", { name: "Apply long rest" }).click();
  await expect(restReview).toBeHidden();
  await expect(actorPanel.getByRole("region", { name: "Actor at a glance" })).toContainText("Bardic Inspiration 3/3");

  await actorPanel.getByRole("tab", { name: "Actions" }).click();
  if (await applyEffect.isChecked()) await applyEffect.uncheck();
  if (!(await consumeResources.isChecked())) await consumeResources.check();
  const refreshedActionSheet = actorPanel.getByRole("region", { name: "Actor action sheet" });
  const dancingLights = refreshedActionSheet.locator("article", { hasText: "Dancing Lights Effect" }).first();
  await expect(dancingLights).toContainText("effect supported");
  await dancingLights.getByRole("button", { name: "Preview" }).click();
  const resolutionPreview = refreshedActionSheet.getByRole("region", { name: "Action resolution preview" });
  await expect(resolutionPreview.locator(".operator-row", { hasText: "Previewed action" })).toContainText("Dancing Lights Effect");
  await expect(resolutionPreview.locator(".operator-row", { hasText: "Conditions" })).toContainText("Concentration");
  await expect(resolutionPreview.locator(".operator-row", { hasText: "Resolver" })).toContainText("Preview ready");
  await clickAndReviewPreparedDndAction(resolutionPreview.getByRole("button", { name: "Continue to final review for previewed action" }), { expectedSupport: "DM decision" });
  await expect(actorPanel.getByRole("region", { name: "Actor at a glance" })).toContainText("Concentrating: Dancing Lights Effect");

  await actorPanel.getByRole("tab", { name: "Stats" }).click();

  const refreshedProne = actorPanel.getByRole("group", { name: "Toggle common conditions" }).getByRole("button", { name: "Prone" });
  if ((await refreshedProne.getAttribute("aria-pressed")) === "true") await refreshedProne.click();
  await expect(refreshedProne).toHaveAttribute("aria-pressed", "false");
}

async function currentAdvancementSpellState(page: Page, characterName: string, nextClassLevel: number): Promise<{
  className: string;
  preparedSpellIds: string[];
  alwaysPreparedSpellIds: string[];
}> {
  return page.evaluate(async ({ apiBaseUrl, characterName, nextClassLevel }) => {
    const json = async <T>(response: Response): Promise<T> => {
      const body = await response.text();
      if (!response.ok) throw new Error(body);
      return JSON.parse(body) as T;
    };
    const campaigns = await json<Array<{ id: string; name: string }>>(await fetch(`${apiBaseUrl}/api/v1/campaigns`, { credentials: "include" }));
    const campaign = campaigns.find((candidate) => candidate.name === "Canonical Ember Campaign");
    if (!campaign) throw new Error("Canonical campaign was not found while preparing advancement choices");
    const [actors, items] = await Promise.all([
      json<Array<{ id: string; name: string; data: Record<string, unknown> }>>(await fetch(`${apiBaseUrl}/api/v1/campaigns/${campaign.id}/actors`, { credentials: "include" })),
      json<Array<{ actorId?: string; type: string; data: Record<string, unknown> }>>(await fetch(`${apiBaseUrl}/api/v1/campaigns/${campaign.id}/items`, { credentials: "include" }))
    ]);
    const actor = actors.find((candidate) => candidate.name === characterName);
    if (!actor) throw new Error(`${characterName} was not found while preparing advancement choices`);
    const spellcasting = actor.data.spellcasting && typeof actor.data.spellcasting === "object" && !Array.isArray(actor.data.spellcasting)
      ? actor.data.spellcasting as Record<string, unknown>
      : {};
    const className = typeof spellcasting.className === "string"
      ? spellcasting.className
      : Array.isArray(actor.data.classes) && actor.data.classes[0] && typeof actor.data.classes[0] === "object" && !Array.isArray(actor.data.classes[0]) && typeof (actor.data.classes[0] as Record<string, unknown>).className === "string"
        ? String((actor.data.classes[0] as Record<string, unknown>).className)
        : "";
    if (!className) throw new Error(`${characterName} has no spellcasting class for advancement`);
    const preparedByClass = spellcasting.preparedSpellsByClass && typeof spellcasting.preparedSpellsByClass === "object" && !Array.isArray(spellcasting.preparedSpellsByClass)
      ? Object.entries(spellcasting.preparedSpellsByClass as Record<string, unknown>)
        .find(([candidate]) => candidate.toLowerCase() === className.toLowerCase())?.[1]
      : undefined;
    const prepared = Array.isArray(preparedByClass) ? preparedByClass : spellcasting.preparedSpells;
    const preparedSpellIds = Array.isArray(prepared)
      ? prepared.filter((spellId): spellId is string => typeof spellId === "string" && spellId.length > 0)
      : [];
    const alwaysPreparedSpellIds = items.filter((item) => item.actorId === actor.id).flatMap((item) => {
      if (item.type !== "spell" || item.data.alwaysPrepared !== true) return [];
      const minimumLevel = typeof item.data.minimumCharacterLevel === "number" ? item.data.minimumCharacterLevel : 1;
      const compendiumId = item.data.compendiumId ?? item.data.compendiumEntryId;
      return minimumLevel <= nextClassLevel && typeof compendiumId === "string" ? [compendiumId] : [];
    });
    return { className, preparedSpellIds, alwaysPreparedSpellIds };
  }, { apiBaseUrl, characterName, nextClassLevel });
}

async function requiredChoiceCount(group: Locator): Promise<number> {
  const legend = (await group.locator("legend").textContent()) ?? "";
  const match = legend.match(/Choose exactly (\d+)/i);
  if (!match) throw new Error(`Could not read required advancement choices from: ${legend}`);
  return Number(match[1]);
}

async function fillAvailableAdvancementChoices(group: Locator): Promise<void> {
  const required = await requiredChoiceCount(group);
  while (await group.locator('input[type="checkbox"]:checked').count() < required) {
    const choice = group.locator('input[type="checkbox"]:not(:checked):not(:disabled)').first();
    await expect(choice, `available advancement choice in ${(await group.locator("legend").textContent()) ?? "group"}`).toBeVisible();
    await choice.check();
  }
}

async function fillRulesValidAdvancementSpellChoices(page: Page, advancement: Locator, characterName: string, nextClassLevel: number): Promise<void> {
  const state = await currentAdvancementSpellState(page, characterName, nextClassLevel);
  const spellRegion = advancement.getByRole("region", { name: `${state.className} spell advancement`, exact: true });
  if (!(await spellRegion.isVisible().catch(() => false))) return;

  const spellbookAdditions = spellRegion.getByRole("group", { name: "Wizard spellbook additions", exact: true });
  if (await spellbookAdditions.isVisible().catch(() => false)) await fillAvailableAdvancementChoices(spellbookAdditions);

  const preparedSpells = spellRegion.getByRole("group", { name: `${state.className} prepared spells`, exact: true });
  const requiredPrepared = await requiredChoiceCount(preparedSpells);
  const alwaysPrepared = new Set(state.alwaysPreparedSpellIds.map((spellId) => spellId.toLowerCase()));
  const retainedSpellIds = [...new Set(state.preparedSpellIds.filter((spellId) => !alwaysPrepared.has(spellId.toLowerCase())))];
  expect(retainedSpellIds.length, `${state.className} current prepared spells must fit its next-level capacity`).toBeLessThanOrEqual(requiredPrepared);
  const spellNames = new Map(dnd5eSrdCompendium().filter((entry) => entry.type === "spell").map((entry) => [entry.id.toLowerCase(), entry.name]));
  for (const spellId of retainedSpellIds) {
    const spellName = spellNames.get(spellId.toLowerCase());
    if (!spellName) throw new Error(`Missing compendium spell for current ${state.className} choice: ${spellId}`);
    const checkbox = preparedSpells.getByRole("checkbox", { name: new RegExp(`^${spellName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} Level`) });
    await expect(checkbox, `current ${state.className} prepared spell ${spellName}`).toBeVisible();
    if (!(await checkbox.isChecked())) await checkbox.check();
  }
  await fillAvailableAdvancementChoices(preparedSpells);
  await expect(spellRegion.getByRole("status")).toContainText(`${state.className} spell choices are complete.`);
}

async function advanceCharacterToLevelTwo(page: Page, characterName: string): Promise<void> {
  await page.reload();
  await expect(page.getByRole("heading", { name: "Canonical Ember Campaign" })).toBeVisible();
  await selectPartyActor(page, characterName);
  await page.getByRole("button", { name: "Prep", exact: true }).click();
  await openInspectorPanel(page, "Plugins");
  const sdkPanel = page.locator(".inspector .panel-stack", { hasText: "Runtime SDK" });
  const advancement = sdkPanel.getByRole("region", { name: "Actor advancement choices" });
  await expect(advancement.getByRole("combobox", { name: "Advancement option" })).toContainText("Level 2");
  await fillRulesValidAdvancementSpellChoices(page, advancement, characterName, 2);
  await advancement.getByRole("radio", { name: /Fixed average/ }).check();
  await advancement.getByRole("button", { name: "Review advancement" }).click();
  await expect(advancement.getByRole("region", { name: "Advancement review step" })).toContainText("Level 2");
  const confirm = advancement.getByLabel("Confirm advancement review");
  await expect(confirm, await advancement.innerText()).toBeEnabled();
  await confirm.check();
  await sdkPanel.getByRole("button", { name: "Level Up", exact: true }).click();
  await expect(statusMessage(page, `${characterName} advanced to Level 2`)).toBeVisible();
}

async function prepareAndLaunchEncounter(page: Page, input: { characterName: string; encounterName: string }): Promise<void> {
  await page.getByRole("button", { name: "Live Table", exact: true }).click();
  await openInspectorPanel(page, "Combat");
  await page.getByRole("button", { name: "Plan Encounter" }).click();
  const dialog = page.getByRole("dialog", { name: "Encounter builder" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox", { name: "Encounter name" }).fill(input.encounterName);
  await dialog.getByRole("textbox", { name: "Search encounter threats" }).fill("Goblin");
  const goblin = dialog.getByText("Goblin Warrior", { exact: true }).locator("xpath=ancestor::article[contains(@class, 'encounter-threat')][1]");
  await expect(goblin).toBeVisible({ timeout: 30_000 });
  await goblin.getByRole("button", { name: "Add" }).click();

  const party = dialog.locator(".encounter-party");
  const clearParty = party.getByRole("button", { name: "Clear party" });
  if (await clearParty.isEnabled()) await clearParty.click();
  const character = party.getByRole("checkbox", { name: input.characterName, exact: true });
  await character.check();
  const characterRow = character.locator("xpath=ancestor::div[contains(@class, 'encounter-party-row')][1]");
  await characterRow.getByRole("button", { name: "Place on scene" }).click();
  await expect(characterRow).toContainText("On scene");

  await dialog.getByRole("button", { name: "Save encounter" }).click();
  await expect(statusMessage(page, `${input.encounterName} saved`)).toBeVisible();
  await dialog.getByRole("button", { name: "Place & review combat" }).click();
  await expect(dialog).toBeHidden();

  const review = page.getByRole("dialog", { name: /Review / });
  await expect(review).toBeVisible();
  const serverRoll = review.getByRole("checkbox", { name: /Server-roll initiative/ });
  if (await serverRoll.isChecked()) await serverRoll.uncheck();
  const initiativeInputs = review.locator('input[type="number"]:enabled');
  for (let index = 0; index < await initiativeInputs.count(); index += 1) {
    await initiativeInputs.nth(index).fill(String(20 - index));
  }
  await review.getByRole("spinbutton", { name: `${input.characterName} initiative` }).fill("99");
  await review.getByRole("button", { name: /^Start combat \(\d+\)$/ }).click();
  await expect(review).toBeHidden();
  await expect(combatTrackerPanel(page).getByRole("heading", { name: "Round 1" })).toBeVisible();
}

async function assignPlayerTokenControl(page: Page, characterName: string): Promise<void> {
  await page.getByRole("button", { name: `Token ${characterName}` }).click();
  await openInspectorPanel(page, "Actors");
  const actorPanel = selectedActorPanel(page);
  await openActorDisclosure(actorPanel, "Token settings");
  await actorPanel.getByRole("button", { name: "Party controlled" }).click();
  await expect(actorPanel.locator('[aria-label="Token permission presets"]')).toContainText("Party controlled");
}

async function exercisePlayerCombatAction(playerPage: Page, gmPage: Page, characterName: string): Promise<void> {
  await playerPage.reload();
  await expect(playerPage.getByRole("heading", { name: "Canonical Ember Campaign" })).toBeVisible();
  await playerPage.getByRole("button", { name: `Token ${characterName}` }).click();
  await openInspectorPanel(playerPage, "Actors");
  const actorPanel = selectedActorPanel(playerPage);
  await actorPanel.getByRole("tab", { name: "Actions" }).click();
  await openActorDisclosure(actorPanel, "Actor details");
  await actorPanel.getByRole("combobox", { name: "Action target actor" }).selectOption({ label: "Goblin Warrior" });
  const applyEffect = actorPanel.getByRole("checkbox", { name: "Apply action effect" });
  const consumeResources = actorPanel.getByRole("checkbox", { name: "Consume action resources" });
  if (await applyEffect.isChecked()) await applyEffect.uncheck();
  if (await consumeResources.isChecked()) await consumeResources.uncheck();
  const actionSheet = actorPanel.getByRole("region", { name: "Actor action sheet" });
  const attack = actionSheet.locator("article").filter({ hasText: /(?:Dagger|Rapier|Shortsword) Attack/ }).first();
  await expect(attack).toBeVisible();
  const resolutionPreview = actionSheet.getByRole("region", { name: "Action resolution preview" });

  await gmPage.getByRole("button", { name: "Live Table", exact: true }).click();
  await openInspectorPanel(gmPage, "Combat");
  const combatPanel = combatTrackerPanel(gmPage);
  const round = combatPanel.getByRole("heading", { name: /Round \d+/ });
  const activeTurn = combatPanel.locator(".combat-hero .panel-subtitle");

  let continuationArmed = false;
  for (let attempt = 0; attempt < 12 && !continuationArmed; attempt += 1) {
    await attack.getByRole("button", { name: "Preview" }).click();
    await expect(resolutionPreview.locator(".operator-row", { hasText: "Previewed action" })).toContainText("Attack");
    const committedAttack = playerPage.waitForResponse((response) => {
      const request = response.request();
      if (request.method() !== "POST" || !/\/actors\/[^/]+\/roll$/.test(new URL(response.url()).pathname)) return false;
      try {
        const body = JSON.parse(request.postData() ?? "{}") as { commit?: boolean; preparedPreviewKey?: string };
        return body.commit === true || typeof body.preparedPreviewKey === "string";
      } catch {
        return false;
      }
    });
    await clickAndReviewPreparedDndAction(resolutionPreview.getByRole("button", { name: "Continue to final review for previewed action" }), {
      expectedSupport: "Automated",
      requiredSections: ["Rolls", "Targets"],
    });
    const attackResult = await expectJsonResponse<{ resolution?: { auditEvents?: Array<{ code?: string }> } }>(await committedAttack);
    continuationArmed = attackResult.resolution?.auditEvents?.some((event) => event.code === "continuation.armed") === true;
    await expect(statusMessage(playerPage, `${characterName} action posted`)).toBeVisible();
    if (continuationArmed) break;

    const startingRound = Number((await round.textContent())?.match(/\d+/)?.[0] ?? "0");
    for (let turn = 0; turn < 12; turn += 1) {
      const currentRound = Number((await round.textContent())?.match(/\d+/)?.[0] ?? "0");
      if (currentRound > startingRound && (await activeTurn.textContent())?.includes(characterName)) break;
      const previousPosition = `${await round.textContent()}|${await activeTurn.textContent()}`;
      const turnUpdate = gmPage.waitForResponse((response) =>
        response.request().method() === "PATCH"
        && /\/api\/v1\/combats\/[^/]+$/.test(new URL(response.url()).pathname),
      );
      await combatPanel.getByRole("button", { name: "Next turn" }).click();
      await expectJsonResponse(await turnUpdate);
      await expect.poll(async () => `${await round.textContent()}|${await activeTurn.textContent()}`).not.toBe(previousPosition);
    }
    await expect(activeTurn).toContainText(characterName);
  }
  expect(continuationArmed, "a committed weapon hit should arm the matching damage continuation").toBe(true);

  await applyEffect.check();
  const damage = actionSheet.locator("article").filter({ hasText: /(?:Dagger|Rapier|Shortsword) Damage/ }).first();
  await expect(damage).toContainText("effect supported");
  await damage.getByRole("button", { name: "Preview" }).click();
  await expect(resolutionPreview.locator(".operator-row", { hasText: "Previewed action" })).toContainText("Damage");
  const commitDamage = resolutionPreview.getByRole("button", { name: "Continue to final review for previewed action" });
  await expect(commitDamage).toBeEnabled({ timeout: 30_000 });
  await clickAndReviewPreparedDndAction(commitDamage, {
    expectedSupport: "Automated",
    requiredSections: ["Rolls", "Targets", "Damage, healing and effects"],
  });
  await expect(statusMessage(playerPage, `${characterName} action pending GM confirmation`)).toBeVisible();

  const pendingSection = combatPanel.getByRole("region", { name: "Pending combat actions" });
  await expect(pendingSection.getByText("Pending GM Confirmation", { exact: true })).toBeVisible();
  const pending = pendingSection.locator("article").filter({ hasText: characterName }).filter({ hasText: /Damage/ }).first();
  await expect(pending.getByText("pending", { exact: true })).toBeVisible();
  const confirmation = gmPage.waitForResponse((response) =>
    response.request().method() === "POST"
    && /\/api\/v1\/combats\/[^/]+\/actions\/[^/]+\/confirm$/.test(new URL(response.url()).pathname),
  );
  await pending.getByRole("button", { name: "Confirm" }).click();
  await expectJsonResponse(await confirmation);
  await expect(statusMessage(gmPage, /Damage confirmed/)).toBeVisible();
  await expect(pendingSection).toBeHidden();

  const committedRound = Number((await round.textContent())?.match(/\d+/)?.[0] ?? "0");
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const currentRound = Number((await round.textContent())?.match(/\d+/)?.[0] ?? "0");
    if (currentRound > committedRound && (await activeTurn.textContent())?.includes(characterName)) break;
    const previousPosition = `${await round.textContent()}|${await activeTurn.textContent()}`;
    const turnUpdate = gmPage.waitForResponse((response) =>
      response.request().method() === "PATCH"
      && /\/api\/v1\/combats\/[^/]+$/.test(new URL(response.url()).pathname),
    );
    await combatPanel.getByRole("button", { name: "Next turn" }).click();
    await expectJsonResponse(await turnUpdate);
    await expect.poll(async () => `${await round.textContent()}|${await activeTurn.textContent()}`).not.toBe(previousPosition);
  }
  await expect.poll(async () => Number((await round.textContent())?.match(/\d+/)?.[0] ?? "0")).toBeGreaterThan(committedRound);
  await expect(activeTurn).toContainText(`${characterName} is up`);
}

async function resolveDeathSaves(playerPage: Page, characterName: string): Promise<"stable" | "dead" | "revived"> {
  await playerPage.reload();
  await expect(playerPage.getByRole("heading", { name: "Canonical Ember Campaign" })).toBeVisible({ timeout: 60_000 });
  await playerPage.getByRole("button", { name: `Token ${characterName}` }).click();
  await openInspectorPanel(playerPage, "Actors");
  const stats = selectedActorPanel(playerPage).getByRole("region", { name: "Actor stats sheet" });
  const deathSaveRow = stats.locator(".actor-death-save-row");
  await expect(deathSaveRow).toContainText("Death saves 0/3 - 0/3");

  let terminal: "stable" | "dead" | "revived" | undefined;
  for (let attempt = 0; attempt < 5 && !terminal; attempt += 1) {
    const commit = playerPage.waitForResponse((response) => {
      if (response.request().method() !== "POST" || !/\/actors\/[^/]+\/roll$/.test(new URL(response.url()).pathname) || !response.ok()) return false;
      try {
        const body = JSON.parse(response.request().postData() ?? "{}") as { rollId?: string; commit?: boolean };
        return body.rollId === "death-save" && body.commit !== false;
      } catch {
        return false;
      }
    });
    await deathSaveRow.getByRole("button", { name: /Roll Death Saving Throw/ }).click();
    const result = await expectJsonResponse<{ resolution?: { deathSave?: { result?: "stable" | "dead" | "revived" } } }>(await commit);
    terminal = result.resolution?.deathSave?.result;
  }
  expect(terminal).toBeTruthy();
  return terminal!;
}

async function createCampaignThroughSetupWizard(page: Page, campaignName: string): Promise<string> {
  const manage = await openManageCategory(page, "Campaign");
  const drawer = manage.locator("details.create-drawer").filter({ hasText: "New campaign" }).first();
  await openDetails(drawer);
  const setup = drawer.locator("form.campaign-setup-steps");
  await expect(setup.getByText("Campaign Setup", { exact: true })).toBeVisible();

  await expect(setup.getByRole("button", { name: "1. Campaign", exact: true })).toHaveAttribute("aria-current", "step");
  await setup.getByRole("textbox", { name: "Campaign name", exact: true }).fill(campaignName);
  await setup.getByRole("textbox", { name: "Campaign description", exact: true }).fill("Canonical public-UI acceptance campaign");
  await setup.getByRole("combobox", { name: "Campaign rules system", exact: true }).selectOption("dnd-5e-srd");
  await setup.getByRole("combobox", { name: "Campaign visibility", exact: true }).selectOption("invite_only");
  await setup.getByRole("button", { name: "Next: Scene & map", exact: true }).click();

  await expect(setup.getByRole("button", { name: "2. Scene & map", exact: true })).toHaveAttribute("aria-current", "step");
  await setup.getByRole("checkbox", { name: "Include starter content", exact: true }).uncheck();
  await setup.getByRole("textbox", { name: "Setup initial scene name", exact: true }).fill("First Scene");
  await openDetails(setup.locator("details.campaign-setup-advanced").filter({ hasText: "Advanced scene and onboarding settings" }));
  await setup.getByRole("textbox", { name: "Setup onboarding title", exact: true }).fill("First-Light Table Note");
  await setup.getByRole("textbox", { name: "Setup onboarding copy", exact: true }).fill("Meet at the ember gate, protect one another, and record what changes the world.");
  await setup.getByRole("button", { name: "Next: Invitation", exact: true }).click();

  await expect(setup.getByRole("button", { name: "3. Invitation", exact: true })).toHaveAttribute("aria-current", "step");
  await setup.getByRole("checkbox", { name: "Create starter invite", exact: true }).check();
  await setup.getByRole("textbox", { name: "Setup invite email", exact: true }).fill("canonical.player@example.test");
  await setup.getByRole("combobox", { name: "Setup default player permission preset", exact: true }).selectOption("player");
  await setup.getByRole("button", { name: "Next: Review", exact: true }).click();

  await expect(setup.getByRole("button", { name: "4. Review", exact: true })).toHaveAttribute("aria-current", "step");
  await expect(setup.getByRole("heading", { name: "Review and create", exact: true })).toBeVisible();
  const impact = setup.locator('[aria-label="Campaign setup impact"]');
  await expect(impact).toContainText("Invite only - Player invite for canonical.player@example.test");
  await expect(impact).toContainText("First Scene - 1200x800 - grid 50");
  await expect(impact).toContainText("Public handout: First-Light Table Note");
  await setup.getByRole("button", { name: "Create Campaign Setup", exact: true }).click();

  await expect(page.getByRole("heading", { name: campaignName, exact: true })).toBeVisible();
  await expect(statusMessage(page, new RegExp(`${campaignName} created with First Scene; invite link ready to copy`))).toBeVisible();
  const tokenInput = page.locator('input[aria-label="Invite token"][readonly]');
  await expect(tokenInput).toHaveValue(/^oti_/);
  const inviteToken = await tokenInput.inputValue();
  await closeManage(page);
  return inviteToken;
}

async function expectPublicSessionNote(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Live Table", exact: true }).click();
  await openInspectorPanel(page, "Journal");
  await expect(page.getByRole("heading", { name: "First-Light Table Note", exact: true })).toBeVisible();
  await expect(page.getByText("Meet at the ember gate, protect one another, and record what changes the world.", { exact: true })).toBeVisible();
}

async function createIndependentPlayer(browser: Browser, inviteToken: string, observedUrls: string[]): Promise<{ context: Awaited<ReturnType<Browser["newContext"]>>; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  observeFirstPartyUrls(page, observedUrls);
  await page.goto(`/join?invite=${encodeURIComponent(inviteToken)}`);
  await expect(page.locator(".section-title", { hasText: "Accept Invite" })).toBeVisible();
  await page.getByRole("textbox", { name: "Join email" }).fill("canonical.player@example.test");
  await page.getByRole("textbox", { name: "Display name" }).fill("Canonical Player");
  await page.getByLabel("Join password").fill("correct horse");
  await page.getByRole("button", { name: "Accept Invite" }).click();
  await expect(page.getByRole("heading", { name: "Canonical Ember Campaign" })).toBeVisible();
  return { context, page };
}

test("blank deployment completes one canonical GM-and-player D&D session and resumes after API restart", async ({ browser, page }) => {
  const campaignName = "Canonical Ember Campaign";
  const characterName = "Mira Embervoice";
  const encounterName = "Goblin at First Light";
  const observedUrls: string[] = [];

  observeFirstPartyUrls(page, observedUrls);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Create Owner" })).toBeVisible();
  await page.getByRole("textbox", { name: "Owner email" }).fill("canonical.gm@example.test");
  await page.getByRole("textbox", { name: "Owner display name" }).fill("Canonical GM");
  await page.getByLabel("Owner password").fill("correct horse");
  await page.getByRole("textbox", { name: "Initial campaign name" }).fill("Bootstrap Staging Campaign");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("heading", { name: "Bootstrap Staging Campaign" })).toBeVisible();

  const inviteToken = await createCampaignThroughSetupWizard(page, campaignName);
  await expect(page.getByRole("heading", { name: campaignName })).toBeVisible();
  await expect(page.locator(".scene-tabs")).toContainText("First Scene");
  await expectPublicSessionNote(page);

  const player = await createIndependentPlayer(browser, inviteToken, observedUrls);
  try {
    await expectPublicSessionNote(player.page);
    await expect(page.getByRole("status", { name: /Session connection:/ })).toContainText("2 online");
    await createPlayerBard(page, { characterName, playerName: "Canonical Player" });

    await test.step("T09 Heroic Inspiration grant, selected-d20 reroll, and linked visibility history", async () => {
      await exerciseHeroicInspirationJourney({
        apiBaseUrl,
        campaignName,
        characterName,
        gmPage: page,
        playerPage: player.page,
      });
    });

    await player.page.reload();
    await expect(player.page.getByRole("heading", { name: campaignName })).toBeVisible({ timeout: 60_000 });
    await exercisePlayerSheetBeforeCombat(player.page, characterName);

    await advanceCharacterToLevelTwo(page, characterName);
    await prepareAndLaunchEncounter(page, { characterName, encounterName });
    await assignPlayerTokenControl(page, characterName);
    await exercisePlayerCombatAction(player.page, page, characterName);

    await page.getByRole("button", { name: `Token ${characterName}` }).click();
    await openInspectorPanel(page, "Actors");
    const gmStats = selectedActorPanel(page).getByRole("region", { name: "Actor stats sheet" });
    await applyReviewedTypedDamageToHp(page, { apiBaseUrl, campaignName, actorName: characterName, targetHp: 0 });
    await expect(gmStats.getByLabel("Actor sheet current HP")).toHaveValue("0");
    await expect(selectedActorPanel(page).getByRole("region", { name: "Actor at a glance" })).not.toContainText("Concentrating: Dancing Lights Effect");

    const terminal = await resolveDeathSaves(player.page, characterName);

    const beforeRestart = await expectJsonResponse<{ generation: number; running: boolean }>(await page.request.get(`${apiControlBaseUrl}/status`));
    expect(beforeRestart.running).toBe(true);
    const restarted = await expectJsonResponse<{ generation: number; restarted: boolean }>(await page.request.post(`${apiControlBaseUrl}/restart`));
    expect(restarted).toEqual({ generation: beforeRestart.generation + 1, restarted: true });
    await expect.poll(
      async () => page.request.get(`${apiBaseUrl}/api/v1/health`).then((response) => response.ok()).catch(() => false),
      { timeout: 30_000 },
    ).toBe(true);

    await player.page.reload();
    await expect(player.page.getByRole("heading", { name: campaignName })).toBeVisible({ timeout: 60_000 });
    await player.page.getByRole("button", { name: `Token ${characterName}` }).click();
    await openInspectorPanel(player.page, "Actors");
    const reloadedActorPanel = selectedActorPanel(player.page);
    await expect(reloadedActorPanel.getByRole("region", { name: "Actor at a glance" })).not.toContainText("Concentrating: Dancing Lights Effect");
    const reloadedStats = reloadedActorPanel.getByRole("region", { name: "Actor stats sheet" });
    if (terminal === "revived") {
      await expect(reloadedStats.getByLabel("Actor sheet current HP")).toHaveValue("1");
      await expect(reloadedStats.locator(".actor-death-save-row")).toHaveCount(0);
    } else {
      await expect(reloadedStats.locator(".actor-death-save-row")).toContainText(terminal === "stable" ? "Stable" : "Dead");
      if (terminal === "stable") await expect(reloadedStats.locator(".actor-death-save-row")).toContainText("Death saves 0/3 - 0/3");
    }
    await expectPublicSessionNote(player.page);

    await page.reload();
    await expect(page.getByRole("heading", { name: campaignName })).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Live Table", exact: true }).click();
    await openInspectorPanel(page, "Combat");
    const persistedRound = combatTrackerPanel(page).getByRole("heading", { name: /Round \d+/ });
    await expect(persistedRound).toBeVisible();
    await expect.poll(async () => Number((await persistedRound.textContent())?.match(/\d+/)?.[0] ?? "0")).toBeGreaterThanOrEqual(2);
    await expect(page.getByRole("region", { name: "Party" })).toContainText(characterName);
    expect(await page.evaluate(() => localStorage.getItem("otte:sessionToken"))).toBeNull();
    expect(await player.page.evaluate(() => localStorage.getItem("otte:sessionToken"))).toBeNull();
    expectNoSessionTokenInUrls(observedUrls);
  } finally {
    await player.context.close().catch(() => undefined);
  }
});
