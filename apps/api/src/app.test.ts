import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

describe("api", () => {
  it("serves campaigns, rolls dice, and exports campaign data", async () => {
    const app = await buildApp({ store: new MemoryStateStore() });

    const campaigns = await app.inject({ method: "GET", url: "/api/v1/campaigns" });
    expect(campaigns.statusCode).toBe(200);
    expect(campaigns.json()).toHaveLength(1);

    const roll = await app.inject({
      method: "POST",
      url: "/api/v1/dice/roll",
      payload: { campaignId: "camp_demo", formula: "1d20+5", visibility: "public" }
    });
    expect(roll.statusCode).toBe(200);
    expect(roll.json().total).toBeGreaterThanOrEqual(6);

    const exported = await app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/export" });
    expect(exported.statusCode).toBe(200);
    expect(exported.json().format).toBe("ottx");

    await app.close();
  });

  it("covers auth, assets, fog, encounter design, and session memory", async () => {
    const app = await buildApp({ store: new MemoryStateStore() });

    const session = await app.inject({ method: "GET", url: "/api/v1/auth/session" });
    expect(session.statusCode).toBe(200);
    expect(session.json().user.id).toBe("usr_demo_gm");

    const asset = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/assets",
      payload: { name: "Vault Map", url: "https://example.test/vault.png", mimeType: "image/png" }
    });
    expect(asset.statusCode).toBe(200);
    expect(asset.json().name).toBe("Vault Map");

    const fog = await app.inject({
      method: "POST",
      url: "/api/v1/scenes/scn_vault_entry/fog",
      payload: { x: 420, y: 320, radius: 100 }
    });
    expect(fog.statusCode).toBe(200);
    expect(fog.json().fog).toHaveLength(2);

    const encounter = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/ai/encounter-design",
      payload: { prompt: "A clockwork sentinel", difficulty: "hard" }
    });
    expect(encounter.statusCode).toBe(200);
    expect(encounter.json().proposal.title).toBe("Encounter Designer Draft");

    const recap = await app.inject({
      method: "POST",
      url: "/api/v1/campaigns/camp_demo/ai/session-recap",
      payload: { transcript: "The party opened the vault." }
    });
    expect(recap.statusCode).toBe(200);
    expect(recap.json().memory.text).toContain("vault");

    const memory = await app.inject({ method: "GET", url: "/api/v1/campaigns/camp_demo/ai/memory" });
    expect(memory.statusCode).toBe(200);
    expect(memory.json()).toHaveLength(1);

    await app.close();
  });
});
