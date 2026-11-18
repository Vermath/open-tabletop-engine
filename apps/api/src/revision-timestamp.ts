export function nextRevisionTimestamp(current: string): string {
  const now = Date.now();
  const currentTime = Date.parse(current);
  return new Date(Number.isFinite(currentTime) && currentTime >= now ? currentTime + 1 : now).toISOString();
}
