import { WandSparkles } from "lucide-react";
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
