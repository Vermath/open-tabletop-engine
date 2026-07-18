import { WEB_API_COMPATIBILITY_VERSION } from "@open-tabletop/core";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { computeApiSourceFingerprint, findWorkspaceRoot } from "./build-fingerprint.js";
import { MemoryStateStore } from "./store.js";

describe("API health build identity", () => {
  const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  it("publishes the exact browser compatibility version", async () => {
    const app = await buildApp({ store: new MemoryStateStore() });
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/api/v1/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      service: "open-tabletop-api",
      apiCompatibility: WEB_API_COMPATIBILITY_VERSION,
      buildFingerprint: computeApiSourceFingerprint(findWorkspaceRoot())
    });
  });
});
