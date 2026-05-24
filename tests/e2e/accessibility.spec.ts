import { expect, test, type Locator, type Page } from "@playwright/test";

const apiBaseUrl = `http://127.0.0.1:${process.env.OTTE_E2E_API_PORT ?? 4100}`;

async function tabUntilFocused(page: Page, target: Locator, attempts = 140): Promise<void> {
  for (let index = 0; index < attempts; index += 1) {
    if (await target.evaluate((element) => element === document.activeElement).catch(() => false)) return;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}

async function createSceneToken(page: Page, input: { name: string; x: number; y: number; ownerUserIds: string[]; actorId?: string }) {
  return page.evaluate(
    async ({ apiBaseUrl, input }) => {
      const bearer = localStorage.getItem("otte:sessionToken");
      if (!bearer) throw new Error("No browser session token available for token setup");
      const response = await fetch(`${apiBaseUrl}/api/v1/scenes/scn_vault_entry/tokens`, {
        method: "POST",
        headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
        body: JSON.stringify({ ...input, width: 50, height: 50, hidden: false, locked: false, disposition: "neutral" })
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json() as Promise<{ id: string; name: string }>;
    },
    { apiBaseUrl, input }
  );
}

async function deleteTokenById(page: Page, tokenId: string) {
  await page.evaluate(
    async ({ apiBaseUrl, tokenId }) => {
      const bearer = localStorage.getItem("otte:sessionToken");
      if (!bearer) throw new Error("No browser session token available for token cleanup");
      const response = await fetch(`${apiBaseUrl}/api/v1/tokens/${tokenId}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${bearer}` }
      });
      if (!response.ok && response.status !== 404) throw new Error(await response.text());
    },
    { apiBaseUrl, tokenId }
  );
}

async function openInspectorPanel(page: Page, panelName: string) {
  await page.locator(".inspector-tabs").getByRole("button", { name: panelName, exact: true }).click();
}

async function openActorDisclosure(root: Locator, summaryText: string) {
  const details = root.locator("details.actor-detail-disclosure").filter({ hasText: summaryText }).first();
  await expect(details.locator("summary")).toBeVisible();
  const isOpen = await details.evaluate((element) => (element as HTMLDetailsElement).open);
  if (!isOpen) {
    await details.evaluate((element) => {
      (element as HTMLDetailsElement).open = true;
      element.scrollIntoView({ block: "nearest" });
    });
  }
}

async function clickElement(locator: Locator) {
  await expect(locator).toBeVisible();
  await locator.evaluate((element) => (element as HTMLElement).click());
}

async function shiftTabUntilFocused(page: Page, target: Locator, attempts = 140): Promise<void> {
  for (let index = 0; index < attempts; index += 1) {
    if (await target.evaluate((element) => element === document.activeElement).catch(() => false)) return;
    await page.keyboard.press("Shift+Tab");
  }
  await expect(target).toBeFocused();
}

test("main tabletop controls expose accessible names and keyboard reachability", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();
  await page.getByRole("button", { name: "Demo GM" }).click();

  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
  await expect(page.getByRole("main", { name: "OpenTabletop workspace" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Campaigns" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add token" })).toBeVisible();
  await openInspectorPanel(page, "Chat");
  await expect(page.getByRole("textbox", { name: "Chat command line" })).toBeVisible();

  const unnamedControls = await page.evaluate(() => {
    function isVisible(element: Element): boolean {
      const htmlElement = element as HTMLElement;
      const rect = htmlElement.getBoundingClientRect();
      const style = window.getComputedStyle(htmlElement);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    }

    function labelText(element: Element): string {
      if (!(element instanceof HTMLElement)) return "";
      const id = element.id;
      const ariaLabel = element.getAttribute("aria-label") ?? "";
      const ariaLabelledBy = element.getAttribute("aria-labelledby");
      const labelledByText = ariaLabelledBy
        ?.split(/\s+/)
        .map((labelId) => document.getElementById(labelId)?.textContent?.trim() ?? "")
        .join(" ");
      const wrappingLabel = element.closest("label")?.textContent?.trim() ?? "";
      const explicitLabel = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent?.trim() ?? "" : "";
      const text = element.textContent?.trim() ?? "";
      const placeholder = element.getAttribute("placeholder") ?? "";
      return [ariaLabel, labelledByText, explicitLabel, wrappingLabel, text, placeholder].find((value) => value?.trim()) ?? "";
    }

    return Array.from(document.querySelectorAll("button, input, select, textarea, a[href]"))
      .filter((element) => !(element instanceof HTMLInputElement && element.type === "hidden"))
      .filter(isVisible)
      .filter((element) => !labelText(element))
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        type: element.getAttribute("type") ?? "",
        className: element.getAttribute("class") ?? ""
      }));
  });
  expect(unnamedControls).toEqual([]);

  const toolbar = page.locator(".toolbar");
  await expect(toolbar.getByRole("button", { name: "Select", exact: true })).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "Reveal fog" })).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "Area template" })).toBeVisible();
  await expect(toolbar.getByRole("button", { name: "Delete latest annotation" })).toBeVisible();

  const duplicateIds = await page.evaluate(() => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const element of Array.from(document.querySelectorAll("[id]"))) {
      const id = element.id.trim();
      if (!id) continue;
      if (seen.has(id)) duplicates.add(id);
      seen.add(id);
    }
    return Array.from(duplicates).sort();
  });
  expect(duplicateIds).toEqual([]);

  const lowContrastSamples = await page.evaluate(() => {
    function parseRgb(value: string): [number, number, number, number] | undefined {
      const match = value.match(/rgba?\(([^)]+)\)/);
      if (!match) return undefined;
      const parts = match[1]!.split(",").map((part) => part.trim());
      const alpha = parts[3] === undefined ? 1 : Number(parts[3]);
      return [Number(parts[0]), Number(parts[1]), Number(parts[2]), Number.isFinite(alpha) ? alpha : 1];
    }

    function channel(value: number): number {
      const normalized = value / 255;
      return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    }

    function luminance(rgb: [number, number, number]): number {
      return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
    }

    function contrast(foreground: [number, number, number], background: [number, number, number]): number {
      const lighter = Math.max(luminance(foreground), luminance(background));
      const darker = Math.min(luminance(foreground), luminance(background));
      return (lighter + 0.05) / (darker + 0.05);
    }

    function effectiveBackground(element: Element): [number, number, number] {
      let current: Element | null = element;
      while (current) {
        const parsed = parseRgb(window.getComputedStyle(current).backgroundColor);
        if (parsed && parsed[3] > 0) return [parsed[0], parsed[1], parsed[2]];
        current = current.parentElement;
      }
      return [255, 255, 255];
    }

    function isVisible(element: Element): boolean {
      const htmlElement = element as HTMLElement;
      const rect = htmlElement.getBoundingClientRect();
      const style = window.getComputedStyle(htmlElement);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    }

    return Array.from(document.querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], .status-pill, .metric-card, .nav-item, .tab"))
      .filter(isVisible)
      .filter((element) => (element.textContent ?? element.getAttribute("aria-label") ?? element.getAttribute("title") ?? "").trim().length > 0)
      .map((element) => {
        const style = window.getComputedStyle(element);
        const color = parseRgb(style.color);
        if (!color) return undefined;
        const ratio = contrast([color[0], color[1], color[2]], effectiveBackground(element));
        return {
          tag: element.tagName.toLowerCase(),
          className: element.getAttribute("class") ?? "",
          text: (element.textContent ?? element.getAttribute("aria-label") ?? element.getAttribute("title") ?? "").trim().slice(0, 80),
          ratio: Number(ratio.toFixed(2))
        };
      })
      .filter((sample): sample is { tag: string; className: string; text: string; ratio: number } => Boolean(sample))
      .filter((sample) => sample.ratio < 4.5)
      .slice(0, 10);
  });
  expect(lowContrastSamples).toEqual([]);

  const addToken = page.getByRole("button", { name: "Add token" });
  for (let attempts = 0; attempts < 80; attempts += 1) {
    if (await addToken.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press("Tab");
  }
  await expect(addToken).toBeFocused();
  await expect(addToken).toHaveCSS("outline-style", "solid");
  await expect(addToken).not.toHaveCSS("box-shadow", "none");

  const reducedMotionDurations = await addToken.evaluate((element) =>
    window.getComputedStyle(element).transitionDuration.split(",").map((duration) => duration.trim())
  );
  const longestReducedMotionMs = Math.max(
    ...reducedMotionDurations.map((duration) =>
      duration.endsWith("ms") ? Number(duration.slice(0, -2)) : Number(duration.slice(0, -1)) * 1000
    )
  );
  expect(longestReducedMotionMs).toBeLessThanOrEqual(0.01);

  const chatCommandLine = page.getByRole("textbox", { name: "Chat command line" });
  await chatCommandLine.focus();
  await expect(chatCommandLine).toBeFocused();
  await chatCommandLine.fill("/roll 1d20");
  await page.getByRole("button", { name: "Send chat command" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Rolled \d+$/ })).toBeVisible();

  const chatTab = page.getByRole("button", { name: "Chat", exact: true });
  await chatTab.focus();
  await expect(chatTab).toBeFocused();
  await chatTab.press("Enter");
  await expect(page.locator('[aria-label="Chat messages"]')).toBeVisible();
});

