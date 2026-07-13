import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { desktopDataPaths, desktopRendererUrlAllowed, desktopRuntimeEnv, joinDesktopPath, shutdownDesktopResources } from "./desktop-runtime.js";

describe("desktop runtime configuration", () => {
  it("does not let an old stop completion clear a newer internet share", () => {
    const mainSource = readFileSync(resolve(__dirname, "main.ts"), "utf8").replace(/\r\n/g, "\n");
    const stopHandler = mainSource.slice(mainSource.indexOf('ipcMain.handle("desktop:stopInternetShare"'), mainSource.indexOf('ipcMain.handle("desktop:copyInviteLink"'));
    expect(stopHandler).toContain("const session = shareSession;");
    expect(stopHandler).toContain("const starting = shareStartPromise;");
    expect(stopHandler).toContain("if (shareSession === session) shareSession = undefined;");
    expect(stopHandler).toContain("if (shareStartPromise === starting) shareStartPromise = undefined;");
  });

  it("keeps persistent data under the app userData directory", () => {
    expect(desktopDataPaths("C:/Users/alice/AppData/Roaming/OpenTabletop")).toEqual({
      root: "C:/Users/alice/AppData/Roaming/OpenTabletop",
      dataDir: "C:/Users/alice/AppData/Roaming/OpenTabletop/data",
      sqlitePath: "C:/Users/alice/AppData/Roaming/OpenTabletop/data/opentabletop.sqlite",
      uploadDir: "C:/Users/alice/AppData/Roaming/OpenTabletop/uploads",
      pluginDir: "C:/Users/alice/AppData/Roaming/OpenTabletop/plugins",
      logsDir: "C:/Users/alice/AppData/Roaming/OpenTabletop/logs",
      backupsDir: "C:/Users/alice/AppData/Roaming/OpenTabletop/backups"
    });
  });

  it("defaults to local-only storage and disabled AI for consumer desktop hosting", () => {
    const env = desktopRuntimeEnv(desktopDataPaths("/Users/alice/Library/Application Support/OpenTabletop"), { PORT: "9999" });

    expect(env).toMatchObject({
      HOST: "127.0.0.1",
      NODE_ENV: "production",
      OTTE_ASSET_STORAGE: "local",
      OTTE_AI_PROVIDER: "disabled",
      OTTE_DEMO_SEED: "false"
    });
    expect(env.OTTE_SQLITE_PATH).toContain("opentabletop.sqlite");
    expect(env.OTTE_UPLOAD_DIR).toContain("uploads");
    expect(env.OTTE_PLUGIN_DIR).toContain("plugins");
    expect(env.PORT).toBeUndefined();
  });

  it("preserves filesystem roots and UNC shares when joining desktop paths", () => {
    expect(joinDesktopPath("/", "data", "opentabletop.sqlite")).toBe("/data/opentabletop.sqlite");
    expect(joinDesktopPath("\\\\server\\share\\", "uploads")).toBe("//server/share/uploads");
  });

  it("trusts only the exact local renderer origin for privileged desktop IPC", () => {
    const runtimeUrl = "http://127.0.0.1:43127/";

    expect(desktopRendererUrlAllowed("http://127.0.0.1:43127/campaigns/camp_demo", runtimeUrl)).toBe(true);
    expect(desktopRendererUrlAllowed("https://login.example.test/authorize", runtimeUrl)).toBe(false);
    expect(desktopRendererUrlAllowed("http://127.0.0.1:43128/", runtimeUrl)).toBe(false);
    expect(desktopRendererUrlAllowed("not a url", runtimeUrl)).toBe(false);
  });

  it("attempts every runtime shutdown even when one resource fails", async () => {
    const closed: string[] = [];
    const failures = await shutdownDesktopResources({
      relay: { stop: () => { closed.push("relay"); throw new Error("relay failed"); } },
      web: { close: async () => { closed.push("web"); } },
      api: { close: () => { closed.push("api"); } },
    });

    expect(closed).toEqual(["relay", "web", "api"]);
    expect(failures).toEqual([{ resource: "relay", message: "relay failed" }]);
  });
});
