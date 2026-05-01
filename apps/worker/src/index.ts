export interface WorkerJob {
  id: string;
  type: "campaign.export" | "campaign.import" | "ai.memory.extract" | "ai.session.recap";
  payload: unknown;
}

export function describeJob(job: WorkerJob): string {
  return `${job.type}:${job.id}`;
}
