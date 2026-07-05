import { describe, expect, it } from "vitest";
import type { AudioTrack } from "@open-tabletop/core";
import { activeAudioCount, desiredAudioStates } from "./audio-sync.js";

function track(overrides: Partial<AudioTrack> & { id: string }): AudioTrack {
  return {
    campaignId: "camp_1",
    createdBy: "usr_gm",
    name: "Track",
    url: "https://example.test/a.mp3",
    kind: "ambient",
    loop: true,
    playing: false,
    volume: 1,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...overrides
  };
}

describe("audio sync", () => {
  it("derives playback state and scales volume by the master volume", () => {
    const states = desiredAudioStates([track({ id: "a", playing: true, volume: 0.5 })], { masterVolume: 0.5 });
    expect(states).toEqual([{ trackId: "a", url: "https://example.test/a.mp3", playing: true, loop: true, volume: 0.25 }]);
  });

  it("uses signed delivery URLs for managed audio playback", () => {
    const [state] = desiredAudioStates([
      {
        ...track({ id: "managed", url: "/api/v1/assets/asset_audio/blob", playing: true }),
        deliveryUrl: "https://assets.example.test/api/v1/assets/asset_audio/blob?signature=sig"
      } as AudioTrack & { deliveryUrl: string }
    ]);

    expect(state?.url).toBe("https://assets.example.test/api/v1/assets/asset_audio/blob?signature=sig");
    expect(state?.url).not.toContain("sessionToken=");
  });

  it("forces volume to zero when muted", () => {
    const [state] = desiredAudioStates([track({ id: "a", playing: true, volume: 1 })], { muted: true });
    expect(state?.volume).toBe(0);
    expect(state?.playing).toBe(true);
  });

  it("never loops one-shot sfx", () => {
    const [state] = desiredAudioStates([track({ id: "a", kind: "sfx", loop: true })]);
    expect(state?.loop).toBe(false);
  });

  it("skips tracks without a url and counts active tracks", () => {
    const tracks = [track({ id: "a", playing: true }), track({ id: "b", url: "", playing: true }), track({ id: "c", playing: false })];
    expect(desiredAudioStates(tracks).map((state) => state.trackId)).toEqual(["a", "c"]);
    expect(activeAudioCount(tracks)).toBe(2);
  });

  it("clamps out-of-range volumes", () => {
    const [high] = desiredAudioStates([track({ id: "a", volume: 5 })], { masterVolume: 3 });
    expect(high?.volume).toBe(1);
  });
});
