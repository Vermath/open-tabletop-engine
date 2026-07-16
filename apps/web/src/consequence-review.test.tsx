import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { actorActionConsequenceReview, actorActionPreviewRequiresInput, typedDamageConsequenceReview } from "./actor-action-review.js";
import { ConsequenceReviewDialog } from "./consequence-review.js";

describe("structured consequence review", () => {
  it("allows disclosed manual follow-up while retaining true preview blockers", () => {
    expect(actorActionPreviewRequiresInput({
      commitMode: "preview",
      manualResolutionRequired: { reason: "The GM confirms the damage in combat.", supportStatus: "manual" },
    }, { applyEffect: true, missingRequiredSaveOutcomes: false })).toBe(false);
    expect(actorActionPreviewRequiresInput({
      commitMode: "preview",
      manualResolutionRequired: { reason: "This effect is outside the supported model.", supportStatus: "unsupported" },
    }, { applyEffect: true, missingRequiredSaveOutcomes: false })).toBe(true);
    expect(actorActionPreviewRequiresInput({
      commitMode: "preview",
      pendingChoice: { reason: "Choose a damage type.", options: ["acid", "cold"] },
    }, { applyEffect: true, missingRequiredSaveOutcomes: false })).toBe(true);
    expect(actorActionPreviewRequiresInput({
      commitMode: "preview",
      weaponMastery: {
        property: "cleave",
        capability: "choice",
        status: "choice-required",
        message: "Choose a secondary target.",
        source: "SRD 5.2.1",
        sourcePage: 91,
        sourceUrl: "https://example.invalid/srd.pdf",
      },
    }, { applyEffect: true, missingRequiredSaveOutcomes: false })).toBe(true);
    expect(actorActionPreviewRequiresInput(undefined, { applyEffect: false, missingRequiredSaveOutcomes: true })).toBe(true);
  });

  it("orders typed action consequences without presenting raw JSON", () => {
    const review = actorActionConsequenceReview("Ari", {
      rolls: [{ label: "Longsword", formula: "1d20+6", total: 19, targetActorId: "actor-orc" }],
      resolution: {
        commitMode: "preview",
        action: { label: "Longsword", kind: "action", ledger: { actionsUsed: 1, actionSurgeGrants: 0 } },
        effects: [{ type: "damage", targetActorId: "actor-orc", targetActorName: "Orc", amount: 8, damageType: "slashing", before: 15, after: 7 }],
        resourceConsumption: [{ label: "Action", amount: 1, remaining: 0 }],
        conditions: [{ actorId: "actor-orc", operation: "apply", conditionName: "Prone", reason: "Topple mastery" }]
      }
    }, { actorNames: new Map([["actor-orc", "Orc"]]), applyEffect: true });

    expect(review.sections.map((section) => section.id)).toEqual(["action", "rolls", "targets", "effects", "conditions", "resources"]);
    expect(review.sections.find((section) => section.id === "effects")?.items[0]).toMatchObject({ label: "damage - Orc", value: "8 slashing", detail: "15 to 7" });
    expect(JSON.stringify(review)).not.toContain('"actorUpdates":{"');
  });

  it("makes missing choices and unsupported boundaries explicit and non-committable", () => {
    const review = actorActionConsequenceReview("Ari", {
      resolution: {
        commitMode: "preview",
        pendingChoice: { reason: "Choose a damage type.", options: ["acid", "cold"] },
        manualResolutionRequired: { reason: "Custom effect is outside the supported model.", supportStatus: "unsupported" }
      }
    });
    const html = renderToStaticMarkup(<ConsequenceReviewDialog request={review} onConfirm={() => undefined} onCancel={() => undefined} />);

    expect(review.boundary?.status).toBe("unsupported");
    expect(review.blockingIssues).toEqual(["Custom effect is outside the supported model.", "Choose a damage type."]);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Resolve before commit");
    expect(html).toContain("disabled");
    expect(html).toContain('aria-label="Consequence review decision"');
  });

  it("keeps a disclosed manual follow-up reviewable without blocking exact prepared state", () => {
    const review = actorActionConsequenceReview("Ari", {
      resolution: {
        commitMode: "preview",
        actorUpdates: [{ actorId: "actor-ari", reason: "Start concentration" }],
        manualResolutionRequired: { reason: "Place and move the spell's lights at the table.", supportStatus: "manual" },
      },
    });
    const html = renderToStaticMarkup(<ConsequenceReviewDialog request={review} onConfirm={() => undefined} onCancel={() => undefined} />);

    expect(review.boundary?.status).toBe("manual");
    expect(review.blockingIssues).toBeUndefined();
    expect(html).toContain("Place and move the spell&#x27;s lights at the table.");
    expect(html).not.toContain("Resolve before commit");
    expect(html).not.toContain("disabled");
  });

  it("distinguishes applied and manual Weapon Mastery outcomes without implying geometry", () => {
    const applied = actorActionConsequenceReview("Ari", {
      rolls: [{ label: "Greataxe", formula: "1d20+6", total: 18, targetActorId: "actor-ogre" }],
      resolution: {
        commitMode: "preview",
        weaponMastery: {
          property: "cleave",
          capability: "choice",
          status: "applied",
          message: "Cleave made its reviewed secondary attack.",
          source: "SRD 5.2.1",
          sourcePage: 91,
          sourceUrl: "https://example.invalid/srd.pdf",
          targetActorId: "actor-ogre",
          secondaryTargetActorId: "actor-goblin",
          geometry: { inferred: false, confirmedByUser: true, instruction: "Reviewed within reach." }
        }
      }
    }, { actorNames: new Map([["actor-ogre", "Ogre"], ["actor-goblin", "Goblin"]]), applyEffect: true });
    const manual = actorActionConsequenceReview("Ari", {
      resolution: {
        commitMode: "preview",
        weaponMastery: {
          property: "push",
          capability: "manual",
          status: "manual-step",
          message: "Move the target up to 10 feet; no token coordinates were inferred or mutated.",
          source: "SRD 5.2.1",
          sourcePage: 91,
          sourceUrl: "https://example.invalid/srd.pdf",
          targetActorId: "actor-ogre",
          geometry: { inferred: false, confirmedByUser: false, instruction: "Move straight away." }
        }
      }
    }, { applyEffect: true });

    expect(applied.sections.find((section) => section.id === "weapon-mastery")?.items[0]).toMatchObject({ label: "Cleave - Applied", detail: expect.stringContaining("geometry inferred: no; reviewed: yes") });
    expect(applied.sections.find((section) => section.id === "targets")?.items).toEqual([{ label: "Target", value: "Ogre" }, { label: "Target", value: "Goblin" }]);
    expect(manual.boundary?.status).toBe("manual");
    expect(manual.blockingIssues).toBeUndefined();
  });

  it("renders exact multi-target typed damage with source and accessible headings", () => {
    const review = typedDamageConsequenceReview({
      label: "Fireball damage",
      damageType: "fire",
      amount: 21,
      prepared: {
        status: "ready",
        blockers: [],
        batch: { targets: [
          { actorId: "one", actorName: "Goblin one", preview: { changes: [{ path: "/hp/current", operation: "replace", before: 30, after: 9 }] } },
          { actorId: "two", actorName: "Goblin two", preview: { changes: [{ path: "/hp/current", operation: "replace", before: 12, after: 0 }] } }
        ] }
      }
    });
    const html = renderToStaticMarkup(<ConsequenceReviewDialog request={review} onConfirm={() => undefined} onCancel={() => undefined} />);

    expect(html).toContain('aria-labelledby="consequence-review-title"');
    expect(html).toContain("D&amp;D 5e SRD typed-damage resolver");
    expect(html).toContain("Goblin one /hp/current");
    expect(html).toContain("Goblin two /hp/current");
    expect(html).not.toContain("{&quot;");
  });
});
