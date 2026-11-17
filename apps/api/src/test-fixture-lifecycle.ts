export type ClosableTestFixture = {
  close(): Promise<unknown> | unknown;
};

export type FixtureCleanupFailure = {
  label: string;
  message: string;
};

export type FixtureCleanupResult = {
  closed: string[];
  failures: FixtureCleanupFailure[];
};

export class TestFixtureRegistry<T extends ClosableTestFixture> {
  readonly #fixtures = new Map<T, string>();
  #sequence = 0;

  track(fixture: T, label = `fixture-${++this.#sequence}`): T {
    this.#fixtures.set(fixture, label);
    return fixture;
  }

  release(fixture: T): void {
    this.#fixtures.delete(fixture);
  }

  pendingLabels(): string[] {
    return [...this.#fixtures.values()].sort();
  }

  async closeAll(timeoutMs: number): Promise<FixtureCleanupResult> {
    const entries = [...this.#fixtures.entries()];
    const settled = await Promise.all(entries.map(async ([fixture, label]) => {
      try {
        await boundedClose(fixture, timeoutMs, label);
        return { label };
      } catch (error) {
        return { label, error };
      } finally {
        this.#fixtures.delete(fixture);
      }
    }));
    return {
      closed: settled.filter((item) => !("error" in item)).map((item) => item.label).sort(),
      failures: settled
        .filter((item): item is { label: string; error: unknown } => "error" in item)
        .map(({ label, error }) => ({ label, message: error instanceof Error ? error.message : String(error) }))
        .sort((left, right) => left.label.localeCompare(right.label))
    };
  }
}

async function boundedClose(fixture: ClosableTestFixture, timeoutMs: number, label: string): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} did not close within ${timeoutMs}ms`)), timeoutMs);
    timeout.unref?.();
  });
  try {
    await Promise.race([Promise.resolve().then(() => fixture.close()), deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
