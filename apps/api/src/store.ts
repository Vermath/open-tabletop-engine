import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { emptyState, seedState, type EngineState } from "@open-tabletop/core";

export interface StateStore {
  state: EngineState;
  save(): void;
  replace(state: EngineState): void;
}

export interface StoreSeedOptions {
  seedDemo?: boolean;
}

export function demoSeedEnabled(options: StoreSeedOptions = {}): boolean {
  if (options.seedDemo !== undefined) return options.seedDemo;
  const value = process.env.OTTE_DEMO_SEED?.trim().toLowerCase();
  if (value && ["0", "false", "no", "off"].includes(value)) return false;
  if (value && ["1", "true", "yes", "on"].includes(value)) return true;
  return process.env.NODE_ENV !== "production";
}

export class FileStateStore implements StateStore {
  state: EngineState;

  constructor(private readonly filePath = resolve(process.cwd(), "storage", "state.json"), private readonly options: StoreSeedOptions = {}) {
    this.state = this.load();
  }

  save(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.state, null, 2));
  }

  replace(state: EngineState): void {
    this.state = state;
    this.save();
  }

  private load(): EngineState {
    if (!existsSync(this.filePath)) {
      const seeded = demoSeedEnabled(this.options) ? seedState() : emptyState();
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, JSON.stringify(seeded, null, 2));
      return seeded;
    }
    const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as Partial<EngineState>;
    return { ...emptyState(), ...parsed };
  }
}

export class MemoryStateStore implements StateStore {
  constructor(public state: EngineState = seedState()) {}

  save(): void {}

  replace(state: EngineState): void {
    this.state = state;
  }
}
