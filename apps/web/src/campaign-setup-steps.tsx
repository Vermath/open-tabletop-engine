import type { Actor, Campaign, Scene, Token, UserRole } from "@open-tabletop/core";
import type { Ref } from "react";
import { campaignPermissionTemplates, type CampaignPermissionTemplateId } from "./admin-data.js";
import { campaignSetupSteps, moveCampaignSetupRoute, type CampaignSetupDraftInput, type CampaignSetupStepId } from "./campaign-setup-state.js";
import { SceneGridFields } from "./scene-grid-fields.js";

const stepLabels: Record<CampaignSetupStepId, string> = {
  campaign: "Campaign",
  scene: "Scene & map",
  invitation: "Invitation",
  review: "Review"
};

export interface CampaignSetupStepsProps {
  draft: CampaignSetupDraftInput;
  systems: Array<{ id: string; name: string }>;
  busy: boolean;
  recoveryPending: boolean;
  draftNotice?: string;
  submitButtonRef?: Ref<HTMLButtonElement>;
  onChange(patch: Partial<CampaignSetupDraftInput>): void;
  onSubmit(): void | Promise<void>;
  onCancel(): void;
  onKeep(): void | Promise<void>;
  onDiscardDraft(): void;
}

export function CampaignSetupSteps(props: CampaignSetupStepsProps) {
  const { draft } = props;
  const activeIndex = campaignSetupSteps.indexOf(draft.route.step);
  const permissionTemplate = campaignPermissionTemplates.find((template) => template.id === draft.permissionTemplate) ?? campaignPermissionTemplates[0]!;
  const update = (patch: Partial<CampaignSetupDraftInput>) => props.onChange({
    ...patch,
    route: { ...draft.route, skipped: draft.route.skipped.filter((step) => step !== draft.route.step) }
  });
  const move = (action: "back" | "next" | "skip" | CampaignSetupStepId) => props.onChange({ route: moveCampaignSetupRoute(draft.route, action) });
  const skip = () => props.onChange({
    ...(draft.route.step === "scene" ? { starterContent: true } : {}),
    ...(draft.route.step === "invitation" ? { inviteEnabled: false } : {}),
    route: moveCampaignSetupRoute(draft.route, "skip")
  });
  const sceneName = draft.starterContent ? "First Session" : draft.sceneName.trim() || "Opening Scene";
  const sceneFolder = draft.starterContent ? "starter content" : draft.sceneFolder.trim() || "no folder";
  const visibility = draft.visibility === "invite_only" ? "Invite only" : draft.visibility === "public" ? "Public" : "Private";
  const invite = draft.inviteEnabled ? `${roleLabel(draft.inviteRole)} invite${draft.inviteEmail.trim() ? ` for ${draft.inviteEmail.trim()}` : ""}` : "No starter invite";
  const onboarding = draft.starterContent ? "Starter content: First Session and welcome notes" : draft.onboardingBody.trim() ? `Public handout: ${draft.onboardingTitle.trim() || "Welcome to the Table"}` : "No onboarding handout";

  return (
    <form
      className="create-drawer-form campaign-setup-steps"
      aria-busy={props.busy}
      onSubmit={(event) => {
        event.preventDefault();
        if (draft.route.step !== "review" && !props.recoveryPending) move("next");
        else void props.onSubmit();
      }}
    >
      <div className="section-title">Campaign Setup</div>
      <p className="account-summary">Four short steps get the table ready. Optional preparation can be skipped and revisited.</p>
      {props.draftNotice && (
        <div className="campaign-setup-draft-notice" role="status">
          <span>{props.draftNotice}</span>
          <button className="ghost-button" type="button" onClick={props.onDiscardDraft}>Start fresh</button>
        </div>
      )}
      <ol className="campaign-setup-step-nav" aria-label="Campaign setup steps">
        {campaignSetupSteps.map((step, index) => (
          <li key={step}>
            <button
              type="button"
              disabled={props.busy || props.recoveryPending}
              aria-current={step === draft.route.step ? "step" : undefined}
              aria-label={`${index + 1}. ${stepLabels[step]}${draft.route.skipped.includes(step) ? " (skipped)" : ""}`}
              onClick={() => move(step)}
            >
              <span>{index + 1}</span> {stepLabels[step]}
              {draft.route.skipped.includes(step) && <small>Skipped</small>}
            </button>
          </li>
        ))}
      </ol>
      <fieldset className="campaign-setup-fieldset" disabled={props.busy || props.recoveryPending}>
        <legend className="sr-only">{stepLabels[draft.route.step]}</legend>
        {draft.route.step === "campaign" && (
          <section className="campaign-setup-step" aria-labelledby="campaign-setup-campaign-heading">
            <h3 id="campaign-setup-campaign-heading">Name the campaign</h3>
            <p className="account-summary">Only the name is required. You can change every setting later.</p>
            <input autoFocus aria-label="Campaign name" value={draft.name} placeholder="Campaign name" onChange={(event) => update({ name: event.target.value })} />
            <textarea aria-label="Campaign description" value={draft.description} placeholder="Description" onChange={(event) => update({ description: event.target.value })} />
            <label><span>Rules system</span><select aria-label="Campaign rules system" value={draft.systemId} onChange={(event) => update({ systemId: event.target.value })}>{props.systems.length === 0 ? <option value="dnd-5e-srd">D&amp;D 5.5e SRD</option> : props.systems.map((system) => <option key={system.id} value={system.id}>{system.name}</option>)}</select></label>
            <label><span>Who can find it</span><select aria-label="Campaign visibility" value={draft.visibility} onChange={(event) => update({ visibility: event.target.value as Campaign["visibility"] })}><option value="private">Private</option><option value="invite_only">Invite only</option><option value="public">Public</option></select></label>
          </section>
        )}
        {draft.route.step === "scene" && (
          <section className="campaign-setup-step" aria-labelledby="campaign-setup-scene-heading">
            <h3 id="campaign-setup-scene-heading">Prepare the first scene</h3>
            <p className="account-summary">Starter content creates a playable scene and welcome notes. Maps, tokens, and encounters remain optional preparation.</p>
            <label className="inline-check"><input aria-label="Include starter content" type="checkbox" checked={draft.starterContent} onChange={(event) => update({ starterContent: event.target.checked })} /><span>Include starter content</span></label>
            {draft.starterContent && <p className="account-summary">Starter content supplies the First Session scene and welcome notes. Turn it off to customize these fields.</p>}
            <input aria-label="Setup initial scene name" disabled={draft.starterContent} value={draft.sceneName} placeholder="Opening Scene" onChange={(event) => update({ sceneName: event.target.value })} />
            <details className="campaign-setup-advanced">
              <summary>Advanced scene and onboarding settings</summary>
              <div className="campaign-setup-advanced-fields">
                <input aria-label="Setup initial scene folder" disabled={draft.starterContent} value={draft.sceneFolder} placeholder="session-0" onChange={(event) => update({ sceneFolder: event.target.value })} />
                <div className="button-row"><input aria-label="Setup scene width" type="number" min={200} disabled={draft.starterContent} value={draft.sceneWidth} onChange={(event) => update({ sceneWidth: Number(event.target.value) })} /><input aria-label="Setup scene height" type="number" min={200} disabled={draft.starterContent} value={draft.sceneHeight} onChange={(event) => update({ sceneHeight: Number(event.target.value) })} /></div>
                <fieldset className="campaign-setup-grid-fields" disabled={draft.starterContent}><legend className="sr-only">Scene grid</legend><SceneGridFields mode="setup" gridType={draft.sceneGridType} gridSize={draft.sceneGridSize} onGridTypeChange={(sceneGridType) => update({ sceneGridType })} onGridSizeChange={(sceneGridSize) => update({ sceneGridSize })} /></fieldset>
                <input aria-label="Setup onboarding title" disabled={draft.starterContent} value={draft.onboardingTitle} placeholder="Welcome to the Table" onChange={(event) => update({ onboardingTitle: event.target.value })} />
                <textarea aria-label="Setup onboarding copy" disabled={draft.starterContent} value={draft.onboardingBody} placeholder="Table rules, safety notes, first-session goals" onChange={(event) => update({ onboardingBody: event.target.value })} />
              </div>
            </details>
          </section>
        )}
        {draft.route.step === "invitation" && (
          <section className="campaign-setup-step" aria-labelledby="campaign-setup-invitation-heading">
            <h3 id="campaign-setup-invitation-heading">Invite the table</h3>
            <p className="account-summary">This is optional. Invite links can also be created later from People.</p>
            <label className="inline-check"><input aria-label="Create starter invite" type="checkbox" checked={draft.inviteEnabled} onChange={(event) => update({ inviteEnabled: event.target.checked })} /><span>Create starter invite</span></label>
            <input aria-label="Setup invite email" type="email" autoComplete="email" value={draft.inviteEmail} placeholder="player@example.com" disabled={!draft.inviteEnabled} onChange={(event) => update({ inviteEmail: event.target.value })} />
            <select aria-label="Setup default player permission preset" value={draft.inviteRole} disabled={!draft.inviteEnabled} onChange={(event) => update({ inviteRole: event.target.value as UserRole })}><option value="player">Player - owns characters and plays live</option><option value="observer">Observer - read-only table access</option><option value="assistant_gm">Assistant GM - prep and moderation</option><option value="gm">GM - full campaign management</option></select>
            <details className="campaign-setup-advanced">
              <summary>Advanced permission settings</summary>
              <div className="campaign-setup-advanced-fields">
                <select aria-label="Setup campaign permission template" value={draft.permissionTemplate} onChange={(event) => update({ permissionTemplate: event.target.value as CampaignPermissionTemplateId })}>{campaignPermissionTemplates.map((template) => <option key={template.id} value={template.id}>{template.label}</option>)}</select>
                <p className="account-summary">{permissionTemplate.description}</p>
              </div>
            </details>
          </section>
        )}
        {draft.route.step === "review" && (
          <section className="campaign-setup-step" aria-labelledby="campaign-setup-review-heading">
            <h3 id="campaign-setup-review-heading">Review and create</h3>
            <p className="account-summary">Character creation, map placement, tokens, and encounters are guided next and remain optional until play needs them.</p>
            <div className="asset-pressure-list" aria-label="Campaign setup impact">
              <div className="operator-row tool-call-row"><span>Access</span><strong>{visibility} - {invite}</strong></div>
              <div className="operator-row tool-call-row"><span>Scene</span><strong>{sceneName} - {draft.sceneWidth}x{draft.sceneHeight} - {draft.sceneGridType === "gridless" ? "gridless" : `grid ${draft.sceneGridSize}`} - {sceneFolder}</strong></div>
              <div className="operator-row tool-call-row"><span>Permissions</span><strong>{permissionTemplate.label}</strong></div>
              <div className="operator-row tool-call-row"><span>Onboarding</span><strong>{onboarding}</strong></div>
            </div>
          </section>
        )}
      </fieldset>
      {props.recoveryPending && <p className="account-summary campaign-setup-recovery" role="status">The campaign already exists. Retry to finish the remaining setup without creating a duplicate.</p>}
      <div className="button-row campaign-setup-actions">
        {activeIndex > 0 && !props.recoveryPending && <button className="ghost-button" type="button" onClick={() => move("back")}>Back</button>}
        {activeIndex < campaignSetupSteps.length - 1 && !props.recoveryPending && <button className="ghost-button wide" type="submit" disabled={draft.route.step === "campaign" && !draft.name.trim()}>Next: {stepLabels[campaignSetupSteps[activeIndex + 1]!]}</button>}
        {(draft.route.step === "scene" || draft.route.step === "invitation") && !props.recoveryPending && <button className="ghost-button" type="button" onClick={skip}>Skip for now</button>}
        {(draft.route.step === "review" || props.recoveryPending) && <button ref={props.submitButtonRef} className="ghost-button wide" type="submit" disabled={!draft.name.trim() || props.busy}>{props.busy ? "Creating campaign..." : props.recoveryPending ? "Retry Campaign Setup" : "Create Campaign Setup"}</button>}
        {props.busy && <button className="ghost-button wide" type="button" onClick={props.onCancel}>Cancel setup</button>}
        {props.recoveryPending && <button className="ghost-button wide" type="button" onClick={() => void props.onKeep()}>Keep campaign as-is</button>}
      </div>
    </form>
  );
}

