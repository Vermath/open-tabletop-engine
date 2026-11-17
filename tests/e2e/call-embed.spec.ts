import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * Voice and video are an optional embed of a provider the operator
 * configures. These tests pin the two promises that matter: with the feature
 * off (the default, and how this suite's server runs) the page talks to
 * nothing but this deployment; with it on, nothing from the provider loads
 * until the person chooses to join.
 */
const apiBaseUrl = `http://127.0.0.1:${process.env.OTTE_E2E_API_PORT ?? 4100}`;
const webBaseUrl = `http://127.0.0.1:${process.env.OTTE_E2E_WEB_PORT ?? 5174}`;
const providerOrigin = "https://meet.otte-e2e.test";
const roomUrl = `${providerOrigin}/otte-0123456789abcdef0123456789abcdef`;
const callPath = /\/api\/v1\/campaigns\/[^/]+\/call$/;

async function login(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM", exact: true }).click();
  await expect(page.getByLabel("Current campaign", { exact: true })).toHaveText("The Ember Vault");
}

/** Answers the room lookup as a server with a configured provider would, and serves a stand-in provider page. */
async function configureProvider(page: Page, answer: unknown = { enabled: true, provider: "Test Meet", origin: providerOrigin, url: roomUrl }) {
  const providerRequests: string[] = [];
  await page.context().route(callPath, (route: Route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(answer) }));
  await page.context().route(`${providerOrigin}/**`, (route: Route) => {
    providerRequests.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>Stand-in call</title><h1>Stand-in call room</h1>" });
  });
  return providerRequests;
}

test("with no provider configured there is no call control and no third-party request", async ({ page }) => {
  const requested: string[] = [];
  page.on("request", (request) => requested.push(request.url()));
  const lookup = page.waitForResponse((response) => callPath.test(new URL(response.url()).pathname));
  await login(page);
  const answer = await lookup;
  expect(answer.status()).toBe(200);
  expect(await answer.json()).toEqual({ enabled: false });

  await expect(page.getByRole("button", { name: "Soundboard", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /call/i })).toHaveCount(0);
  await expect(page.locator(".call-panel, iframe")).toHaveCount(0);

  // Use the table for a moment, then check where every request went.
  await page.getByRole("button", { name: "Live Table", exact: true }).click();
  await expect(page.getByRole("group", { name: /interactive battle map/ })).toBeVisible();
  await page.waitForTimeout(500);
  const origins = new Set(requested.filter((url) => /^(?:https?|wss?):/.test(url)).map((url) => new URL(url).origin.replace(/^ws/, "http")));
  expect([...origins].sort()).toEqual([apiBaseUrl, webBaseUrl].sort());
});

test("a configured provider loads only after the person joins, in a restricted frame, and unloads on leaving", async ({ page }) => {
  const providerRequests = await configureProvider(page);
  await login(page);

  const launcher = page.locator(".call-launcher");
  await expect(launcher).toBeVisible();
  await expect(launcher).toHaveAccessibleName("Join call");
  await expect(launcher).toHaveAttribute("title", "Join call (Test Meet)");
  await expect(page.locator("iframe")).toHaveCount(0);
  expect(providerRequests).toEqual([]);

  // First press: a notice that names the provider and its host. Still nothing loaded.
  await launcher.click();
  const panel = page.getByRole("complementary", { name: "Test Meet call", exact: true });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Test Meet is a separate service at meet.otte-e2e.test");
  await expect(panel).toContainText("this server does not carry or record them");
  await expect(page.locator("iframe")).toHaveCount(0);
  expect(providerRequests).toEqual([]);

  // Declining closes the panel and loads nothing.
  await panel.getByRole("button", { name: "Not now", exact: true }).click();
  await expect(panel).toHaveCount(0);
  expect(providerRequests).toEqual([]);

  // Joining loads exactly the room the server named.
  await launcher.click();
  await panel.getByRole("button", { name: "Join call", exact: true }).click();
  const frame = panel.locator("iframe");
  await expect(frame).toHaveAttribute("src", roomUrl);
  await expect(frame).toHaveAttribute("title", "Test Meet call");
  await expect(frame).toHaveAttribute("allow", "camera; microphone; display-capture; fullscreen; autoplay");
  await expect(frame).toHaveAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox");
  await expect(frame).toHaveAttribute("referrerpolicy", "no-referrer");
  await expect(panel.frameLocator("iframe").getByRole("heading", { name: "Stand-in call room" })).toBeVisible();
  expect(providerRequests).toEqual([roomUrl]);
  await expect(launcher).toHaveAccessibleName("Leave call");
  await expect(launcher).toHaveAttribute("aria-pressed", "true");

  // The table stays usable behind the panel, and the panel can be moved out of the way.
  const header = panel.locator(".call-panel-header");
  const before = (await panel.boundingBox())!;
  await header.hover({ position: { x: 60, y: 12 } });
  await page.mouse.down();
  await page.mouse.move(before.x - 200, before.y + 160, { steps: 6 });
  await page.mouse.up();
  const after = (await panel.boundingBox())!;
  expect(after.x).toBeLessThan(before.x - 100);
  expect(after.y).toBeGreaterThan(before.y + 80);
  await expect(frame).toHaveAttribute("src", roomUrl);
  expect(providerRequests).toEqual([roomUrl]);

  // Leaving removes the frame, which ends the call.
  await panel.getByRole("button", { name: "Leave call", exact: true }).click();
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(panel).toHaveCount(0);
  await expect(launcher).toHaveAccessibleName("Join call");
  await expect(launcher).toHaveAttribute("aria-pressed", "false");

  // Having agreed once in this browser, joining again goes straight to the room, and a reload does not rejoin by itself.
  await page.reload();
  await expect(launcher).toBeVisible();
  await expect(page.locator("iframe")).toHaveCount(0);
  expect(providerRequests).toEqual([roomUrl]);
  await launcher.click();
  await expect(panel.locator("iframe")).toHaveAttribute("src", roomUrl);
  expect(providerRequests).toEqual([roomUrl, roomUrl]);
});

test("the client refuses a room that is not on the origin the server named", async ({ page }) => {
  await login(page);
  for (const answer of [
    { enabled: true, provider: "Test Meet", origin: providerOrigin, url: "https://elsewhere.otte-e2e.test/room" },
    { enabled: true, provider: "Test Meet", origin: "http://meet.otte-e2e.test", url: "http://meet.otte-e2e.test/room" },
    { enabled: true, provider: "Test Meet", origin: "null", url: "javascript:alert(1)" },
  ]) {
    await page.context().unrouteAll();
    const providerRequests = await configureProvider(page, answer);
    const lookup = page.waitForResponse((response) => callPath.test(new URL(response.url()).pathname));
    await page.reload();
    await lookup;
    await expect(page.getByLabel("Current campaign", { exact: true })).toHaveText("The Ember Vault");
    await page.waitForTimeout(300);
    await expect(page.getByRole("button", { name: /call/i })).toHaveCount(0);
    await expect(page.locator("iframe")).toHaveCount(0);
    expect(providerRequests).toEqual([]);
  }
});
