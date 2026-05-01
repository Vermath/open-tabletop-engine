import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { emptyState, seedState, type EngineState } from "@open-tabletop/core";

export interface StateStore {
  state: EngineState;
  save(): void;
  replace(state: EngineState): void;
}

export class FileStateStore implements StateStore {
  state: EngineState;

  constructor(private readonly filePath = resolve(process.cwd(), "storage", "state.json")) {
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
      const seeded = seedState();
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
