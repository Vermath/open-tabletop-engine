import { randomUUID } from "node:crypto";
import type { DndRulesMutationUndoDescriptor } from "../../packages/core/src/index.js";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

async function openValenActions(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();
  await expect(page.getByLabel("Current campaign", { exact: true })).toHaveText("The Ember Vault");
  await expect(page.locator(".scene-board")).toBeVisible();
  await page.locator("#inspector-tab-actors").click();
  // Exact name: an earlier test in a full run leaves a "Valen Ash Copy" beside the seeded character.
  await page.getByRole("region", { name: "Party" }).getByRole("button", { name: "VA Valen Ash Fighter", exact: true }).click();
  await expect(page.locator(".inspector").getByRole("heading", { name: "Valen Ash" })).toBeVisible();
  await page.getByRole("tab", { name: "Actions" }).click();
  const sheet = page.getByRole("region", { name: "Actor action sheet" });
  await expect(sheet).toBeVisible();
  // Target and effect options live in the collapsed actor details.
  const details = page.locator(".inspector details.actor-detail-disclosure").filter({ hasText: "Actor details" }).first();
  if (!(await details.evaluate((element) => (element as HTMLDetailsElement).open))) await details.locator(":scope > summary").click();
  return sheet;
}

/** Targets the seeded Valen Ash by option value, whatever label a duplicate name gives it. */
async function targetValen(page: Page) {
  const target = page.getByRole("combobox", { name: "Action target actor" });
  const value = await target.evaluate((select) => {
    const options = Array.from((select as HTMLSelectElement).options);
    return (options.find((option) => option.value === "act_valen") ?? options.find((option) => option.text.startsWith("Valen Ash") && !option.text.includes("Copy")))?.value ?? null;
  });
  expect(value).not.toBeNull();
  await target.selectOption(value!);
}

/** Second Wind uses left, read from the resource line ("Second Wind 2/2"). */
async function secondWindUses(resources: Locator): Promise<number> {
  const match = /Second Wind (\d+)\/\d+/.exec(await resources.innerText());
  expect(match).not.toBeNull();
  return Number(match![1]);
}

function statusLine(page: Page, text: string | RegExp) {
  return page.getByRole("status").filter({ hasText: text }).first();
}

test("a routine action commits in one step and can be undone from its toast", async ({ page }) => {
  const sheet = await openValenActions(page);
  const inspector = page.locator(".inspector");
  const resources = inspector.locator(".metric-row", { hasText: "Resources" });
  const usesBefore = await secondWindUses(resources);
  test.skip(usesBefore < 1, "An earlier test in this run spent every Second Wind use.");
  const hpBefore = await inspector.locator(".hp-bar").first().innerText();

  await targetValen(page);
  await page.getByRole("checkbox", { name: "Apply action effect" }).check();
  await page.getByRole("checkbox", { name: "Consume action resources" }).check();
  const secondWind = sheet.locator("article", { hasText: "Second Wind" }).first();
  await secondWind.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByRole("status", { name: "Action review progress" })).toContainText("Preview ready - nothing committed");

  await secondWind.getByRole("button", { name: /^Use .* now$/ }).click();

  // No review dialog: the result is committed and reported with an undo.
  const toast = page.locator(".toast").filter({ hasText: `Valen Ash used action: Second Wind ${usesBefore - 1}; healing applied` });
  await expect(toast).toBeVisible();
  await expect(page.getByRole("dialog", { name: /^Review / })).toHaveCount(0);
  await expect.poll(() => secondWindUses(resources)).toBe(usesBefore - 1);

  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(statusLine(page, "Last D&D rules change undone")).toBeVisible();
  await expect.poll(() => secondWindUses(resources)).toBe(usesBefore);
  await expect.poll(async () => inspector.locator(".hp-bar").first().innerText()).toBe(hpBefore);
});

test("the review is still one click away and cancelling it commits nothing", async ({ page }) => {
  const sheet = await openValenActions(page);
  const inspector = page.locator(".inspector");
  const resources = inspector.locator(".metric-row", { hasText: "Resources" });
  const usesBefore = await secondWindUses(resources);
  test.skip(usesBefore < 1, "An earlier test in this run spent every Second Wind use.");

  await targetValen(page);
  await page.getByRole("checkbox", { name: "Apply action effect" }).check();
  await page.getByRole("checkbox", { name: "Consume action resources" }).check();
  const secondWind = sheet.locator("article", { hasText: "Second Wind" }).first();
  await secondWind.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByRole("status", { name: "Action review progress" })).toContainText("Preview ready - nothing committed");

  await secondWind.getByRole("button", { name: "Continue to final review" }).click();
  const review = page.getByRole("dialog", { name: /^Review / });
  await expect(review).toBeVisible();
  await expect(review.getByRole("button", { name: "Commit exact action", exact: true })).toBeVisible();
  await review.getByRole("button", { name: /Cancel/ }).first().click();
  await expect(review).toHaveCount(0);
  await expect(statusLine(page, "Valen Ash action cancelled after review")).toBeVisible();
  expect(await secondWindUses(resources)).toBe(usesBefore);
});

