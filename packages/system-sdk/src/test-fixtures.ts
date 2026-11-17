/** Adds a fixed test timestamp to a fixture whose identity is supplied by the test. */
export function timestampedFixture<T extends { id: string }>(record: T): T & { createdAt: string; updatedAt: string } {
  const timestamp = "2026-07-01T00:00:00.000Z";
  return { ...record, createdAt: timestamp, updatedAt: timestamp };
}
