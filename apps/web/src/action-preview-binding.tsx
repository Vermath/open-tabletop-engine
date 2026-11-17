import { WandSparkles, Zap } from "lucide-react";
import type { ActorActionResolutionPreview } from "./actor-action-review.js";
import { actionPreviewContinuationMetadata, actionPreviewForFingerprint, type ActionPreviewState } from "./action-preview-state.js";

/** The commit control derives both readiness and continuation from one exact fingerprint. */
export function ActionPreviewCommitButton(props: {
  state: ActionPreviewState<ActorActionResolutionPreview>;
  fingerprint?: string;
  canCommit: boolean;
  onCommit(): void;
}) {
  const preview = actionPreviewForFingerprint(props.state, props.fingerprint);
  const continuation = actionPreviewContinuationMetadata(preview);
  const ready = Boolean(preview);
  return (
    <button
      className="ghost-button"
      type="button"
      aria-label="Continue to final review for previewed action"
      aria-haspopup="dialog"
      disabled={!props.canCommit || !ready}
      data-continuation-id={ready ? continuation.continuationId : undefined}
      onClick={props.onCommit}
    >
      <WandSparkles size={14} /> Continue to final review
    </button>
  );
}

/**
 * One-step use of the previewed action. It is bound to the same fingerprint as the review button, and the
 * workspace still prepares the exact action on the server before committing it.
 */
export function ActionPreviewUseButton(props: {
  state: ActionPreviewState<ActorActionResolutionPreview>;
  fingerprint?: string;
  canCommit: boolean;
  onUse(): void;
}) {
  const preview = actionPreviewForFingerprint(props.state, props.fingerprint);
  const continuation = actionPreviewContinuationMetadata(preview);
  const ready = Boolean(preview);
  return (
    <button
      className="primary-button"
      type="button"
      aria-label="Use previewed action now"
      title="Commit at once when fully resolved; you can undo it"
      disabled={!props.canCommit || !ready}
      data-continuation-id={ready ? continuation.continuationId : undefined}
      onClick={props.onUse}
    >
      <Zap size={14} /> Use action
    </button>
  );
}
