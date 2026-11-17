export class SessionCredentialCommitQueue {
  private tail: Promise<void> = Promise.resolve();
  private generation = 0;

  begin(): number {
    this.generation += 1;
    return this.generation;
  }

  invalidate(): void {
    this.generation += 1;
  }

  isCurrent(ticket: number): boolean {
    return ticket === this.generation;
  }

  run<T>(ticket: number, operation: (isCurrent: () => boolean) => Promise<T>): Promise<T | undefined> {
    const execute = async (): Promise<T | undefined> => {
      if (!this.isCurrent(ticket)) return undefined;
      return operation(() => this.isCurrent(ticket));
    };
    const result = this.tail.then(execute, execute);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
}
