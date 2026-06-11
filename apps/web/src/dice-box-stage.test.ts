import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DiceCastPlan } from "./dice-3d.js";
import { castPhysicsDiceWhenReady, diceBoxContainerId, diceBoxStatus, physicsDiceBoxConfig, physicsDiceLingerMs, primePhysicsDiceStage } from "./dice-box-stage.js";

const diceBoxMock = vi.hoisted(() => {
  let initializeResolve: (() => void) | null = null;
  const instances: Array<{
    selector: string;
    config: unknown;
    initialize: ReturnType<typeof vi.fn>;
    roll: ReturnType<typeof vi.fn>;
    clearDice: ReturnType<typeof vi.fn>;
    disableShadows: ReturnType<typeof vi.fn>;
  }> = [];

  class MockDiceBox {
    selector: string;
    config: unknown;
    initialize = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          initializeResolve = resolve;
        })
    );
    roll = vi.fn(async () => undefined);
    clearDice = vi.fn();
    disableShadows = vi.fn();

    constructor(selector: string, config: unknown) {
      this.selector = selector;
      this.config = config;
      instances.push(this);
    }
  }

  return {
    MockDiceBox,
    instances,
    reset() {
      initializeResolve = null;
      instances.length = 0;
    },
    resolveInitialize() {
      initializeResolve?.();
    }
  };
});

vi.mock("@3d-dice/dice-box-threejs", () => ({ default: diceBoxMock.MockDiceBox }));

describe("physics dice stage config", () => {
  beforeEach(() => {
    diceBoxMock.reset();
    vi.stubGlobal("document", { getElementById: vi.fn(() => ({ id: diceBoxContainerId })) });
    vi.stubGlobal("window", {
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      setTimeout: globalThis.setTimeout.bind(globalThis)
    });
  });

  it("uses a lightweight WebGL profile for optional physics rolls", () => {
    expect(physicsDiceBoxConfig.sounds).toBe(false);
    expect(physicsDiceBoxConfig.shadows).toBe(false);
    expect(physicsDiceBoxConfig.framerate).toBe(1 / 45);
    expect(physicsDiceBoxConfig.strength).toBeLessThan(1.6);
    expect(physicsDiceLingerMs).toBeLessThanOrEqual(2200);
  });

  it("preloads the dice box and lets a first roll wait for initialization", async () => {
    const preload = primePhysicsDiceStage();
    expect(diceBoxStatus()).toBe("loading");
    await vi.waitFor(() => expect(diceBoxMock.instances).toHaveLength(1));

    const roll = castPhysicsDiceWhenReady(testCastPlan(), 10, 500);
    await Promise.resolve();
    expect(diceBoxMock.instances[0]?.roll).not.toHaveBeenCalled();

    diceBoxMock.resolveInitialize();

    await expect(preload).resolves.toBe(true);
    await expect(roll).resolves.toBe(true);
    expect(diceBoxMock.instances[0]?.roll).toHaveBeenCalledWith("1d6@4");
    expect(diceBoxStatus()).toBe("ready");
  });
});

function testCastPlan(): DiceCastPlan {
  return {
    rollId: "roll_test",
    label: "Test roll",
    formula: "1d6",
    total: 4,
    highlight: null,
    settleMs: 900,
    ttlMs: 2400,
    dice: [
      {
        id: "roll_test-0",
        sides: 6,
        value: 4,
        kept: true,
        delayMs: 0,
        spinXTurns: 1,
        spinYTurns: 1,
        fromXVmin: -30,
        fromYVmin: -8,
        restTiltDeg: 0
      }
    ]
  };
}
