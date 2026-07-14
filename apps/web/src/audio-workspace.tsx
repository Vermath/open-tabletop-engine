import type { AudioTrack } from "@open-tabletop/core";
import { Grip, Hand, Music, Pause, Play, Plus, Trash2, Upload, Volume2, VolumeX, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { activeAudioCount, desiredAudioStates } from "./audio-sync.js";
import { clampFloatingPanel, useMovablePanel } from "./movable-panel.js";
import { RetryableActionNotice, useRetryableAction } from "./retryable-action.js";

const apiBase = import.meta.env.VITE_API_URL ?? "";

export function audioTrackNameFromFile(file: File): string {
  return file.name.replace(/\.[^.]+$/, "").trim() || file.name || "Uploaded audio";
}

function authenticatedAudioUrl(url: string): string {
  if (/^(https?:|data:|blob:)/.test(url)) return url;
  if (!apiBase) return url;
  return `${apiBase.replace(/\/+$/, "")}${url.startsWith("/") ? url : `/${url}`}`;
}

function initialSoundboardPanelSize() {
  return {
    width: Math.min(300, Math.max(260, window.innerWidth - 32)),
    height: Math.min(440, Math.max(320, window.innerHeight - 96))
  };
}

function initialSoundboardPanelPosition() {
  const { width } = initialSoundboardPanelSize();
  const inspectorAllowance = window.innerWidth >= 1180 ? 392 : 0;
  return {
    x: clampFloatingPanel(window.innerWidth - inspectorAllowance - width - 16, window.innerWidth - 48),
    y: clampFloatingPanel(96, window.innerHeight - 48)
  };
}

export function AudioPlaybackLayer(props: { tracks: AudioTrack[]; masterVolume: number; muted: boolean }) {
  const elementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const desired = useMemo(() => desiredAudioStates(props.tracks, { masterVolume: props.masterVolume, muted: props.muted }), [props.masterVolume, props.muted, props.tracks]);

  useEffect(() => {
    const elements = elementsRef.current;
    const desiredIds = new Set(desired.map((state) => state.trackId));
    for (const [id, element] of elements) {
      if (!desiredIds.has(id)) {
        element.pause();
        elements.delete(id);
      }
    }
    for (const state of desired) {
      let element = elements.get(state.trackId);
      if (!element) {
        element = new Audio();
        element.preload = "auto";
        elements.set(state.trackId, element);
      }
      const playbackUrl = authenticatedAudioUrl(state.url);
      if (element.getAttribute("data-otte-src") !== playbackUrl) {
        element.setAttribute("data-otte-src", playbackUrl);
        element.src = playbackUrl;
      }
      element.loop = state.loop;
      element.volume = state.volume;
      if (state.playing && element.paused) {
        // Browsers may block autoplay until a user gesture; the GM's click counts as one.
        void element.play().catch(() => undefined);
      } else if (!state.playing && !element.paused) {
        element.pause();
        element.currentTime = 0;
      }
    }
  }, [desired]);

  useEffect(
    () => () => {
      for (const element of elementsRef.current.values()) element.pause();
      elementsRef.current.clear();
    },
    []
  );

  return null;
}

export function AudioSoundboard(props: {
  tracks: AudioTrack[];
  masterVolume: number;
  muted: boolean;
  onMasterVolumeChange(volume: number): void;
  onToggleMuted(): void;
  onToggleTrack(track: AudioTrack): void;
  onDeleteTrack(track: AudioTrack): void;
  onCreateTrack(input: { name: string; url: string; kind: AudioTrack["kind"]; loop: boolean }): Promise<void>;
  onUploadTrack(file: File, input: { name?: string; kind: AudioTrack["kind"]; loop: boolean }): Promise<void>;
  onClose(): void;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<AudioTrack["kind"]>("ambient");
  const [uploading, setUploading] = useState(false);
  const action = useRetryableAction("audio-soundboard");
  const playingCount = activeAudioCount(props.tracks);
  const soundboardPanel = useMovablePanel(initialSoundboardPanelPosition, initialSoundboardPanelSize, { minWidth: 260, minHeight: 320 });

  const submit = async () => {
    if (!name.trim() || !url.trim()) return;
    await props.onCreateTrack({ name: name.trim(), url: url.trim(), kind, loop: kind !== "sfx" });
    setName("");
    setUrl("");
  };

  const uploadFile = async (file: File, input: HTMLInputElement) => {
    setUploading(true);
    try {
      await props.onUploadTrack(file, { name: name.trim() || audioTrackNameFromFile(file), kind, loop: kind !== "sfx" });
      setName("");
      setUrl("");
    } finally {
      input.value = "";
      setUploading(false);
    }
  };

  return (
    <aside className="audio-soundboard movable-panel" aria-label="Soundboard" style={soundboardPanel.style} {...soundboardPanel.panelProps}>
      <header className="audio-soundboard-header floating-panel-header" title="Drag panel" {...soundboardPanel.dragHandleProps}>
        <Hand className="floating-panel-drag-icon" size={14} aria-hidden="true" />
        <div className="section-title">
          <Music size={16} /> Soundboard
        </div>
        <button className="icon-button" type="button" aria-label="Close soundboard" title="Close" onClick={props.onClose}>
          <X size={16} />
        </button>
      </header>
      <RetryableActionNotice
        operation={action.operation}
        onRetry={action.retryAction ? () => void action.retryAction?.() : undefined}
        onDismiss={action.clearAction}
      />
      <div className="audio-soundboard-master">
        <button className="icon-button" type="button" aria-label={props.muted ? "Unmute" : "Mute"} title={props.muted ? "Unmute" : "Mute"} onClick={props.onToggleMuted}>
          {props.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
        <input type="range" min={0} max={1} step={0.05} value={props.masterVolume} aria-label="Master volume" onChange={(event) => props.onMasterVolumeChange(Number(event.target.value))} />
        <span className="audio-soundboard-count">{playingCount} playing</span>
      </div>
      <ul className="audio-soundboard-list">
        {props.tracks.length === 0 ? <li className="audio-soundboard-empty">No tracks yet. Add a music or ambience URL below.</li> : null}
        {props.tracks.map((track) => (
          <li key={track.id} className={track.playing ? "audio-track playing" : "audio-track"}>
            <button className="icon-button" type="button" aria-label={track.playing ? `Stop ${track.name}` : `Play ${track.name}`} title={track.playing ? "Stop" : "Play"} onClick={() => props.onToggleTrack(track)}>
              {track.playing ? <Pause size={15} /> : <Play size={15} />}
            </button>
            <span className="audio-track-name" title={track.url}>{track.name}</span>
            <span className="audio-track-kind">{track.kind}</span>
            <button className="icon-button" type="button" aria-label={`Delete ${track.name}`} title="Delete" onClick={() => props.onDeleteTrack(track)}>
              <Trash2 size={15} />
            </button>
          </li>
        ))}
      </ul>
      <form
        className="audio-soundboard-add"
        onSubmit={(event) => {
          event.preventDefault();
          void action.runAction("Add audio track", submit);
        }}
      >
        <input value={name} placeholder="Track name" aria-label="Track name" onChange={(event) => setName(event.target.value)} />
        <input value={url} placeholder="https://… or /audio/…" aria-label="Track URL" onChange={(event) => setUrl(event.target.value)} />
        <label className="audio-upload-control">
          <span><Upload size={14} /> Upload audio</span>
          <input
            type="file"
            accept="audio/*"
            aria-label="Upload audio file"
            disabled={uploading}
            onChange={(event) => {
              const input = event.currentTarget;
              const file = input.files?.[0];
              if (file) void action.runAction(`Upload ${file.name}`, () => uploadFile(file, input));
            }}
          />
        </label>
        <div className="audio-soundboard-add-row">
          <select value={kind} aria-label="Track kind" onChange={(event) => setKind(event.target.value as AudioTrack["kind"])}>
            <option value="ambient">Ambience</option>
            <option value="music">Music</option>
            <option value="sfx">Effect</option>
          </select>
          <button className="primary-button" type="submit" disabled={uploading || !name.trim() || !url.trim()}>
            <Plus size={15} /> Add
          </button>
        </div>
      </form>
      <button className="floating-panel-resize-handle" type="button" aria-label="Resize soundboard panel" title="Resize panel" {...soundboardPanel.resizeHandleProps}>
        <Grip size={13} aria-hidden="true" />
      </button>
    </aside>
  );
}