test("undoing from the rail dismisses the matching action toast", async ({ page }) => {
  const sheet = await openValenActions(page);
  const resources = page.locator(".inspector .metric-row", { hasText: "Resources" });
  const usesBefore = await secondWindUses(resources);
  expect(usesBefore).toBeGreaterThan(0);
  await targetValen(page);
  await page.getByRole("checkbox", { name: "Apply action effect" }).check();
  await page.getByRole("checkbox", { name: "Consume action resources" }).check();
  const secondWind = sheet.locator("article", { hasText: "Second Wind" }).first();
  await secondWind.getByRole("button", { name: "Preview" }).click();
  await secondWind.getByRole("button", { name: /^Use .* now$/ }).click();
  const toast = page.locator(".toast").filter({ has: page.getByRole("button", { name: "Undo", exact: true }) });
  await expect(toast).toBeVisible();
  let undoRequests = 0;
  page.on("request", (request) => { if (/\/rules-mutations\/[^/]+\/undo$/.test(new URL(request.url()).pathname)) undoRequests += 1; });
  await page.getByRole("button", { name: "Undo last D&D rules change", exact: true }).click();
  await expect(statusLine(page, "Last D&D rules change undone")).toBeVisible();
  await expect.poll(() => secondWindUses(resources)).toBe(usesBefore);
  await expect(toast).toHaveCount(0);
  expect(undoRequests).toBe(1);
});

for (const transition of ["campaign", "user"] as const) {
  test(`action undo is dismissed when switching ${transition}`, async ({ page, request }) => {
    const apiBase = `http://127.0.0.1:${process.env.OTTE_E2E_API_PORT ?? 4100}`;
    const targetName = `Undo workspace ${randomUUID().slice(0, 8)}`;
    if (transition === "campaign") {
      const created = await request.post(`${apiBase}/api/v1/campaigns`, { headers: { "x-user-id": "usr_demo_gm", "idempotency-key": randomUUID() }, data: { name: targetName, defaultSystemId: "dnd-5e-srd" } });
      expect(created.ok()).toBe(true);
    }
    const sheet = await openValenActions(page);
    const resources = page.locator(".inspector .metric-row", { hasText: "Resources" });
    expect(await secondWindUses(resources)).toBeGreaterThan(0);
    await targetValen(page);
    await page.getByRole("checkbox", { name: "Apply action effect" }).check();
    await page.getByRole("checkbox", { name: "Consume action resources" }).check();
    const secondWind = sheet.locator("article", { hasText: "Second Wind" }).first();
    await secondWind.getByRole("button", { name: "Preview" }).click();
    const committed = page.waitForResponse((response) => {
      const http = response.request();
      return http.method() === "POST" && /\/actors\/act_valen\/roll$/.test(new URL(response.url()).pathname) && typeof http.postDataJSON()?.preparedPreviewKey === "string";
    });
    let undo: DndRulesMutationUndoDescriptor | undefined;
    try {
      await secondWind.getByRole("button", { name: /^Use .* now$/ }).click();
      const response = await committed;
      expect(response.ok()).toBe(true);
      undo = (await response.json() as { undo: DndRulesMutationUndoDescriptor }).undo;
      expect(undo).toBeDefined();
      const toast = page.locator(".toast").filter({ has: page.getByRole("button", { name: "Undo", exact: true }) });
      await expect(toast).toBeVisible();
      let undoRequests = 0;
      page.on("request", (http) => { if (/\/rules-mutations\/[^/]+\/undo$/.test(new URL(http.url()).pathname)) undoRequests += 1; });
      if (transition === "campaign") {
        await page.getByLabel("Switch campaign: The Ember Vault", { exact: true }).click();
        await page.getByRole("navigation", { name: "Campaigns" }).getByRole("button", { name: targetName, exact: true }).click();
        await expect(page.getByLabel("Current campaign", { exact: true })).toHaveText(targetName);
      } else {
        await page.getByRole("combobox", { name: "Session user", exact: true }).selectOption("usr_demo_player");
        await expect(page.getByRole("combobox", { name: "Session user", exact: true })).toHaveValue("usr_demo_player");
      }
      await expect(toast).toHaveCount(0);
      expect(undoRequests).toBe(0);
    } finally {
      if (undo) {
        const restored = await request.post(`${apiBase}/api/v1/campaigns/camp_demo/dnd/rules-mutations/${undo.mutationId}/undo`, {
          headers: { "x-user-id": "usr_demo_gm", "idempotency-key": `cleanup:${undo.mutationId}` },
          data: { expectedActorUpdatedAt: undo.expectedActorUpdatedAt, expectedItemUpdatedAt: undo.expectedItemUpdatedAt, ...(undo.expectedCombatUpdatedAt ? { expectedCombatUpdatedAt: undo.expectedCombatUpdatedAt } : {}) }
        });
        expect(restored.ok()).toBe(true);
      }
    }
  });
}
