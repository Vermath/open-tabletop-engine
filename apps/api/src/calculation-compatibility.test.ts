import { createTimestamped, type Actor, type CampaignCompatibilityReport, type Item } from "@open-tabletop/core";
import { dnd5eSrdCompendiumEntry } from "@open-tabletop/system-sdk";
import { describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { MemoryStateStore } from "./store.js";

const gmHeaders = { "x-user-id": "usr_demo_gm" };
const playerHeaders = { "x-user-id": "usr_demo_player" };
const privateSentinel = "PRIVATE_CALCULATION_SENTINEL";

function campaignDataSnapshot(store: MemoryStateStore) {
  return structuredClone({
    campaigns: store.state.campaigns,
    actors: store.state.actors,
    items: store.state.items,
    systemInstallations: store.state.systemInstallations
  });
}

async function createPrivateDndActor(app: Awaited<ReturnType<typeof buildApp>>): Promise<Actor> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/characters",
    headers: { ...gmHeaders, "idempotency-key": `calculation-actor-${privateSentinel}` },
    payload: { templateId: "rogue", name: privateSentinel, ownerUserId: "usr_demo_gm" }
  });
  expect(response.statusCode).toBe(200);
  return response.json().actor as Actor;
}

describe("calculation explanation and campaign compatibility API", () => {
  it("explains authoritative D&D fields only to users allowed to read the actor's private data", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const actor = await createPrivateDndActor(app);
      const stateBeforeGet = campaignDataSnapshot(store);
      const url = `/api/v1/campaigns/camp_demo/systems/dnd-5e-srd/actors/${actor.id}/calculation-explanation`;

      const allowed = await app.inject({ method: "GET", url, headers: gmHeaders });
      expect(allowed.statusCode).toBe(200);
      expect(allowed.json()).toMatchObject({
        actorId: actor.id,
        systemId: "dnd-5e-srd",
        source: { name: expect.any(String), version: expect.any(String) }
      });
      expect(allowed.json().fields).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "armor-class", group: "defenses", flags: expect.any(Object) }),
        expect.objectContaining({ id: "initiative", group: "checks", terms: expect.any(Array) }),
        expect.objectContaining({ id: "passive-perception", group: "skills" })
      ]));
      for (const field of allowed.json().fields as Array<{ flags: unknown; terms: unknown[] }>) {
        expect(field.flags).toMatchObject({ manual: expect.any(Boolean), override: expect.any(Boolean), unsupported: expect.any(Boolean), ambiguous: expect.any(Boolean), reasons: expect.any(Array) });
        expect(field.terms.length).toBeGreaterThan(0);
      }

      const denied = await app.inject({ method: "GET", url, headers: playerHeaders });
      expect(denied.statusCode).toBe(403);
      expect(denied.body).not.toContain(privateSentinel);
      expect(campaignDataSnapshot(store)).toEqual(stateBeforeGet);

      const storedActor = store.state.actors.find((candidate) => candidate.id === actor.id);
      if (!storedActor) throw new Error("Created actor is unavailable in the state store");
      storedActor.ownerUserId = "usr_demo_player";
      const ownerStateBeforeGet = campaignDataSnapshot(store);
      const ownerAllowed = await app.inject({ method: "GET", url, headers: playerHeaders });
      expect(ownerAllowed.statusCode).toBe(200);
      expect(ownerAllowed.json()).toMatchObject({ actorId: actor.id, systemId: "dnd-5e-srd" });
      expect(campaignDataSnapshot(store)).toEqual(ownerStateBeforeGet);
    } finally {
      await app.close();
    }
  });

  it("reports systems, validation, compendium drift, manual review, and blocking references without mutating campaign data", async () => {
    const store = new MemoryStateStore();
    const app = await buildApp({ store });
    try {
      const actor = await createPrivateDndActor(app);
      const storedActor = store.state.actors.find((candidate) => candidate.id === actor.id)!;
      const storedHp = storedActor.data.hp as { current: number; max: number };
      storedActor.data.hp = { ...storedHp, current: storedHp.max + 2 };
      storedActor.data.compatibilitySentinel = { preserved: true };
      const longsword = dnd5eSrdCompendiumEntry("longsword");
      if (!longsword?.provenance) throw new Error("Bundled longsword provenance is unavailable");
      const driftedItem = createTimestamped("itm", {
        id: "itm_compat_drifted_longsword",
        campaignId: actor.campaignId,
        systemId: actor.systemId,
        actorId: actor.id,
        type: "item",
        name: "Version-drifted longsword",
        data: {
          ...(longsword.data as Record<string, unknown>),
          compendiumId: longsword.id,
          compendiumProvenance: { ...longsword.provenance, contentVersion: "5.2.0" }
        }
      }) satisfies Item;
      const orphanedItem = createTimestamped("itm", {
        id: "itm_compat_missing_system",
        campaignId: actor.campaignId,
        systemId: "missing-ruleset",
        actorId: "act_missing_for_compatibility",
        type: "item",
        name: "Preserved unknown-system item",
        data: { unknownHomebrewField: { preserved: true } }
      }) satisfies Item;
      store.state.items.push(driftedItem, orphanedItem);
      const stateBeforeGet = campaignDataSnapshot(store);
      const url = "/api/v1/campaigns/camp_demo/compatibility";

      const denied = await app.inject({ method: "GET", url, headers: playerHeaders });
      expect(denied.statusCode).toBe(403);
      expect(denied.body).not.toContain(orphanedItem.name);

      const response = await app.inject({ method: "GET", url, headers: gmHeaders });
      expect(response.statusCode).toBe(200);
      const report = response.json() as CampaignCompatibilityReport;
      expect(report).toMatchObject({
        campaignId: "camp_demo",
        readOnly: true,
        status: "blocking",
        platform: {
          coreVersion: "0.3.0",
          currentArchiveVersion: "0.2.0",
          supportedArchiveVersions: ["0.1.0", "0.2.0"]
        },
        validation: {
          actorReports: expect.any(Number),
          itemReports: expect.any(Number),
          repairPreview: {
            automaticChanges: expect.any(Number),
            note: expect.stringContaining("inverse patches"),
            candidates: expect.arrayContaining([
              expect.objectContaining({
                entityKind: "actor",
                entityId: actor.id,
                path: "/data/hp/current",
                before: storedHp.max + 2,
                after: storedHp.max,
                inverse: expect.objectContaining({ operation: "replace", after: storedHp.max + 2 })
              })
            ])
          }
        },
        compendium: { driftedEntries: 1 }
      });
      expect(report.systems).toEqual(expect.arrayContaining([
        expect.objectContaining({ systemId: "dnd-5e-srd", coreCompatible: true, actorCount: expect.any(Number), itemContentVersions: expect.any(Object) }),
        expect.objectContaining({ systemId: "missing-ruleset", coreCompatible: false, itemCount: 1 })
      ]));
      expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
        "system.missing",
        "reference.actor_missing",
        "compendium.version_drift"
      ]));
      expect(report.issues[0]?.severity).toBe("blocking");
      expect(report.validation.repairPreview.automaticChanges).toBeGreaterThan(0);

      const repeated = await app.inject({ method: "GET", url, headers: gmHeaders });
      expect(repeated.statusCode).toBe(200);
      expect(repeated.json()).toEqual(report);
      expect(campaignDataSnapshot(store)).toEqual(stateBeforeGet);
    } finally {
      await app.close();
    }
  });
});
