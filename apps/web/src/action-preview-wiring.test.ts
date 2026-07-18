import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const actorPanelSource = readFileSync(resolve(__dirname, "actor-panel.tsx"), "utf8");
const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");

describe("actor action preview wiring", () => {
  it("invalidates every action-selection control before a replacement preview starts", () => {
    expect(actorPanelSource).toContain("selectActionPreview(action.rollId)");
    expect(actorPanelSource).toContain("selectActionTarget(event.target.value)");
    expect(actorPanelSource).toContain("selectActionApplyEffect(event.target.checked)");
    expect(actorPanelSource).toContain("selectActionConsumeResources(event.target.checked)");
    expect(actorPanelSource).toContain("onChange={selectWeaponMasteryDraft}");
    expect(actorPanelSource).toContain("selectActionEffectChoice(event.target.value)");
    expect(actorPanelSource).not.toContain("onChange={(event) => props.setActionTargetActorId(event.target.value)}");
    expect(actorPanelSource).not.toContain("onChange={(event) => props.setActionApplyEffect(event.target.checked)}");
    expect(actorPanelSource).not.toContain("onChange={(event) => props.setActionConsumeResources(event.target.checked)}");
  });

  it("owns action drafts inside one actor, scene, and combat scope", () => {
    expect(actorPanelSource).toContain("actorActionDraftScopeKey({ campaignId: props.campaignId");
    expect(actorPanelSource).toContain("actorActionDraftForScope(storedActionDraft, actionDraftScopeKey");
    expect(actorPanelSource).toContain("sceneId: props.scene?.id");
    expect(actorPanelSource).toContain("combatId: props.combat?.id");
    expect(actorPanelSource).toContain("actionTargetActors.map((actor)");
    expect(actorPanelSource).toContain("const tokenActionTargetOptions = sceneTargetTokens");
    expect(actorPanelSource).toContain("actorActionTargetLabel(actor, actionTargetActors, tokenContext)");
    expect(actorPanelSource).toContain("reviewActorNames: actionTargetNameOverrides");
    expect(appSource).toContain("options.reviewActorNames?.[candidate.id] ?? candidate.name");
    expect(actorPanelSource).not.toContain("props.actionTargetActorId");
    expect(actorPanelSource).not.toContain("props.actionApplyEffect");
    expect(appSource).toContain('key={`actor-panel:${campaignId}:${selectedActor?.id ?? "none"}:${selectedScene?.id ?? "none"}:${activeCombat?.id ?? "none"}`}');
  });

  it("makes the two review stages explicit without bypassing exact prepared commit", () => {
    expect(actorPanelSource).toContain("Step 1 of 2 ready - nothing committed");
    expect(actorPanelSource).toContain("Continue to final review opens the exact server-prepared consequences");
    expect(actorPanelSource).toContain('aria-label="Continue to final review"');
    expect(actorPanelSource).not.toContain('aria-label="Use action"');
    expect(appSource).toContain("final exact-action review open; nothing committed yet");
    expect(appSource).toContain("preparedPreviewKey: prepared.preparation.preparedPreviewKey");
    expect(appSource).toContain("action pending GM confirmation");
  });

  it("binds commits to one current authoritative preview and continuation", () => {
    expect(actorPanelSource).toContain("expectedUpdatedAt: props.actor.updatedAt");
    expect(actorPanelSource).toContain("actionPreviewForFingerprint(actionPreviewState, actionPreviewFingerprint)");
    expect(actorPanelSource).toContain("!actionPreviewReady");
    expect(actorPanelSource).toContain("if (!actionPreviewReady || !actionPreview || !previewAction) return;");
    expect(actorPanelSource).toContain("continuationId: previewContinuation.continuationId");
    expect(actorPanelSource).toContain("continuationId: selectedActionContinuationId");
    expect(actorPanelSource).toContain("setPreferredActionContinuationId(previewContinuation.continuationId)");
    expect(actorPanelSource).toContain("actionPreviewContinuationSelection(availableActionContinuations, preferredActionContinuationId)");
    expect(actorPanelSource).toContain("Preview did not bind to the selected committed attack");
    expect(actorPanelSource).toContain("Bound to exact server ticket");
    expect(actorPanelSource).toContain("Retry preview");
    expect(appSource).toContain("continuationId: options.continuationId");
  });

  it("includes the Cleave secondary actor and owned items in preview identity", () => {
    expect(actorPanelSource).toContain("selectedPreviewWeaponMasteryUse?.secondaryTargetActorId");
    expect(actorPanelSource).toContain("[props.actor?.id, selectedPreviewTargetId, secondaryPreviewTargetId]");
    expect(actorPanelSource).toContain("actorRevisions: previewActorRevisions");
    expect(actorPanelSource).toContain("itemRevisions: previewItemRevisions");
  });

  it("does not let delayed actor, item, or combat events replace a newer HTTP revision", () => {
    expect(appSource).toContain("upsertNewestRealtimeRecord(current.actors, actor)");
    expect(appSource).toContain("upsertNewestRealtimeRecord(current.items, item)");
    expect(appSource).toContain("upsertNewestRealtimeRecord(current.combats, combat)");
    expect(appSource).toContain("knownActor.updatedAt > actor.updatedAt");
  });
});
