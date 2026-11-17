import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "./sheet-format.js";

export interface RetryableActionFailure {
  kind: "pending" | "error";
  label: string;
  message: string;
  retry?: () => Promise<void>;
}

export function retryableActionError(label: string, error: unknown): string {
  return `${label} failed: ${errorMessage(error)}`;
}

export function useRetryableAction(scopeKey?: string) {
  const [operation, setOperation] = useState<RetryableActionFailure>();
  const generationRef = useRef(0);

  useEffect(() => {
    generationRef.current += 1;
    setOperation(undefined);
  }, [scopeKey]);

  const runAction = useCallback(async (label: string, action: () => Promise<void>): Promise<void> => {
    const generation = generationRef.current;
    setOperation({ kind: "pending", label, message: `${label}...` });
    try {
      await action();
      if (generation === generationRef.current) setOperation(undefined);
    } catch (error) {
      if (generation !== generationRef.current) return;
      setOperation({
        kind: "error",
        label,
        message: retryableActionError(label, error),
        retry: () => runAction(label, action)
      });
    }
  }, []);

  return {
    operation,
    runAction,
    retryAction: operation?.retry,
    clearAction: () => setOperation(undefined)
  };
}

export function RetryableActionNotice(props: {
  operation?: RetryableActionFailure;
  onRetry?(): void;
  onDismiss(): void;
  className?: string;
}) {
  if (!props.operation) return null;
  const failed = props.operation.kind === "error";
  return (
    <div
      className={props.className ? `import-status ${props.className}` : "import-status"}
      role={failed ? "alert" : "status"}
      aria-live={failed ? "assertive" : "polite"}
      aria-atomic="true"
    >
      <strong>{failed ? "Action failed" : "Updating"}</strong>
      <span>{props.operation.message}</span>
      {failed && (
        <span className="admin-actions">
          {props.onRetry && (
            <button className="ghost-button small" type="button" onClick={props.onRetry}>
              Retry
            </button>
          )}
          <button className="ghost-button small" type="button" onClick={props.onDismiss}>
            Dismiss
          </button>
        </span>
      )}
    </div>
  );
}
