export async function settleWorkspaceLoreLoad<T>(
  load: Promise<T>,
  requestIsCurrent: () => boolean,
  onSuccess: (value: T) => void,
  onError: (error: unknown) => void
): Promise<void> {
  try {
    const value = await load;
    if (requestIsCurrent()) onSuccess(value);
  } catch (error) {
    if (requestIsCurrent()) onError(error);
  }
}
