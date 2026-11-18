import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { test } from "./active-scene-fixture.js";
import { selectInspectorPanel } from "./inspector-navigation.js";

const api = `http://127.0.0.1:${process.env.OTTE_E2E_API_PORT ?? 4100}/api/v1`;
const gmHeaders = { "x-user-id": "usr_demo_gm" };
const createdActors: string[] = [];

test.afterEach(async ({ request }) => {
  for (const id of createdActors.splice(0)) {
    const url = `${api}/actors/${id}`;
    const { updatedAt } = await (await request.get(url, { headers: gmHeaders })).json();
    const removed = await request.delete(url, { params: { expectedUpdatedAt: updatedAt }, headers: { ...gmHeaders, "idempotency-key": randomUUID() } });
    expect(removed.ok(), await removed.text()).toBe(true);
  }
});

async function signIn(page: Page, account: "player" | "gm") {
  await page.goto("/");
  const response = await page.request.post(`${api}/auth/login`, { data: { email: `${account}@example.test` } });
  expect(response.ok()).toBe(true);
  const { user } = await response.json();
  await page.evaluate((id) => {
    localStorage.setItem("otte:userId", id);
    localStorage.setItem("otte:sessionTransport", "cookie");
  }, user.id);
  await page.reload();
  await expect(page.getByRole("group", { name: "Personal action hotbar" })).toBeVisible();
}

