export function nextRevisionTimestamp(current: string, ...otherRevisions: string[]): string {
  let next = Date.now();
  for (const revision of [current, ...otherRevisions]) {
    const time = Date.parse(revision);
    if (time >= next) next = time + 1;
  }
  return new Date(next).toISOString();
}