test("advanced panels expose labelled controls and keyboard focus states", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();

  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();

  await openInspectorPanel(page, "Chat");
  const chatCommandLine = page.getByRole("textbox", { name: "Chat command line" });
  await expect(chatCommandLine).toBeVisible();
  await chatCommandLine.focus();
  await expect(chatCommandLine).toBeFocused();
  await chatCommandLine.fill("/gm accessibility review prompt");
  await expect(chatCommandLine).toHaveValue("/gm accessibility review prompt");

  await page.getByRole("button", { name: "Prep", exact: true }).click();
  await page.getByRole("button", { name: "Content" }).click();
  const assetSearch = page.getByRole("textbox", { name: "Asset search" });
  await expect(page.locator('[aria-label="Asset quota management"]')).toContainText("Quota health");
  await assetSearch.focus();
  await expect(assetSearch).toBeFocused();
  await assetSearch.fill("vault");
  await expect(assetSearch).toHaveValue("vault");

  await page.getByRole("button", { name: "AI Studio", exact: true }).click();
  const aiPrompt = page.getByLabel("AI prompt");
  await expect(page.getByRole("region", { name: "AI proposal review queue" })).toBeVisible();
  await aiPrompt.focus();
  await expect(aiPrompt).toBeFocused();
  await aiPrompt.fill("accessibility review prompt");
  await expect(aiPrompt).toHaveValue("accessibility review prompt");

  await page.getByRole("button", { name: "Prep", exact: true }).click();
  await page.getByRole("button", { name: "SDK", exact: true }).click();
  const pluginSearch = page.getByRole("textbox", { name: "Plugin marketplace search" });
  await expect(page.getByRole("region", { name: "Plugin marketplace filters" })).toBeVisible();
  await pluginSearch.focus();
  await expect(pluginSearch).toBeFocused();
  await pluginSearch.fill("versioned");
  await expect(page.locator("article", { hasText: "Versioned Browser Plugin" })).toBeVisible();
  await expect(page.locator("article", { hasText: "Example Macro Plugin" })).toHaveCount(0);
});

