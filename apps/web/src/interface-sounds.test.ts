import { describe, expect, it, vi } from "vitest";
import { createInterfaceSoundPlayer, defaultInterfaceSounds } from "./interface-sounds.js";

describe("interface sounds", () => {
  it("defaults to a quiet enabled setting", () => {
    expect(defaultInterfaceSounds.enabled).toBe(true);
    expect(defaultInterfaceSounds.volume).toBeLessThan(0.3);
  });
  it("leaves the audio context unopened when a cue is muted or gesture-gated", () => {
    const create = vi.fn(() => { throw new Error("unexpected audio context"); });
    const player = createInterfaceSoundPlayer(create);
    player.play("ping", 0.2, false);
    player.play("dice", 0, true);
    expect(create).not.toHaveBeenCalled();
  });
});
