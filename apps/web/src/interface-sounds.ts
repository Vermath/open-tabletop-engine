import type { Actor, Combat, Combatant, Scene, Token, UserPreferences } from "@open-tabletop/core";
import { useEffect, useLayoutEffect, useRef } from "react";

export const defaultInterfaceSounds = { enabled: true, volume: 0.24 };
export type InterfaceCue = "dice" | "turn" | "ping";

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
}) {
  const latest = useRef(input);
  useLayoutEffect(() => { latest.current = input; });
  const player = useRef<ReturnType<typeof createInterfaceSoundPlayer> | undefined>(undefined);
  const play = useRef((cue: InterfaceCue) => {
    const { preferences = defaultInterfaceSounds, muted, masterVolume } = latest.current;
    if (!preferences.enabled || muted || document.hidden || !navigator.userActivation?.hasBeenActive || !window.AudioContext) return;
    player.current ??= createInterfaceSoundPlayer(() => new window.AudioContext());
    player.current.play(cue, preferences.volume * masterVolume, true);
  }).current;
  useEffect(() => () => { player.current?.close(); }, []);

  const { scene, userId, combat, combatant, actors, tokens } = input;
  const scope = scene?.id + ":" + userId;
  const turn = combat && combatant ? [combat.id, combat.round, combat.turnIndex, combatant.id].join(":") : undefined;
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
  return { settings: input.preferences ?? defaultInterfaceSounds, play };
}
