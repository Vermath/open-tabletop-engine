import { describe, expect, it } from "vitest";
import { desktopDataPaths, desktopRendererUrlAllowed, desktopRuntimeEnv } from "./desktop-runtime.js";

describe("desktop runtime configuration", () => {
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

  it("trusts only the exact local renderer origin for privileged desktop IPC", () => {
    const runtimeUrl = "http://127.0.0.1:43127/";

    expect(desktopRendererUrlAllowed("http://127.0.0.1:43127/campaigns/camp_demo", runtimeUrl)).toBe(true);
    expect(desktopRendererUrlAllowed("https://login.example.test/authorize", runtimeUrl)).toBe(false);
    expect(desktopRendererUrlAllowed("http://127.0.0.1:43128/", runtimeUrl)).toBe(false);
    expect(desktopRendererUrlAllowed("not a url", runtimeUrl)).toBe(false);
  });
});
