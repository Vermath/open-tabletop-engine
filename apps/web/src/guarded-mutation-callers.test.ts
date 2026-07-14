import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(__dirname, "App.tsx"), "utf8").replace(/\r\n/g, "\n");

function body(start: string, end: string): string {
  return source.slice(source.indexOf(start), source.indexOf(end));
}

describe("guarded tabletop mutation callers", () => {
  it("guards every asset upload and background assignment", () => {
    for (const section of [
      body("async function uploadMap", "async function uploadSelectedTokenImage"),
      body("async function uploadSelectedTokenImage", "async function uploadAiAgentReferenceAsset"),
      body("async function uploadAiAgentReferenceAsset", "function clearAiAgentReferenceAsset"),
      body("async function uploadAssetToLibrary", "async function retryAssetUpload"),
      body("async function uploadAudioTrack", "async function toggleAudioTrack"),
    ]) expect(section).toContain("idempotencyKey:");
    expect(body("async function uploadMap", "async function uploadSelectedTokenImage")).toContain("expectedSceneUpdatedAt: latestScene.updatedAt");
    expect(body("async function uploadAssetToLibrary", "async function retryAssetUpload")).toContain("expectedSceneUpdatedAt: backgroundScene?.updatedAt");
  });

  it("guards asset metadata, lifecycle, fog presets, macros, and audio", () => {
    for (const section of [
      body("async function updateAssetMetadata", "async function setSceneBackgroundFromAsset"),
      body("async function updateAssetLifecycle", "async function createAssetDeliveryUrl"),
      body("async function saveFogPreset", "async function applyFogPreset"),
      body("async function deleteFogPreset", "async function addWall"),
      body("async function createAudioTrack", "async function uploadAudioTrack"),
      body("async function toggleAudioTrack", "async function deleteAudioTrack"),
      body("async function deleteAudioTrack", "function createBlankCanvasDemoRoll"),
      body("async function saveCurrentDiceFormula", "function resolveChatRecipient"),
    ]) expect(section).toContain("idempotencyKey:");
    expect(body("async function updateAssetMetadata", "async function setSceneBackgroundFromAsset")).toContain("expectedUpdatedAt: latest.updatedAt");
    expect(body("async function updateAssetLifecycle", "async function createAssetDeliveryUrl")).toContain("expectedUpdatedAt: latest.updatedAt");
    expect(body("async function deleteFogPreset", "async function addWall")).toContain("?expectedUpdatedAt=");
    expect(body("async function toggleAudioTrack", "async function deleteAudioTrack")).toContain("expectedUpdatedAt: latest.updatedAt");
    expect(body("async function deleteAudioTrack", "function createBlankCanvasDemoRoll")).toContain("?expectedUpdatedAt=");
  });

  it("guards chat create, edit, delete, and moderation", () => {
    const submit = body("async function submitChatCommand", "async function editChatMessage");
    const edit = body("async function editChatMessage", "async function deleteChatMessage");
    const remove = body("async function deleteChatMessage", "async function moderateChatMessage");
    const moderate = body("async function moderateChatMessage", "async function exportChatHistory");
    expect(submit).toContain('attemptScope = "chat:create"');
    expect(submit).toContain("idempotencyKey: attempt.idempotencyKey");
    expect(edit).toContain("expectedUpdatedAt: latest.updatedAt");
    expect(edit).toContain("idempotencyKey:");
    expect(remove).toContain("?expectedUpdatedAt=");
    expect(remove).toContain("idempotencyKey:");
    expect(moderate).toContain("expectedUpdatedAt: latest.updatedAt");
    expect(moderate).toContain("idempotencyKey:");
  });
});
