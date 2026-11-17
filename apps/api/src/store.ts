import { randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { emptyState, normalizeEngineState, seedState, type EngineState } from "@open-tabletop/core";
import { assertDeclarativeSystemState, assertDeclarativeSystemStateCandidate, DeclarativeSystemStateError } from "./declarative-system-state.js";

export interface StateStore {
  state: EngineState;
  save(): void;
  flush?(): void;
  replace(state: EngineState, options?: { flush?: boolean }): void;
  /** Restore the last successfully persisted state without serializing a request-wide clone. */
  restoreDurableState?(): void;
  readiness?(): { ok: boolean; reason?: string } | Promise<{ ok: boolean; reason?: string }>;
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

export class CoalescedStateWriter {
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly unregisterShutdownFlush: () => void;

  constructor(private readonly writeNow: () => void, private readonly delayMs = 35) {
    this.unregisterShutdownFlush = registerShutdownFlush(this);
  }

  save(): void {
    this.dirty = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      // A throw here would be an uncaught exception in timer context and
      // crash the process. Retry I/O failures later; schema failures restore
      // accepted state and must never leave an invalid candidate pending.
      try {
        this.flush();
      } catch (error) {
        this.dirty = !(error instanceof DeclarativeSystemStateError);
        console.error(this.dirty ? "Deferred state flush failed; will retry on next save or flush" : "Invalid declarative state discarded", error);
      }
    }, this.delayMs);
    this.timer.unref?.();
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (!this.dirty) return;
    try {
      this.writeNow();
      this.dirty = false;
    } catch (error) {
      // Retry pending state after transient I/O failure. Invalid declarative
      // candidates have already been restored and must be discarded.
      this.dirty = !(error instanceof DeclarativeSystemStateError);
      throw error;
    }
  }

  close(): void {
    this.flush();
    this.unregisterShutdownFlush();
  }

  discard(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.dirty = false;
  }
}

export class FileStateStore implements StateStore {
  state: EngineState;
  private readonly writer: CoalescedStateWriter;
  private acceptedState: EngineState;
  private acceptedContents: string;

  constructor(private readonly filePath = resolve(process.cwd(), "storage", "state.json"), private readonly options: StoreSeedOptions = {}) {
    this.state = this.load();
    assertDeclarativeSystemState(this.state);
    this.acceptedContents = JSON.stringify(this.state, null, 2);
    this.acceptedState = JSON.parse(this.acceptedContents) as EngineState;
    this.writer = new CoalescedStateWriter(() => this.writeNow());
  }

  save(): void {
    this.writer.save();
  }

  flush(): void {
    this.writer.flush();
  }

  replace(state: EngineState, options: { flush?: boolean } = {}): void {
    this.state = normalizeEngineState(state);
    this.save();
    if (options.flush !== false) this.flush();
  }

  restoreDurableState(): void {
    this.writer.discard();
    this.state = JSON.parse(this.acceptedContents) as EngineState;
  }

  close(): void {
    this.writer.close();
  }

  private writeNow(): void {
    // Reuse the one complete file serialization for validation and rollback.
    try {
      assertDeclarativeSystemStateCandidate(this.acceptedState, this.state);
    } catch (error) {
      if (error instanceof DeclarativeSystemStateError) this.restoreDurableState();
      throw error;
    }
    const contents = JSON.stringify(this.state, null, 2);
    writeStateFile(this.filePath, contents);
    this.acceptedContents = contents;
    this.acceptedState = JSON.parse(contents) as EngineState;
  }

  private load(): EngineState {
    if (!existsSync(this.filePath)) {
      const seeded = demoSeedEnabled(this.options) ? seedState() : emptyState();
      assertDeclarativeSystemState(seeded);
      writeStateFile(this.filePath, JSON.stringify(seeded, null, 2));
      return seeded;
    }
    const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as Partial<EngineState>;
    return normalizeEngineState(parsed);
  }
}

export class MemoryStateStore implements StateStore {
  state: EngineState;
  private acceptedState: EngineState;
  private dirty = false;

  constructor(state: EngineState = seedState()) {
    this.state = normalizeEngineState(state);
    assertDeclarativeSystemState(this.state);
    this.acceptedState = structuredClone(this.state);
  }

  save(): void {
    this.dirty = true;
  }

  flush(): void {
    if (!this.dirty) return;
    try {
      assertDeclarativeSystemStateCandidate(this.acceptedState, this.state);
      this.acceptedState = structuredClone(this.state);
      this.dirty = false;
    } catch (error) {
      if (error instanceof DeclarativeSystemStateError) this.restoreDurableState();
      throw error;
    }
  }

  replace(state: EngineState, options: { flush?: boolean } = {}): void {
    this.state = normalizeEngineState(state);
    this.save();
    if (options.flush !== false) this.flush();
  }

  restoreDurableState(): void {
    this.dirty = false;
    this.state = structuredClone(this.acceptedState);
  }
}

function writeStateFile(filePath: string, contents: string): void {
  const directory = dirname(filePath);
  mkdirSync(directory, { recursive: true });
  const tempPath = join(directory, `.${basename(filePath)}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`);
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

const shutdownFlushStores = new Set<{ flush(): void }>();
let shutdownFlushInstalled = false;

function registerShutdownFlush(store: { flush(): void }): () => void {
  shutdownFlushStores.add(store);
  if (!shutdownFlushInstalled) {
    shutdownFlushInstalled = true;
    process.on("beforeExit", flushRegisteredStores);
    process.on("exit", flushRegisteredStores);
  }
  return () => {
    shutdownFlushStores.delete(store);
  };
}

function flushRegisteredStores(): void {
  for (const store of shutdownFlushStores) {
    store.flush();
  }
}
