export interface WorkspaceRequestIdentity {
  campaignId: string;
  userId: string;
}

export interface WorkspaceBoundRequest extends WorkspaceRequestIdentity {
  controller: AbortController;
}

export async function settleWorkspaceBoundAction<T>(
  request: WorkspaceBoundRequest,
  isCurrent: (request: WorkspaceBoundRequest) => boolean,
  task: (request: WorkspaceBoundRequest) => Promise<T>,
  onCurrentResult: (
    result: T,
    request: WorkspaceBoundRequest,
  ) => void | Promise<void>,
  finish: (request: WorkspaceBoundRequest) => void,
): Promise<void> {
  try {
    const result = await task(request);
    if (!isCurrent(request)) return;
    await onCurrentResult(result, request);
  } catch (error) {
    if (isCurrent(request)) throw error;
  } finally {
    finish(request);
  }
}
