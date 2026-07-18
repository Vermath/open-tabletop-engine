

export type HitPointEditDecision =
  | { kind: "commit"; value: number }
  | { kind: "review-damage"; value: number }
  | { kind: "reset"; value: number };

export function resolveHitPointEdit(current: number, max: number, requested: number, damageRequiresReview: boolean): HitPointEditDecision {
  const safeCurrent = Math.max(0, Math.min(Math.max(0, Math.floor(max)), Math.floor(current)));
  if (!Number.isFinite(requested)) return { kind: "reset", value: safeCurrent };
  const safeRequested = Math.max(0, Math.min(Math.max(0, Math.floor(max)), Math.floor(requested)));
  if (damageRequiresReview && safeRequested < safeCurrent) return { kind: "review-damage", value: safeCurrent };
  if (safeRequested === safeCurrent) return { kind: "reset", value: safeCurrent };
  return { kind: "commit", value: safeRequested };
}

export function HpBar(props: { current?: number; max?: number; canEdit: boolean; damageRequiresReview?: boolean; onAdjust(delta: number): void; onReviewDamage?(): void }) {
  const max = Math.max(0, Math.round(props.max ?? 0));
  const current = Math.max(0, Math.round(props.current ?? 0));
  const ratio = max > 0 ? Math.min(1, current / max) : 0;
  const tone = max === 0 ? "unknown" : ratio <= 0.25 ? "danger" : ratio <= 0.5 ? "warning" : "healthy";
  return (
    <div className="hp-bar" aria-label={`Hit points ${props.current ?? "?"} of ${props.max ?? "?"}`}>
      <div className="hp-bar-track" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={current}>
        <div className={`hp-bar-fill ${tone}`} style={{ width: `${max > 0 ? Math.round(ratio * 100) : 0}%` }} />
        <span className="hp-bar-value">{props.current ?? "?"} / {props.max ?? "?"}</span>
      </div>
      {props.damageRequiresReview && (
        <p className="admin-status" role="note">D&amp;D damage uses Reviewed typed damage so defenses, temporary HP, death saves, and combat state are applied together.</p>
      )}
      {props.canEdit && (
        <div className="hp-bar-steppers" role="group" aria-label="Adjust hit points">
          {props.damageRequiresReview ? (
            <button className="hp-step hp-step-damage" type="button" aria-label="Open reviewed typed damage" onClick={props.onReviewDamage}>Review damage</button>
          ) : (
            <>
              <button className="hp-step hp-step-damage" type="button" aria-label="Take 5 damage" onClick={() => props.onAdjust(-5)}>-5</button>
              <button className="hp-step hp-step-damage" type="button" aria-label="Take 1 damage" onClick={() => props.onAdjust(-1)}>-1</button>
            </>
          )}
          <button className="hp-step hp-step-heal" type="button" aria-label="Heal 1" onClick={() => props.onAdjust(1)}>+1</button>
          <button className="hp-step hp-step-heal" type="button" aria-label="Heal 5" onClick={() => props.onAdjust(5)}>+5</button>
        </div>
      )}
    </div>
  );
}