export interface FirstSessionSetupInput {
  actors: Array<Pick<Actor, "id" | "ownerUserId" | "type">>;
  currentUserId: string;
  canManage: boolean;
  canCreateCharacter: boolean;
  memberCount: number;
  pendingInviteCount: number;
  scenes: Array<Pick<Scene, "id" | "backgroundAssetId" | "gridType" | "metadata">>;
  tokens: Array<Pick<Token, "sceneId"> & Partial<Pick<Token, "layer">>>;
  encounterCount: number;
}

export interface FirstSessionSetupStep {
  id: "character" | "invitation" | "scene" | "encounter" | "play";
  label: string;
  detail: string;
  complete: boolean;
}

export function deriveFirstSessionSetupSteps(input: FirstSessionSetupInput): FirstSessionSetupStep[] {
  const characterReady = input.actors.some((actor) => actor.type === "character" && (input.canManage || actor.ownerUserId === input.currentUserId));
  const readyScene = input.scenes.find((scene) => sceneMapIsReady(scene) && input.tokens.some((token) => token.sceneId === scene.id && token.layer !== "map"));
  if (!input.canManage) return [
    { id: "character", label: "Your character", detail: characterReady ? "Your character is ready." : input.canCreateCharacter ? "Create or claim the character you will play." : "Ask the GM to assign your character.", complete: characterReady },
    { id: "play", label: "Join the table", detail: readyScene ? "The table has a playable scene ready." : "The GM is still preparing a map and token on the first scene.", complete: characterReady && Boolean(readyScene) }
  ];
  const sceneParts = [
    input.scenes.length > 0,
    input.scenes.some((scene) => Boolean(scene.backgroundAssetId)),
    input.scenes.some((scene) => sceneMapIsReady(scene)),
    input.scenes.some((scene) => input.tokens.some((token) => token.sceneId === scene.id && token.layer !== "map"))
  ];
  const missingSceneParts = ["scene", "map", "map calibration", "token"].filter((_, index) => !sceneParts[index]);
  const sceneDetail = readyScene
    ? "The first tabletop scene is ready."
    : missingSceneParts.length === 0
      ? "Put a map and token together on the same scene."
      : `Still optional: add ${missingSceneParts.join(", ")}.`;
  return [
    { id: "character", label: "Create a character", detail: characterReady ? "At least one player character is ready." : "Create or import the first player character.", complete: characterReady },
    { id: "invitation", label: "Invite players", detail: input.memberCount > 1 ? "A player has joined the campaign." : input.pendingInviteCount > 0 ? "An invitation is waiting to be accepted." : "Create an invitation when the player is ready.", complete: input.memberCount > 1 || input.pendingInviteCount > 0 },
    { id: "scene", label: "Prepare scene, map & tokens", detail: sceneDetail, complete: Boolean(readyScene) },
    { id: "encounter", label: "Prepare an encounter", detail: input.encounterCount > 0 ? "An encounter is ready to run." : "Build an encounter now or improvise one during play.", complete: input.encounterCount > 0 },
    { id: "play", label: "Start play", detail: readyScene && characterReady ? "The table is ready to open." : "Finish a character and a playable scene first.", complete: characterReady && Boolean(readyScene) }
  ];
}

