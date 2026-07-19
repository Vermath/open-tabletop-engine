import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(__dirname, "App.tsx"), "utf8");
const sdkPanelSource = readFileSync(resolve(__dirname, "sdk-panel.tsx"), "utf8");
const advancementFlowPath = resolve(__dirname, "advancement-flow.tsx");
const advancementFlowSource = existsSync(advancementFlowPath) ? readFileSync(advancementFlowPath, "utf8") : "";
const journalPanelSource = readFileSync(resolve(__dirname, "journal-panel.tsx"), "utf8");
const stylesSource = readFileSync(resolve(__dirname, "styles.css"), "utf8");
const sceneCanvasSource = readFileSync(resolve(__dirname, "scene-canvas.tsx"), "utf8");
const actorPanelSource = readFileSync(resolve(__dirname, "actor-panel.tsx"), "utf8");

describe("player seat polish", () => {
  it("shares the advancement flow between SDK panel and the actor sheet modal", () => {
    expect(advancementFlowSource).toContain("export type AdvancementFlowProps");
    expect(advancementFlowSource).toContain('aria-label="Actor advancement choices"');
    expect(sdkPanelSource).toContain("<AdvancementFlow");
    expect(appSource).toContain("advancementModalOpen");
    expect(appSource).toContain('aria-label="Level up actor"');
    expect(appSource).toContain("modal-dialog advancement-modal");
    expect(stylesSource).toContain(".advancement-modal");
    expect(appSource).not.toContain("Ask the GM to run your advancement from the Prep workspace");
  });

  it("requires a fresh review and deduplicates advancement submission", () => {
    expect(advancementFlowSource).toContain("const advancingRef = useRef(false);");
    expect(advancementFlowSource).toContain("if (advancingRef.current || !selectedAdvancementOption) return;");
    expect(advancementFlowSource).toContain("await props.onAdvanceActor(selectedAdvancementOption.id");
    expect(advancementFlowSource).toContain("}, [advancementMode, selectedFeatId, selectedMulticlass, selectedSubclassId]);");
    expect(advancementFlowSource).toContain('advancing ? "Advancing..."');
  });

  it("keeps Manage transient and closes it with Escape unless scene edits are dirty", () => {
    expect(appSource).toContain('const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("live");');
    expect(appSource).toContain('if (workspaceMode !== "manage") return;');
    expect(appSource).toContain('if (event.key !== "Escape") return;');
    expect(appSource).toContain('if (blockCampaignSetupNavigation("leaving campaign setup")) return;');
    expect(appSource).toContain('if (blockUnsavedSceneDraft("leaving Scene Manager")) return;');
    expect(appSource).toContain('setStatus(`Save or discard scene changes before ${action}`);');
    expect(appSource).toContain('setWorkspaceMode("live");');
    expect(appSource).not.toContain('initialStoredId("otte:workspaceMode"');
    expect(appSource).not.toContain('persistStoredId("otte:workspaceMode"');
  });

  it("keeps player feature gates tied to owned actor and journal permissions", () => {
    expect(appSource).toContain('canUpdateSelectedActor = hasPermission("actor.update") || (selectedActor?.ownerUserId === currentUserId && hasPermission("actor.updateOwned"))');
    expect(appSource).toContain("canUpdateActor={canUpdateSelectedActor}");
    expect(appSource).toContain('canAwardRewards={hasPermission("combat.manage") && hasPermission("actor.update")}');
    expect(appSource).toContain("function canAssignItemFromSheet(item: Item)");
    expect(appSource).toContain("if (!canAssignItemFromSheet(item)) return;");
    expect(journalPanelSource).toContain("{props.canCreate &&");
    expect(appSource).toContain('canCreate={hasPermission("journal.create")}');
  });

  it("keeps the Agent opt-in while preserving the rest of the player live workspace", () => {
    expect(appSource).toContain('const canUseAiAgent = hasPermission("ai.use");');
    expect(appSource).toContain('if (canUseAiAgent) commands.push({ id: "action:ai-agent"');
    expect(appSource).toContain('{canUseAiAgent && (');
    expect(appSource).toContain('{canUseAiAgent && aiAgentOpen && (');
    expect(appSource).toContain('? ["actors", "compendium", "handouts", "journal", "search", "chat", "combat"]');
  });

  it("marks the current and next token with shape-aware, non-color-only turn cues", () => {
    expect(sceneCanvasSource).toContain('data-turn-state={isCurrentTurn ? "current" : isNextTurn ? "next" : undefined}');
    expect(sceneCanvasSource).toContain('const turnStateLabel = isCurrentTurn ? "current turn" : isNextTurn ? "up next" : undefined;');
    expect(sceneCanvasSource).toContain('isNextTurn = !isCurrentTurn && nextTurnTokenIdSet.has(token.id)');
    expect(stylesSource).toContain('border-radius: inherit;');
    expect(stylesSource).toContain('border: 2px solid var(--turn-current);');
    expect(stylesSource).toContain('border: 2px dashed var(--turn-next);');
    expect(actorPanelSource).toContain('combatTurnCombatant(props.combat, "current")');
    expect(actorPanelSource).toContain('combatTurnCombatant(props.combat, "next")');
    expect(appSource).toContain('combatTurnCombatant(activeCombat, "current")');
    expect(appSource).toContain('combatTurnCombatant(activeCombat, "next")');
  });
});
