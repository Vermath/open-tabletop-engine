import { diceBoxNotation, type DiceCastPlan } from "./dice-3d.js";

export const diceBoxContainerId = "dice-box-stage";
export const physicsDiceLingerMs = 2000;
export const physicsDiceLabelDelayMs = 1700;
export const physicsDiceReadyWaitMs = 3200;
export const physicsDiceBoxConfig = {
  assetPath: "/assets/dice-box/",
  framerate: 1 / 45,
  sounds: false,
  shadows: false,
  light_intensity: 0.75,
  gravity_multiplier: 520,
  strength: 1.15,
  iterationLimit: 700,
  theme_customColorset: {
    name: "arcane-midnight",
    background: "#151226",
    foreground: "#e7d4a8",
    outline: "#08070d",
    texture: "none",
    material: "plastic"
  }
} as const;

export type DiceBoxState = "idle" | "loading" | "ready" | "unavailable";

interface DiceBoxLike {
  initialize(): Promise<unknown>;
  roll(notation: string): Promise<unknown>;
  clearDice(): void;
  disableShadows?(): void;
}

let boxPromise: Promise<DiceBoxLike | null> | null = null;
let readyBox: DiceBoxLike | null = null;
let state: DiceBoxState = "idle";
let clearTimer = 0;

export function diceBoxStatus(): DiceBoxState {
  return state;
}

/**
 * Lazily loads the WebGL dice box so the physics bundle never weighs down first paint.
 * A missing container (the app may still be on its loading screen) is NOT cached as a
 * failure - the next call simply tries again once the shell has rendered.
 */
export function prepareDiceBox(): Promise<DiceBoxLike | null> {
  if (boxPromise) return boxPromise;
  if (typeof document === "undefined" || !document.getElementById(diceBoxContainerId)) return Promise.resolve(null);
  state = "loading";
  boxPromise = (async () => {
    try {
      const mod = await import("@3d-dice/dice-box-threejs");
      const box = new mod.default(`#${diceBoxContainerId}`, physicsDiceBoxConfig);
      await box.initialize();
      box.disableShadows?.();
      readyBox = box;
      state = "ready";
      return box;
    } catch (error) {
      state = "unavailable";
      console.warn("3D physics dice unavailable; using the layered dice cast instead.", error);
      return null;
    }
  })();
  return boxPromise;
}

export async function primePhysicsDiceStage(): Promise<boolean> {
  return Boolean(await prepareDiceBox());
}

export function clearPhysicsDice(): void {
  if (clearTimer && typeof window !== "undefined") {
    window.clearTimeout(clearTimer);
    clearTimer = 0;
  }
  try {
    readyBox?.clearDice();
  } catch (error) {
    console.warn("3D dice cleanup failed.", error);
  }
}

function runPhysicsDiceRoll(box: DiceBoxLike, notation: string, lingerMs: number): boolean {
  if (clearTimer) window.clearTimeout(clearTimer);
  box
    .roll(notation)
    .then(() => {
      clearTimer = window.setTimeout(() => {
        box.clearDice();
        clearTimer = 0;
      }, lingerMs);
    })
    .catch((error) => {
      console.warn("3D dice roll failed.", error);
      clearTimer = window.setTimeout(() => {
        box.clearDice();
        clearTimer = 0;
      }, 1200);
    });
  return true;
}

async function waitForReadyDiceBox(maxWaitMs: number): Promise<DiceBoxLike | null> {
  if (readyBox) return readyBox;
  const pendingBox = prepareDiceBox();
  if (maxWaitMs <= 0) return pendingBox;
  let timeoutId = 0;
  try {
    return await Promise.race([
      pendingBox,
      new Promise<null>((resolve) => {
        timeoutId = window.setTimeout(() => resolve(null), maxWaitMs);
      })
    ]);
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
  }
}

/** Waits briefly for a warming dice box so cold-start rolls do not immediately downgrade. */
export async function castPhysicsDiceWhenReady(plan: DiceCastPlan, lingerMs = physicsDiceLingerMs, maxWaitMs = physicsDiceReadyWaitMs): Promise<boolean> {
  const notation = diceBoxNotation(plan);
  if (!notation) return false;
  const box = await waitForReadyDiceBox(maxWaitMs);
  if (!box) return false;
  return runPhysicsDiceRoll(box, notation, lingerMs);
}
