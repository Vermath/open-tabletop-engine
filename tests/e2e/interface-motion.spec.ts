import { expect, test } from "@playwright/test";

test.use({ video: process.env.OTTE_RECORD_MOTION === "1" ? "on" : "off" });

test("an outgoing tab and floating panel fade without retaining interactive controls", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM", exact: true }).click();
  const tabs = page.getByRole("tablist", { name: "Inspector panels" });
  await expect(tabs.getByRole("tab", { name: "Actors", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.evaluate(() => {
    const exits: Array<{ label: string; inert: boolean }> = [];
    Object.defineProperty(window, "verifiedInterfaceExits", { get: () => exits });
    document.addEventListener("animationstart", (event) => {
      if (!(event instanceof AnimationEvent) || event.animationName !== "interface-exit" || !(event.target instanceof HTMLElement)) return;
      exits.push({ label: event.target.getAttribute("aria-label") ?? event.target.className, inert: event.target.inert });
    });
  });
  await tabs.getByRole("tab", { name: "Chat", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Chat message" })).toBeVisible();
  await expect(page.getByRole("tabpanel")).toHaveCount(1);

  await page.getByRole("button", { name: "Soundboard", exact: true }).click();
  await page.getByRole("button", { name: "Close soundboard", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Soundboard", exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => Reflect.get(window, "verifiedInterfaceExits"))).toEqual(expect.arrayContaining([
    { label: "inspector-panel-content", inert: true },
    { label: "Soundboard", inert: true },
  ]));
});