export function sceneMapIsReady(scene: Pick<Scene, "backgroundAssetId" | "gridType" | "metadata">): boolean {
  if (!scene.backgroundAssetId) return false;
  return scene.gridType === "gridless" || scene.metadata.mapCalibrationComplete === true;
}

export function FirstSessionSetupChecklist(props: FirstSessionSetupInput & { onOpen(step: FirstSessionSetupStep["id"]): void }) {
  const steps = deriveFirstSessionSetupSteps(props);
  const next = steps.find((step) => !step.complete) ?? steps[steps.length - 1]!;
  return (
    <section className="account-box first-session-setup" aria-labelledby="first-session-setup-heading">
      <div className="section-title">First-session steps</div>
      <h2 id="first-session-setup-heading">Next: {next.label}</h2>
      <ol>{steps.map((step) => <li key={step.id} className={step.complete ? "complete" : undefined}><button type="button" onClick={() => props.onOpen(step.id)}><span aria-hidden="true">{step.complete ? "Done" : "Next"}</span><span><strong>{step.label}</strong><small>{step.detail}</small></span></button></li>)}</ol>
    </section>
  );
}

function roleLabel(role: UserRole): string {
  return role === "assistant_gm" ? "Assistant GM" : role.slice(0, 1).toUpperCase() + role.slice(1);
}
