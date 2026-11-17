import type { Actor, Combat, Combatant, Scene, Token, UserPreferences } from "@open-tabletop/core";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

export const defaultInterfaceSounds = { enabled: true, volume: 0.24 };
export type InterfaceCue = "dice" | "turn" | "ping";
export type InterfaceSoundSave = { isCurrent(): boolean; onSaved(): void };

export function interfaceTurnKey(combat?: Pick<Combat, "id" | "round">, combatant?: Pick<Combatant, "id">) {
  return combat && combatant ? JSON.stringify([combat.id, combat.round, combatant.id]) : undefined;
}

const cues: Record<InterfaceCue, readonly (readonly [frequency: number, delay: number, duration: number])[]> = {
  dice: [[155, 0, 0.035], [118, 0.055, 0.06], [83, 0.12, 0.07]],
  turn: [[440, 0, 0.13], [659, 0.08, 0.22]],
  ping: [[587, 0, 0.14], [784, 0.04, 0.13]],
};

export function createInterfaceSoundPlayer(createContext: () => AudioContext) {
  let context: AudioContext | undefined;
  return {
    play(cue: InterfaceCue, volume: number, allowed: boolean) {
      if (!allowed || volume <= 0) return;
      context ??= createContext();
      const audio = context;
      const start = audio.currentTime + 0.015;
      void audio.resume().catch(() => undefined);
      for (const [frequency, delay, duration] of cues[cue]) {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        const at = start + delay;
        oscillator.type = cue === "dice" ? "triangle" : "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * 0.13), at + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
        oscillator.connect(gain).connect(audio.destination);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(at);
        oscillator.stop(at + duration);
      }
    },
    close() {
      void context?.close().catch(() => undefined);
      context = undefined;
    },
  };
}

export function useInterfaceSounds(input: {
  preferences: UserPreferences["interfaceSounds"];
  masterVolume: number;
  muted: boolean;
  scene?: Scene;
  userId: string;
  combat?: Combat;
  combatant?: Combatant;
  tokens: readonly Token[];
  actors: readonly Actor[];
  onSettingsChange(settings: NonNullable<UserPreferences["interfaceSounds"]>, save: InterfaceSoundSave): void;
}) {
  const savedSettings = input.preferences ?? defaultInterfaceSounds;
  const [override, setOverride] = useState<{ userId: string; enabled: boolean }>();
  const overrideRef = useRef(override);
  const toggleVersion = useRef(0);
  const settings = override?.userId === input.userId ? { ...savedSettings, enabled: override.enabled } : savedSettings;
  const latest = useRef({ ...input, settings });
  useLayoutEffect(() => {
    latest.current = { ...input, settings };
    if (overrideRef.current?.userId !== input.userId) overrideRef.current = undefined;
  });
  useEffect(() => {
    setOverride((current) => current?.userId === input.userId ? current : undefined);
  }, [input.userId]);
  const player = useRef<ReturnType<typeof createInterfaceSoundPlayer> | undefined>(undefined);
  function applySavedSettings(userId: string, preferences: UserPreferences["interfaceSounds"], savedToggleVersion: number) {
    if (latest.current.userId !== userId || toggleVersion.current !== savedToggleVersion) return;
    const next = preferences ?? defaultInterfaceSounds;
    latest.current.settings = next;
    overrideRef.current = undefined;
    setOverride((current) => current?.userId === userId ? undefined : current);
    if (!next.enabled) player.current?.close();
  }
  function toggle() {
    const enabled = !latest.current.settings.enabled;
    const next = { ...latest.current.settings, enabled };
    const override = { userId: input.userId, enabled };
    toggleVersion.current += 1;
    latest.current.settings = next;
    overrideRef.current = override;
    setOverride(override);
    if (!enabled) player.current?.close();
    input.onSettingsChange(next, {
      isCurrent: () => overrideRef.current === override,
      onSaved: () => {
        if (overrideRef.current !== override) return;
        overrideRef.current = undefined;
        setOverride((current) => current === override ? undefined : current);
      },
    });
  }
  const play = useRef((cue: InterfaceCue) => {
    const { settings, muted, masterVolume } = latest.current;
    if (!settings.enabled || muted || document.hidden || !navigator.userActivation?.hasBeenActive || !window.AudioContext) return;
    player.current ??= createInterfaceSoundPlayer(() => new window.AudioContext());
    player.current.play(cue, settings.volume * masterVolume, true);
  }).current;
  useEffect(() => () => { player.current?.close(); }, []);

  const { scene, userId, combat, combatant, actors, tokens } = input;
  const scope = scene?.id + ":" + userId;
  const turn = interfaceTurnKey(combat, combatant);
  const previous = useRef<{ scope: string; turn?: string; pings: Set<string> } | undefined>(undefined);
  useEffect(() => {
    const pings = scene?.annotations.filter((annotation) => annotation.kind === "ping") ?? [];
    const before = previous.current;
    previous.current = { scope, turn, pings: new Set(pings.map(({ id }) => id)) };
    if (!before || before.scope !== scope) return;
    if (turn && turn !== before.turn && combatant) {
      const actor = actors.find(({ id }) => id === combatant.actorId);
      const token = tokens.find(({ id }) => id === combatant.tokenId);
      if (actor?.ownerUserId === userId || token?.ownerUserIds?.includes(userId)) play("turn");
    }
    if (pings.some(({ id, expiresAt }) => !before.pings.has(id) && (!expiresAt || Date.parse(expiresAt) > Date.now()))) play("ping");
  }, [scope, turn, combatant, scene?.annotations, actors, tokens, play, userId]);
  return { settings, toggle, play, applySavedSettings, readToggleVersion: () => toggleVersion.current };
}
