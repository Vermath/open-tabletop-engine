export const testTimeoutDiagnosticMarker = "OTTE_TEST_TIMEOUT_DIAGNOSTIC";

export type ActiveResourceSnapshot = Record<string, number>;

export type TestTimeoutDiagnostic = {
  kind: "test_timeout";
  file: string;
  test: string;
  elapsedMs: number;
  timeoutMs: number;
  signalAborted: boolean;
  activeResources: ActiveResourceSnapshot;
  addedResources: ActiveResourceSnapshot;
};

export function activeResourceSnapshot(resources = availableActiveResources()): ActiveResourceSnapshot {
  const counts: ActiveResourceSnapshot = {};
  for (const resource of resources) counts[resource] = (counts[resource] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

export function addedActiveResources(
  baseline: ActiveResourceSnapshot,
  current: ActiveResourceSnapshot
): ActiveResourceSnapshot {
  const added: ActiveResourceSnapshot = {};
  for (const [resource, count] of Object.entries(current)) {
    const delta = count - (baseline[resource] ?? 0);
    if (delta > 0) added[resource] = delta;
  }
  return added;
}

export function createTestTimeoutDiagnostic(input: {
  file: string;
  test: string;
  startedAtMs: number;
  timeoutMs: number;
  signalAborted: boolean;
  baseline: ActiveResourceSnapshot;
  current?: ActiveResourceSnapshot;
  nowMs?: number;
}): TestTimeoutDiagnostic {
  const current = input.current ?? activeResourceSnapshot();
  return {
    kind: "test_timeout",
    file: input.file.replaceAll("\\", "/"),
    test: input.test,
    elapsedMs: Math.max(0, Math.round((input.nowMs ?? Date.now()) - input.startedAtMs)),
    timeoutMs: input.timeoutMs,
    signalAborted: input.signalAborted,
    activeResources: current,
    addedResources: addedActiveResources(input.baseline, current)
  };
}

export function formatTestTimeoutDiagnostic(diagnostic: TestTimeoutDiagnostic): string {
  return `${testTimeoutDiagnosticMarker} ${JSON.stringify(diagnostic)}`;
}

export function parseTestTimeoutDiagnostics(output: string): {
  diagnostics: TestTimeoutDiagnostic[];
  parseErrors: string[];
} {
  const diagnostics: TestTimeoutDiagnostic[] = [];
  const parseErrors: string[] = [];
  for (const rawLine of stripAnsi(output).split(/\r?\n/)) {
    const markerIndex = rawLine.indexOf(`${testTimeoutDiagnosticMarker} `);
    if (markerIndex < 0) continue;
    const encoded = rawLine.slice(markerIndex + testTimeoutDiagnosticMarker.length + 1).trim();
    try {
      const parsed = JSON.parse(encoded) as TestTimeoutDiagnostic;
      if (!validTestTimeoutDiagnostic(parsed)) throw new Error("invalid diagnostic shape");
      diagnostics.push(parsed);
    } catch (error) {
      parseErrors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return { diagnostics, parseErrors };
}

export function failureLooksTimedOut(errors: readonly unknown[] | undefined): boolean {
  return (errors ?? []).some((error) => /timed?\s*out|timeout/i.test(errorText(error)));
}

function availableActiveResources(): string[] {
  return typeof process.getActiveResourcesInfo === "function" ? process.getActiveResourcesInfo() : [];
}

function validTestTimeoutDiagnostic(value: TestTimeoutDiagnostic): boolean {
  return value?.kind === "test_timeout"
    && typeof value.file === "string"
    && typeof value.test === "string"
    && Number.isInteger(value.elapsedMs)
    && Number.isInteger(value.timeoutMs)
    && typeof value.signalAborted === "boolean"
    && validSnapshot(value.activeResources)
    && validSnapshot(value.addedResources);
}

function validSnapshot(value: ActiveResourceSnapshot): boolean {
  return Boolean(value)
    && typeof value === "object"
    && Object.values(value).every((count) => Number.isInteger(count) && count >= 0);
}

function errorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (error && typeof error === "object") {
    const candidate = error as { name?: unknown; message?: unknown };
    return [candidate.name, candidate.message].filter((value) => typeof value === "string").join("\n");
  }
  return String(error);
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
}
