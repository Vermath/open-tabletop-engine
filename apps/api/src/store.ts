import { randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
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
    writeStateFile(this.filePath, this.state);
  }

  replace(state: EngineState): void {
    this.state = state;
    this.save();
  }

  private load(): EngineState {
    if (!existsSync(this.filePath)) {
      const seeded = demoSeedEnabled(this.options) ? seedState() : emptyState();
      writeStateFile(this.filePath, seeded);
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

function writeStateFile(filePath: string, state: EngineState): void {
  const directory = dirname(filePath);
  mkdirSync(directory, { recursive: true });
  const tempPath = join(directory, `.${basename(filePath)}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`);
  const contents = JSON.stringify(state, null, 2);
  let fileDescriptor: number | undefined;

  try {
    fileDescriptor = openSync(tempPath, "wx");
    writeFileSync(fileDescriptor, contents, "utf8");
    fsyncSync(fileDescriptor);
    closeSync(fileDescriptor);
    fileDescriptor = undefined;
    renameSync(tempPath, filePath);
    fsyncDirectoryBestEffort(directory);
  } catch (error) {
    if (fileDescriptor !== undefined) {
      try {
        closeSync(fileDescriptor);
      } catch {
        // Preserve the original write or replace error.
      }
    }
    rmSync(tempPath, { force: true });
    throw error;
  }
}

function fsyncDirectoryBestEffort(directory: string): void {
  let directoryDescriptor: number | undefined;
  try {
    directoryDescriptor = openSync(directory, "r");
    fsyncSync(directoryDescriptor);
  } catch {
    // Directory fsync is not available on all platforms, especially Windows.
  } finally {
    if (directoryDescriptor !== undefined) {
      try {
        closeSync(directoryDescriptor);
      } catch {
        // Directory fsync is best-effort only.
      }
    }
  }
}
