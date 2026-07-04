

export function HpBar(props: { current?: number; max?: number; canEdit: boolean; onAdjust(delta: number): void }) {
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
      {props.canEdit && (
        <div className="hp-bar-steppers" role="group" aria-label="Adjust hit points">
          <button className="hp-step hp-step-damage" type="button" aria-label="Take 5 damage" onClick={() => props.onAdjust(-5)}>-5</button>
          <button className="hp-step hp-step-damage" type="button" aria-label="Take 1 damage" onClick={() => props.onAdjust(-1)}>-1</button>
          <button className="hp-step hp-step-heal" type="button" aria-label="Heal 1" onClick={() => props.onAdjust(1)}>+1</button>
          <button className="hp-step hp-step-heal" type="button" aria-label="Heal 5" onClick={() => props.onAdjust(5)}>+5</button>
        </div>
      )}
    </div>
  );
}
