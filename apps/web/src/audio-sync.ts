import type { AudioTrack } from "@open-tabletop/core";

type DisplayAudioTrack = AudioTrack & { deliveryUrl?: string };

export interface DesiredAudioState {
  trackId: string;
  url: string;
  playing: boolean;
  loop: boolean;
  volume: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Maps the campaign's synced track list to the playback state each `<audio>`
 * element should hold. Master volume and mute are applied here so the UI only
 * has to reconcile elements against this output.
 */
export function desiredAudioStates(tracks: readonly AudioTrack[], options: { masterVolume?: number; muted?: boolean } = {}): DesiredAudioState[] {
  const master = options.muted ? 0 : clamp01(options.masterVolume ?? 1);
  return tracks
    .filter((track) => typeof track.url === "string" && track.url.length > 0)
    .map((track) => ({
      trackId: track.id,
      url: (track as DisplayAudioTrack).deliveryUrl ?? track.url,
      playing: Boolean(track.playing),
      loop: track.kind === "sfx" ? false : Boolean(track.loop),
      volume: clamp01(track.volume) * master
    }));
}

export function activeAudioCount(tracks: readonly AudioTrack[]): number {
  return tracks.reduce((count, track) => (track.playing ? count + 1 : count), 0);
}
