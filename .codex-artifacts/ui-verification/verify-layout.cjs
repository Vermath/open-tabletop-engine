const fs = require("node:fs/promises");
const path = require("node:path");

async function loadPlaywright() {
  try {
    return require("@playwright/test");
  } catch {
    return require("playwright");
  }
}

async function main() {
  const { chromium } = await loadPlaywright();
  const outDir = path.resolve(__dirname);
  await fs.mkdir(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const sizes = [
    { name: "1280x800", width: 1280, height: 800 },
    { name: "1000x800", width: 1000, height: 800 },
    { name: "760x800", width: 760, height: 800 },
    { name: "390x844", width: 390, height: 844 }
  ];

  const results = [];
  for (const size of sizes) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto("http://127.0.0.1:5174/", { waitUntil: "networkidle" });
    const demo = page.getByRole("button", { name: "Demo GM" });
    if (await demo.isVisible().catch(() => false)) {
      await demo.click();
    }
    await page.getByRole("heading", { name: /The Ember Vault/ }).waitFor({ timeout: 10000 });

    const modeChecks = [];
    for (const mode of ["Live Table", "Prep", "AI Studio", "Manage"]) {
      await page.getByRole("button", { name: mode, exact: true }).click();
      await page.waitForTimeout(250);
      const metric = await page.evaluate(() => {
        const doc = document.documentElement;
        const body = document.body;
        const shell = document.querySelector(".app-shell")?.getBoundingClientRect();
        const workspace = document.querySelector(".workspace")?.getBoundingClientRect();
        const sceneBoard = document.querySelector(".scene-board")?.getBoundingClientRect();
        const consoleDock = document.querySelector(".console-dock, .console-panel, .table-console")?.getBoundingClientRect();
        return {
          clientWidth: doc.clientWidth,
          scrollWidth: doc.scrollWidth,
          clientHeight: doc.clientHeight,
          scrollHeight: doc.scrollHeight,
          bodyScrollWidth: body.scrollWidth,
          shellHeight: shell?.height ?? null,
          workspaceHeight: workspace?.height ?? null,
          sceneBoardHeight: sceneBoard?.height ?? null,
          consoleHeight: consoleDock?.height ?? null
        };
      });
      modeChecks.push({
        mode,
        ...metric,
        horizontalOverflow: metric.scrollWidth > metric.clientWidth + 1 || metric.bodyScrollWidth > metric.clientWidth + 1
      });

      if (mode === "AI Studio") {
        await page.getByRole("navigation", { name: "AI workspace views" }).waitFor({ timeout: 5000 });
        await page.getByRole("region", { name: "AI generation targets" }).waitFor({ timeout: 5000 });
        await page.screenshot({ path: path.join(outDir, `ai-studio-${size.name}.png`), fullPage: false });
      } else if (mode === "Live Table") {
        await page.locator(".map-layer-stack").waitFor({ timeout: 5000 });
        await page.screenshot({ path: path.join(outDir, `live-table-${size.name}.png`), fullPage: false });
      } else if (mode === "Prep") {
        await page.screenshot({ path: path.join(outDir, `prep-${size.name}.png`), fullPage: false });
      }
    }
    results.push({ viewport: size.name, modeChecks });
  }

  await browser.close();
  await fs.writeFile(path.join(outDir, "layout-results.json"), `${JSON.stringify(results, null, 2)}\n`);

  const overflow = results.flatMap((result) => result.modeChecks.filter((check) => check.horizontalOverflow).map((check) => `${result.viewport} ${check.mode}`));
  if (overflow.length > 0) {
    throw new Error(`Horizontal overflow detected: ${overflow.join(", ")}`);
  }
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