async function signOut(page: Page) {
  const account = page.getByRole("button", { name: "Account", exact: true });
  const panel = page.getByRole("region", { name: "Manage workspace panel" });
  if (await account.isVisible()) await account.click();
  else await page.getByRole("button", { name: "Manage", exact: true }).click();
  await panel.locator(".manage-category-button", { hasText: "Account" }).click();
  await panel.getByRole("button", { name: "Logout", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();
}

test("a player's numbered slots use sheet and chat rolls and expire when actor control is lost", async ({ page, request, activeTestScene }) => {
  test.setTimeout(100_000);
  const created = await request.post(`${api}/campaigns/camp_demo/systems/dnd-5e-srd/characters`, {
    headers: { ...gmHeaders, "idempotency-key": randomUUID() },
    data: { templateId: "fighter", name: "Hotbar fighter", ownerUserId: "usr_demo_player" }
  });
  expect(created.ok(), await created.text()).toBe(true);
  const { actor } = await created.json();
  createdActors.push(actor.id);
  const monster = await request.post(`${api}/campaigns/camp_demo/systems/dnd-5e-srd/monsters`, {
    headers: { ...gmHeaders, "idempotency-key": randomUUID() },
    data: { threatId: "giant-spider", name: "Hotbar target", ownerUserId: "usr_demo_gm" }
  });
  expect(monster.ok(), await monster.text()).toBe(true);
  const { actor: enemy } = await monster.json();
  createdActors.push(enemy.id);
  const placed = await request.post(`${api}/scenes/${activeTestScene.id}/tokens`, {
    headers: { ...gmHeaders, "idempotency-key": randomUUID() },
    data: { name: enemy.name, actorId: enemy.id, expectedUpdatedAt: activeTestScene.updatedAt, x: 360, y: 350, width: 50, height: 50, disposition: "hostile", hidden: false, locked: false }
  });
  expect(placed.ok(), await placed.text()).toBe(true);
  const enemyToken = await placed.json();
  await signIn(page, "player");
  const bar = page.getByRole("group", { name: "Personal action hotbar" });
  const editor = page.getByRole("dialog", { name: "Edit hotbar" });
  for (const [slot, label] of [[1, "Longsword Attack"], [2, "Perception Check"]] as const) {
    await bar.getByRole("button", { name: `Slot ${slot}: Assign` }).click();
    await editor.getByRole("combobox", { name: "Actor", exact: true }).selectOption(actor.id);
    await editor.getByRole("combobox", { name: "Action", exact: true }).selectOption({ label });
    await editor.getByRole("button", { name: `Pin to slot ${slot}` }).click();
  }
  await bar.getByRole("button", { name: "Slot 3: Assign" }).click();
  await editor.getByRole("combobox", { name: "Shortcut type" }).selectOption("formula");
  await editor.getByRole("combobox", { name: "Dice formula", exact: true }).fill("2d4+7");
  await editor.getByRole("button", { name: "Pin to slot 3" }).click();
  await bar.getByRole("button", { name: "Slot 4: Assign" }).click();
  await editor.getByRole("combobox", { name: "Shortcut type" }).selectOption("macro");
  await editor.getByRole("combobox", { name: "Campaign dice macro", exact: true }).selectOption("mac_demo_attack");
  await editor.getByRole("button", { name: "Pin to slot 4" }).click();

  const rollUrl = `/actors/${actor.id}/roll`;
  await page.locator(`[data-token-id="${enemyToken.id}"]`).first().click();
  const weapon = bar.getByRole("button", { name: /Slot 1: Longsword Attack/ });
  for (const use of [() => weapon.click(), () => page.keyboard.press("1")]) {
    const attack = page.waitForResponse((r) => r.url().endsWith(rollUrl) && r.request().postDataJSON()?.prepare === true);
    await use();
    const attackPreview = await attack;
    expect(attackPreview.ok(), await attackPreview.text()).toBe(true);
    expect(attackPreview.request().postDataJSON()).toMatchObject({ rollId: expect.stringMatching(/attack$/), targetActorId: enemy.id, consumeResources: true });
    const cancel = page.getByRole("dialog").getByRole("button", { name: /cancel/i });
    await expect(weapon.and(page.locator(":enabled")).or(cancel).first()).toBeVisible();
    if (await cancel.isVisible()) await cancel.click();
    await expect(weapon).toBeEnabled();
  }
  await expect(bar.getByRole("button", { name: /Slot 2: Perception Check/ })).toBeEnabled();
  const skill = page.waitForResponse((r) => r.url().endsWith(rollUrl) && r.request().postDataJSON()?.rollId === "skill-perception" && r.request().postDataJSON()?.commit !== false);
  await page.keyboard.press("2");
  expect((await skill).ok()).toBe(true);

  const formulas: string[] = [];
  page.on("request", (r) => { if (r.url().endsWith("/dice/roll") && r.method() === "POST") formulas.push(r.postDataJSON().formula); });
  await selectInspectorPanel(page, "Chat");
  const chat = page.getByRole("textbox", { name: "Chat message" });
  await chat.focus();
  await page.keyboard.type("333");
  await expect(chat).toHaveValue("333");
  const custom = bar.getByRole("button", { name: "Slot 3: 2d4+7" });
  for (const use of [() => custom.click(), () => page.keyboard.press("3"), () => page.keyboard.press("4")]) {
    await expect(custom).toBeEnabled();
    const rolled = page.waitForResponse((r) => r.url().endsWith("/dice/roll") && r.request().method() === "POST");
    await use();
    expect((await rolled).ok()).toBe(true);
  }
  expect(formulas).toEqual(["2d4+7", "2d4+7", "1d20+5"]);
  await signOut(page);
  await signIn(page, "gm");
  await expect(bar.getByRole("button", { name: /Slot [1-6]: Assign/ })).toHaveCount(6);
  await signOut(page);
  await signIn(page, "player");
  await expect(custom).toBeEnabled();
  await expect(bar.getByRole("button", { name: /Slot 2: Perception Check/ })).toBeEnabled();

  const actorUrl = `${api}/actors/${actor.id}`;
  const fresh = await (await request.get(actorUrl, { headers: gmHeaders })).json();
  const changed = await request.patch(actorUrl, { headers: { ...gmHeaders, "idempotency-key": randomUUID() }, data: { expectedUpdatedAt: fresh.updatedAt, ownerUserId: "usr_demo_gm" } });
  expect(changed.ok(), await changed.text()).toBe(true);
  await expect(bar.getByRole("button", { name: "Slot 1: Unavailable" })).toBeDisabled();
  await expect(bar.getByRole("button", { name: "Slot 2: Unavailable" })).toBeDisabled();
});