test("multi-panel keyboard journey remains operable without pointer input", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();

  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();

  const chatNav = page.getByRole("button", { name: "Chat", exact: true });
  await tabUntilFocused(page, chatNav);
  await chatNav.press("Enter");
  await expect(page.locator('[aria-label="Chat messages"]')).toBeVisible();

  const chatCommandLine = page.getByRole("textbox", { name: "Chat command line" });
  await tabUntilFocused(page, chatCommandLine);
  await chatCommandLine.fill("Valen");
  await expect(chatCommandLine).toHaveValue("Valen");

  const prepWorkspace = page.getByRole("button", { name: "Prep", exact: true });
  await tabUntilFocused(page, prepWorkspace);
  await prepWorkspace.press("Enter");

  const contentNav = page.getByRole("button", { name: "Content" });
  await tabUntilFocused(page, contentNav);
  await contentNav.press("Enter");
  await expect(page.getByText("Asset Library")).toBeVisible();

  const assetSearch = page.getByRole("textbox", { name: "Asset search" });
  await tabUntilFocused(page, assetSearch);
  await assetSearch.fill("vault");
  await expect(assetSearch).toHaveValue("vault");

  const sdkNav = page.getByRole("button", { name: "SDK", exact: true });
  await shiftTabUntilFocused(page, sdkNav);
  await sdkNav.press("Enter");
  await expect(page.getByRole("region", { name: "Plugin marketplace filters" })).toBeVisible();

  const pluginSearch = page.getByRole("textbox", { name: "Plugin marketplace search" });
  await tabUntilFocused(page, pluginSearch);
  await pluginSearch.fill("versioned");
  await expect(page.locator("article", { hasText: "Versioned Browser Plugin" })).toBeVisible();
});

