import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HpBar, resolveHitPointEdit } from "./hp-bar.js";

const actorPanelSource = readFileSync(resolve(__dirname, "actor-panel.tsx"), "utf8").replace(/\r\n/g, "\n");
const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8").replace(/\r\n/g, "\n");

describe("authoritative Hit Point controls", () => {
  it("routes D&D damage to reviewed typed damage instead of rendering unsafe generic damage steppers", () => {
    const html = renderToStaticMarkup(createElement(HpBar, {
      current: 12,
      max: 20,
      canEdit: true,
      damageRequiresReview: true,
      onAdjust: () => undefined,
      onReviewDamage: () => undefined,
    }));

    expect(html).toContain("D&amp;D damage uses Reviewed typed damage");
    expect(html).toContain('aria-label="Open reviewed typed damage"');
    expect(html).toContain("Review damage");
    expect(html).not.toContain('aria-label="Take 5 damage"');
    expect(html).not.toContain('aria-label="Take 1 damage"');
    expect(html).toContain('aria-label="Heal 1"');
    expect(html).toContain('aria-label="Heal 5"');
  });

  it("keeps generic-system damage steppers available", () => {
    const html = renderToStaticMarkup(createElement(HpBar, {
      current: 12,
      max: 20,
      canEdit: true,
      onAdjust: () => undefined,
    }));

    expect(html).toContain('aria-label="Take 5 damage"');
    expect(html).toContain('aria-label="Take 1 damage"');
    expect(html).not.toContain("Reviewed typed damage");
  });

  it("restores the authoritative value for rejected D&D reductions and commits only healing", () => {
    expect(resolveHitPointEdit(12, 20, 5, true)).toEqual({ kind: "review-damage", value: 12 });
    expect(resolveHitPointEdit(12, 20, 16.9, true)).toEqual({ kind: "commit", value: 16 });
    expect(resolveHitPointEdit(12, 20, Number.NaN, true)).toEqual({ kind: "reset", value: 12 });
    expect(resolveHitPointEdit(12, 20, 25, true)).toEqual({ kind: "commit", value: 20 });
    expect(resolveHitPointEdit(12, 20, 5, false)).toEqual({ kind: "commit", value: 5 });
  });

  it("labels direct D&D input as healing, restores rejected drafts, and applies returned mutations to every HP view", () => {
    expect(actorPanelSource).toContain('damageRequiresReview ? "Heal to HP"');
    expect(actorPanelSource).toContain("This field heals only. To reduce HP, use Reviewed typed damage");
    expect(actorPanelSource).toContain("input.value = String(decision.value);");
    expect(actorPanelSource).toContain('decision.kind === "review-damage"');
    expect(actorPanelSource).toContain('aria-label="Reviewed typed damage"');
    expect(appSource).toContain('if (actor.systemId === "dnd-5e-srd" && delta < 0)');
    expect(appSource).toContain("for (const actor of result.actors) applyActorToSnapshot(actor);");
    expect(appSource).toContain("if (result.combat) applyCombatToSnapshot(result.combat);");
  });
});
