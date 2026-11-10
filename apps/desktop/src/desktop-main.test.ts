import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiRuntimeOptions } from "@open-tabletop/api/runtime";
import type { WebStaticRuntimeOptions } from "@open-tabletop/web/static-runtime";

const startup = vi.hoisted(() => ({
  profile: "",
  webUrl: "http://127.0.0.1:43127",
  apiUrl: "http://127.0.0.1:43128",
  webOptions: undefined as WebStaticRuntimeOptions | undefined,
  apiEnv: undefined as NodeJS.ProcessEnv | undefined,
  events: [] as string[],
  startApi: vi.fn(),
  closeApi: vi.fn(),
  closeWeb: vi.fn(),
  loadURL: vi.fn(),
  exit: vi.fn(),
  createWindow: vi.fn(),
}));

vi.mock("electron", () => ({
  app: {
    commandLine: { hasSwitch: () => false },
    whenReady: async () => undefined,
    getPath: () => startup.profile,
    isPackaged: false,
    on: vi.fn(),
    exit: startup.exit,
    quit: vi.fn(),
  },
  BrowserWindow: class {
    webContents = { setWindowOpenHandler: vi.fn(), on: vi.fn() };
    constructor() { startup.createWindow(); startup.events.push("window"); }
    on() {}
    once() {}
    show() {}
    loadURL = startup.loadURL;
  },
  ipcMain: { handle: vi.fn() },
  clipboard: { writeText: vi.fn() },
  shell: { openExternal: vi.fn(), openPath: vi.fn(), showItemInFolder: vi.fn() },
}));
vi.mock("@open-tabletop/api/runtime", () => ({ startApiRuntime: startup.startApi }));
vi.mock("@open-tabletop/web/static-runtime", () => ({
  startWebStaticRuntime: async (options: WebStaticRuntimeOptions) => {
    startup.events.push("web");
    startup.webOptions = options;
    return { url: startup.webUrl, close: startup.closeWeb };
  },
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  startup.profile = mkdtempSync(join(tmpdir(), "otte-desktop-main-"));
  startup.webOptions = undefined;
  startup.apiEnv = undefined;
  startup.events = [];
  vi.stubEnv("OTTE_ASSET_URL_SIGNING_SECRET", "desktop-main-test-only-key");
  vi.stubEnv("OTTE_TRUSTED_PROXY_HOPS", "0");
  startup.startApi.mockImplementation(async (options: ApiRuntimeOptions) => {
    startup.apiEnv = { ...options.env };
    startup.events.push("api");
    return { url: startup.apiUrl, close: startup.closeApi };
  });
  startup.closeWeb.mockResolvedValue(undefined);
  startup.closeApi.mockResolvedValue(undefined);
  startup.loadURL.mockImplementation(async () => {
    expect(startup.webOptions?.apiBaseUrl).toBe(startup.apiUrl);
    startup.events.push("load");
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  const root = resolve(startup.profile);
  if (!root.startsWith(resolve(tmpdir()) + sep) || !basename(root).startsWith("otte-desktop-main-")) throw new Error("Refusing to clean an unowned test directory");
  rmSync(root, { recursive: true, force: true });
});

describe("desktop runtime startup", () => {
  it.each(["", "https://public.example.test"])("binds and trusts the exact renderer origin before API startup, preserving configured origin %j", async (configuredOrigin) => {
    vi.stubEnv("OTTE_WEB_ORIGIN", configuredOrigin);
    vi.stubEnv("OTTE_PUBLIC_URL", configuredOrigin);
    vi.stubEnv("OTTE_ASSET_CDN_BASE_URL", configuredOrigin ? "https://cdn.example.test" : "");
    vi.stubEnv("OTTE_CORS_ALLOWED_ORIGINS", configuredOrigin
      ? `https://existing.example.test, ${startup.webUrl},https://existing.example.test`
      : "https://existing.example.test");

    await import("./main.js");
    await vi.waitFor(() => expect(startup.loadURL).toHaveBeenCalledWith(startup.webUrl));

    expect(startup.apiEnv).toMatchObject({
      OTTE_WEB_ORIGIN: configuredOrigin || startup.webUrl,
      OTTE_PUBLIC_URL: configuredOrigin || startup.webUrl,
      OTTE_ASSET_CDN_BASE_URL: configuredOrigin ? "https://cdn.example.test" : "",
      OTTE_CORS_ALLOWED_ORIGINS: `https://existing.example.test,${startup.webUrl}`,
      OTTE_TRUSTED_PROXY_HOPS: "0",
    });
    expect(startup.apiEnv!.OTTE_CORS_ALLOWED_ORIGINS).not.toContain(startup.apiUrl);
    expect(startup.events).toEqual(["web", "api", "window", "load"]);
    expect(startup.exit).not.toHaveBeenCalled();
  });

  it("closes the bound web server when API startup fails before creating a window", async () => {
    vi.stubEnv("OTTE_WEB_ORIGIN", "");
    vi.stubEnv("OTTE_CORS_ALLOWED_ORIGINS", "");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    startup.startApi.mockRejectedValueOnce(new Error("API startup fixture failure"));

    await import("./main.js");
    await vi.waitFor(() => expect(startup.exit).toHaveBeenCalledWith(1));

    expect(startup.closeWeb).toHaveBeenCalledTimes(1);
    expect(startup.closeApi).not.toHaveBeenCalled();
    expect(startup.createWindow).not.toHaveBeenCalled();
    expect(startup.loadURL).not.toHaveBeenCalled();
    expect(readFileSync(join(startup.profile, "logs", "startup-error.log"), "utf8")).toContain("API startup fixture failure");
  });
});
