import { selectInspectorPanel } from "./inspector-navigation.js";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const apiBaseUrl = `http://127.0.0.1:${process.env.OTTE_E2E_API_PORT ?? 4100}`;

async function openInspectorPanel(page: Page, panelName: string) {
  const showInspector = page.getByRole("button", { name: "Show inspector", exact: true });
  if (await showInspector.isVisible()) await showInspector.click();
  await selectInspectorPanel(page, panelName);
}

async function loginSeededDemo(page: Page, email = "gm@example.test") {
  await page.goto("/");
  await page.evaluate(async ({ apiBaseUrl, email }) => {
    const response = await fetch(`${apiBaseUrl}/api/v1/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email })
    });
    if (!response.ok) throw new Error(await response.text());
    const login = (await response.json()) as { user: { id: string } };
    localStorage.setItem("otte:userId", login.user.id);
    localStorage.setItem("otte:sessionTransport", "cookie");
  }, { apiBaseUrl, email });
  await page.goto("/");
}

function isProfilePreferenceUpdate(response: { request(): { method(): string }; url(): string }) {
  return response.request().method() === "PATCH" && new URL(response.url()).pathname === "/api/v1/auth/profile";
}

async function ensure3dDiceEnabled(page: Page) {
  const textOnlyToggle = page.getByRole("button", { name: "Use text-only dice" });
  if (await textOnlyToggle.isVisible()) return textOnlyToggle;

  const enable3dToggle = page.getByRole("button", { name: "Enable 3D dice" });
  await expect(enable3dToggle).toBeVisible();
  const profileUpdate = page.waitForResponse(isProfilePreferenceUpdate);
  await enable3dToggle.click();
  expect((await profileUpdate).ok()).toBe(true);
  await expect(textOnlyToggle).toHaveAttribute("aria-pressed", "true");
  return textOnlyToggle;
}

test("demo GM can turn 3D dice off for text-only rolling", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("otte:dice3d", "on");
  });
  await loginSeededDemo(page);
  await expect(page.getByLabel("Current campaign", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Current campaign", { exact: true })).toHaveText("The Ember Vault");

  await openInspectorPanel(page, "Chat");
  const textOnlyToggle = await ensure3dDiceEnabled(page);
  await expect(textOnlyToggle).toHaveAttribute("aria-pressed", "true");
  const profileUpdate = page.waitForResponse(isProfilePreferenceUpdate);
  await textOnlyToggle.click();
  expect((await profileUpdate).ok()).toBe(true);

  const enable3dToggle = page.getByRole("button", { name: "Enable 3D dice" });
  await expect(enable3dToggle).toHaveAttribute("aria-pressed", "false");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("otte:dice3d"))).toBe("off");

  await page.getByRole("textbox", { name: "Dice formula" }).fill("1d4");
  await page.getByRole("button", { name: "Roll dice" }).click();
  await expect(page.locator(".rail > .status")).toContainText(/Rolled \d+/);
  await expect(page.locator(".dice-cast-overlay")).toHaveCount(0);
});

test("3D dice preloads the physics stage when enabled", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("otte:dice3d", "on");
  });
  await loginSeededDemo(page);
  await expect(page.getByLabel("Current campaign", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Current campaign", { exact: true })).toHaveText("The Ember Vault");

  await openInspectorPanel(page, "Chat");
  await expect(await ensure3dDiceEnabled(page)).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.locator("#dice-box-stage canvas").count(), { timeout: 6_000 }).toBeGreaterThan(0);
});

test("the layered dice cast reveals one result without progress or fallback toasts", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("otte:dice3d", "on");
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, contextId: string, ...args: unknown[]) {
      if (contextId.includes("webgl")) return null;
      return Reflect.apply(getContext, this, [contextId, ...args]);
    } as typeof getContext;
  });
  await loginSeededDemo(page);
  await expect(page.getByLabel("Current campaign", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Current campaign", { exact: true })).toHaveText("The Ember Vault");

  await openInspectorPanel(page, "Chat");
  await expect(await ensure3dDiceEnabled(page)).toHaveAttribute("aria-pressed", "true");

  const initialRollCards = await page.locator(".chat-roll-card").count();
  await page.getByRole("textbox", { name: "Dice formula" }).fill("1d4");
  await page.getByRole("button", { name: "Roll dice" }).click();

  const rollCard = page.locator(".chat-roll-card").nth(initialRollCards);
  await expect(rollCard).toBeVisible();
  await expect(rollCard.locator(".chat-roll-total")).toHaveText("...");
  await expect(rollCard.locator(".chat-roll-dice")).toHaveCount(0);
  await expect(page.locator(".rail > .status")).toContainText("Rolling dice");
  const diceToasts = page.locator(".toast").filter({ hasText: /Rolling dice|3D dice engine unavailable|Rolled/ });
  await expect(diceToasts).toHaveCount(0);

  await expect(rollCard.locator(".chat-roll-total")).toHaveText(/[1-4]/, { timeout: 4_000 });
  await expect(page.locator(".dice-cast-label")).toHaveCount(1);
  await expect(diceToasts).toHaveCount(0);
  await expect(rollCard.locator(".chat-roll-dice")).toHaveCount(0);
  await rollCard.locator(".chat-roll-summary").click();
  await expect(rollCard.locator(".chat-roll-dice")).toHaveCount(1);
  await expect(page.locator(".rail > .status")).toContainText(/Rolled [1-4]/);
});

async function rollFromPage(page: Page, formula: string, visibility: "public" | "gm_only" | "whisper") {
  await page.evaluate(async ({ apiBaseUrl, formula, visibility }) => {
    const response = await fetch(`${apiBaseUrl}/api/v1/dice/roll`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify({ campaignId: "camp_demo", formula, visibility })
    });
    if (!response.ok) throw new Error(await response.text());
  }, { apiBaseUrl, formula, visibility });
}

test("leaving a campaign during a cast releases its concealed chat result", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("otte:dice3d", "on"));
  let unblockDiceAssets!: () => void;
  const diceAssetsPaused = new Promise<void>((resolve) => { unblockDiceAssets = resolve; });
  await page.route("**/assets/dice-box/**", async (route) => {
    await diceAssetsPaused;
    await route.continue();
  });
  try {
    await loginSeededDemo(page);
    const campaignName = "Dice switch " + Date.now().toString(36);
    await page.evaluate(async ({ apiBaseUrl, campaignName }) => {
      const response = await fetch(`${apiBaseUrl}/api/v1/campaigns`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ name: campaignName })
      });
      if (!response.ok) throw new Error(await response.text());
    }, { apiBaseUrl, campaignName });
    await page.reload();
    await openInspectorPanel(page, "Chat");
    await ensure3dDiceEnabled(page);
    await page.getByRole("textbox", { name: "Dice formula" }).fill("1d4+61");
    await page.getByRole("button", { name: "Roll dice" }).click();
    const rollTotal = page.locator(".chat-roll-card").filter({ hasText: "1d4+61" }).locator(".chat-roll-total");
    await expect(rollTotal).toHaveText("...");

    async function switchCampaign(name: string) {
      const switcher = page.locator("details.campaign-switcher");
      if (!(await switcher.evaluate((element) => (element as HTMLDetailsElement).open))) {
        await switcher.locator("summary").click();
      }
      await page.getByRole("navigation", { name: "Campaigns" }).getByRole("button", { name, exact: true }).click();
      await expect(page.getByLabel("Current campaign", { exact: true })).toHaveText(name);
    }
    await switchCampaign(campaignName);
    await switchCampaign("The Ember Vault");
    await openInspectorPanel(page, "Chat");
    await expect(rollTotal).toHaveText(/6[2-5]/);
    await expect(page.locator(".dice-cast-label")).toHaveCount(0);
  } finally {
    unblockDiceAssets();
  }
});

test("the dice stage bounds callouts to the board and only displays rolls visible to its viewer", async ({ page, browser, baseURL }) => {
  if (!baseURL) throw new Error("The dice test needs a web base URL.");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const playerContext = await browser.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } });
  await playerContext.addInitScript(() => {
    Object.defineProperty(navigator, "connection", { value: { saveData: true } });
  });
  try {
    const player = await playerContext.newPage();
    await Promise.all([loginSeededDemo(page), loginSeededDemo(player, "player@example.test")]);
    await Promise.all([page, player].map(async (viewer) => {
      await expect(viewer.locator(".scene-viewport")).toBeVisible();
      await openInspectorPanel(viewer, "Chat");
      await ensure3dDiceEnabled(viewer);
    }));

    function callout(viewer: Page, formula: string) {
      return viewer.locator(".dice-cast-static .dice-cast-label").filter({ hasText: formula });
    }

    await rollFromPage(page, "1d6+31", "public");
    await expect(callout(page, "1d6+31")).toBeVisible();
    await expect(callout(player, "1d6+31")).toBeVisible();
    expect(await page.locator(".dice-table-stage").boundingBox()).toEqual(await page.locator(".scene-viewport").boundingBox());
    await expect(page.locator(".dice-table-stage canvas")).toHaveCount(0);
    await expect(player.locator(".dice-table-stage canvas")).toHaveCount(0);

    await rollFromPage(page, "1d6+32", "gm_only");
    await expect(callout(page, "1d6+32")).toBeVisible();
    await rollFromPage(page, "1d6+33", "whisper");
    await expect(callout(page, "1d6+33")).toBeVisible();
    await rollFromPage(page, "1d6+34", "public");
    await expect(callout(player, "1d6+34")).toBeVisible();
    await expect(player.locator(".dice-cast-label").filter({ hasText: /1d6\+3[23]/ })).toHaveCount(0);

    const stage = page.locator(".dice-table-stage");
    await page.getByRole("button", { name: "Manage", exact: true }).click();
    await expect.poll(() => stage.boundingBox()).toEqual(await page.locator(".workspace").boundingBox());
    await page.getByRole("button", { name: "Live Table", exact: true }).click();
    await expect(page.locator(".scene-viewport")).toBeVisible();
    await expect.poll(() => stage.boundingBox()).toEqual(await page.locator(".scene-viewport").boundingBox());
  } finally {
    await playerContext.close();
  }
});

test("mute works before profile persistence and text-only dice still play a cue", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const OriginalAudioContext = window.AudioContext;
    let contexts = 0;
    let notes = 0;
    Object.defineProperty(window, "interfaceAudioContexts", { get: () => contexts });
    Object.defineProperty(window, "interfaceAudioNotes", { get: () => notes });
    window.AudioContext = class extends OriginalAudioContext {
      constructor(options?: AudioContextOptions) {
        super(options);
        contexts += 1;
      }
      override createOscillator() {
        notes += 1;
        return super.createOscillator();
      }
    };
  });
  await loginSeededDemo(page);
  await openInspectorPanel(page, "Chat");
  await ensure3dDiceEnabled(page);
  const mute = page.getByRole("button", { name: "Mute interface sounds", exact: true });
  const unmute = page.getByRole("button", { name: "Unmute interface sounds", exact: true });
  const countContexts = () => page.evaluate(() => Reflect.get(window, "interfaceAudioContexts") as number);
  if (await unmute.isVisible()) {
    const update = page.waitForResponse(isProfilePreferenceUpdate);
    await unmute.click();
    expect((await update).ok()).toBe(true);
  }
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/v1/auth/profile", async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    await pending;
    await route.fulfill({ status: 503, json: { error: "Preference storage unavailable" } });
  });
  try {
    const failed = page.waitForResponse(isProfilePreferenceUpdate);
    await mute.click();
    await expect(unmute).toBeVisible();
    await rollFromPage(page, "1d6+81", "public");
    await expect(page.locator(".dice-cast-label").filter({ hasText: "1d6+81" })).toBeVisible();
    expect(await countContexts()).toBe(0);
    release();
    expect((await failed).status()).toBe(503);
    await expect(unmute).toBeVisible();
    await rollFromPage(page, "1d6+82", "public");
    await expect(page.locator(".dice-cast-label").filter({ hasText: "1d6+82" })).toBeVisible();
    expect(await countContexts()).toBe(0);
  } finally {
    release();
    await page.unroute("**/api/v1/auth/profile");
  }

  const update = page.waitForResponse(isProfilePreferenceUpdate);
  await unmute.click();
  expect((await update).ok()).toBe(true);
  await expect(mute).toBeVisible();
  const switched = page.waitForResponse(isProfilePreferenceUpdate);
  await page.getByRole("button", { name: "Use text-only dice" }).click();
  expect((await switched).ok()).toBe(true);
  await rollFromPage(page, "1d6+83", "public");
  await expect.poll(countContexts).toBe(1);
  expect(await page.evaluate(() => Reflect.get(window, "interfaceAudioNotes"))).toBe(3);
  await expect(page.locator(".dice-cast-label").filter({ hasText: "1d6+83" })).toHaveCount(0);
});

test("a saved profile replaces an unsaved rail sound override", async ({ page }) => {
  await loginSeededDemo(page);
  const mute = page.getByRole("button", { name: "Mute interface sounds", exact: true });
  const unmute = page.getByRole("button", { name: "Unmute interface sounds", exact: true });
  await expect(mute.or(unmute)).toBeVisible();
  const originallyEnabled = await mute.isVisible();
  if (originallyEnabled) {
    const update = page.waitForResponse(isProfilePreferenceUpdate);
    await mute.click();
    expect((await update).ok()).toBe(true);
  }
  await expect(unmute).toBeVisible();
  await page.route("**/api/v1/auth/profile", async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    await route.fulfill({ status: 503, json: { error: "Preference storage unavailable" } });
  });
  try {
    const failed = page.waitForResponse(isProfilePreferenceUpdate);
    await unmute.click();
    expect((await failed).status()).toBe(503);
    await expect(mute).toBeVisible();
  } finally {
    await page.unroute("**/api/v1/auth/profile");
  }
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  const manage = page.getByRole("region", { name: "Manage workspace panel" });
  await manage.locator(".manage-category-button", { hasText: "Account" }).click();
  await expect(manage.getByRole("checkbox", { name: "Play interface sounds" })).not.toBeChecked();
  const saved = page.waitForResponse(isProfilePreferenceUpdate);
  await manage.getByRole("button", { name: "Save profile & preferences" }).click();
  expect((await saved).ok()).toBe(true);
  await manage.getByRole("button", { name: "Close", exact: true }).click();
  await expect(unmute).toBeVisible();
  if (originallyEnabled) {
    const restored = page.waitForResponse(isProfilePreferenceUpdate);
    await unmute.click();
    expect((await restored).ok()).toBe(true);
  }
});

test("overlapping sound toggles keep the last choice and save it on the latest revision", async ({ page }) => {
  await loginSeededDemo(page);
  const mute = page.getByRole("button", { name: "Mute interface sounds", exact: true });
  const unmute = page.getByRole("button", { name: "Unmute interface sounds", exact: true });
  await expect(mute.or(unmute)).toBeVisible();
  const originallyEnabled = await mute.isVisible();
  if (originallyEnabled) {
    const update = page.waitForResponse(isProfilePreferenceUpdate);
    await mute.click();
    expect((await update).ok()).toBe(true);
  }
  await expect(unmute).toBeVisible();

  let releaseUnmute!: () => void;
  let releaseMute!: () => void;
  const pendingUnmute = new Promise<void>((resolve) => { releaseUnmute = resolve; });
  const pendingMute = new Promise<void>((resolve) => { releaseMute = resolve; });
  const patches: { enabled: boolean; revision: string }[] = [];
  await page.route("**/api/v1/auth/profile", async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    const body = route.request().postDataJSON() as { expectedUpdatedAt: string; preferences: { interfaceSounds: { enabled: boolean } } };
    const enabled = body.preferences.interfaceSounds.enabled;
    patches.push({ enabled, revision: body.expectedUpdatedAt });
    await (enabled ? pendingUnmute : pendingMute);
    await route.continue();
  });
  try {
    const first = page.waitForResponse(isProfilePreferenceUpdate);
    await unmute.click();
    await expect.poll(() => patches.map(({ enabled }) => enabled)).toEqual([true]);
    await mute.click();
    await expect(unmute).toBeVisible();
    releaseUnmute();
    expect((await first).ok()).toBe(true);
    await expect.poll(() => patches.map(({ enabled }) => enabled)).toEqual([true, false]);
    expect(patches[1]!.revision).not.toBe(patches[0]!.revision);
    await expect(unmute).toBeVisible();
    const second = page.waitForResponse(isProfilePreferenceUpdate);
    releaseMute();
    expect((await second).ok()).toBe(true);
  } finally {
    releaseUnmute();
    releaseMute();
    await page.unroute("**/api/v1/auth/profile");
  }

  await page.reload();
  await expect(unmute).toBeVisible();
  if (originallyEnabled) {
    const restore = page.waitForResponse(isProfilePreferenceUpdate);
    await unmute.click();
    expect((await restore).ok()).toBe(true);
  }
});
