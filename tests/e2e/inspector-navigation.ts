import { expect, type Locator, type Page } from "@playwright/test";

export async function selectInspectorPanel(page: Page, name: string | RegExp) {
  const tabs = page.getByRole("tablist", { name: "Inspector panels" });
  const more = page.getByRole("button", { name: "More inspector panels" });
  const options = { name: name === "Chat" ? /^Chat(?: \(.+\))?$/ : name, exact: true };
  const tab = tabs.getByRole("tab", options);
  await expect(tab.or(more).first()).toBeVisible();
  if (await tab.isVisible()) await tab.click();
  else {
    await more.click();
    await page.getByRole("menu", { name: "More inspector panels" }).getByRole("menuitem", options).click();
  }
  await expect(tab).toHaveAttribute("aria-selected", "true");
  return tab;
}

export async function openAbilityRollMenu(stats: Locator, ability: string, action: "check" | "saving throw") {
  const label = "Roll " + ability;
  await stats.getByRole("button", { name: label, exact: true }).click();
  return stats.getByRole("menu", { name: label, exact: true })
    .getByRole("menuitem", { name: new RegExp("^" + label + " " + action + "\\b") });
}