test("actor sheet targeting controls expose screen-reader structure", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();

  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
  await expect(page.getByRole("tablist", { name: "Actor sheet views" })).toBeVisible();

  await page.getByRole("button", { name: "Open Full Sheet" }).click();
  const fullSheet = page.getByRole("dialog", { name: "Valen Ash full character sheet" });
  await expect(fullSheet).toBeVisible();
  await expect(fullSheet).toHaveAttribute("aria-modal", "true");
  await expect(fullSheet.getByRole("region", { name: "Full sheet stats" })).toContainText("HP");
  await expect(fullSheet.getByRole("region", { name: "Full sheet loadout" })).toBeVisible();
  await expect(fullSheet.getByRole("region", { name: "Full sheet actions" })).toBeVisible();
  await expect(fullSheet.getByRole("region", { name: "Full sheet targeting" })).toContainText("Action target");
  await fullSheet.getByRole("button", { name: "Close" }).focus();
  await expect(fullSheet.getByRole("button", { name: "Close" })).toBeFocused();
  await fullSheet.getByRole("button", { name: "Close" }).press("Enter");
  await expect(fullSheet).toHaveCount(0);

  const actorPanel = page.locator(".panel-stack", { hasText: "Selected Actor" });
  await openActorDisclosure(actorPanel, "Token settings");
  const targetManager = page.getByRole("region", { name: "Canvas target manager" });
  await expect(targetManager).toBeVisible();
  await expect(targetManager.getByRole("group", { name: "Canvas target area" })).toBeVisible();
  await expect(targetManager.getByRole("status", { name: "Target area preview" })).toContainText("tokens in area");
  await expect(targetManager.getByRole("status", { name: "Latest drawing lasso preview" })).toContainText("Draw a lasso");

  const targetAreaX = targetManager.getByRole("spinbutton", { name: "Target area x" });
  await targetAreaX.focus();
  await expect(targetAreaX).toBeFocused();
  await targetAreaX.fill("10");
  await expect(targetAreaX).toHaveValue("10");

  await page.getByRole("tab", { name: "Loadout" }).focus();
  await expect(page.getByRole("tab", { name: "Loadout" })).toBeFocused();
  await page.getByRole("tab", { name: "Loadout" }).press("Enter");
  await expect(page.getByRole("region", { name: "Actor loadout sheet" })).toBeVisible();
});

test("destructive token dialog supports screen-reader and keyboard flow", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Demo GM" }).click();

  await expect(page.getByRole("heading", { name: "The Ember Vault" })).toBeVisible();
  const token = await createSceneToken(page, { name: "E2E Delete Target", actorId: "act_valen", x: 420, y: 360, ownerUserIds: ["usr_demo_player"] });
  try {
    await page.reload();
    await page.getByRole("button", { name: "Token E2E Delete Target" }).click();
    const actorPanel = page.locator(".panel-stack", { hasText: "Selected Actor" });
    await openActorDisclosure(actorPanel, "Token settings");
    await clickElement(page.getByRole("button", { name: "Delete Token" }));

    const dialog = page.getByRole("dialog", { name: "Confirm token deletion" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(`Delete ${token.name} from Vault Entry`);
    await expect(page.getByRole("button", { name: "Confirm Delete Token" })).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog.getByRole("button", { name: "Confirm Delete Token" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    await clickElement(page.getByRole("button", { name: "Delete Token" }));
    await expect(page.getByRole("dialog", { name: "Confirm token deletion" })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Token deleted")).toBeVisible();
  } finally {
    await deleteTokenById(page, token.id).catch(() => undefined);
  }
});
