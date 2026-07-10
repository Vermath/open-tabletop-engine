import type { Actor } from "@open-tabletop/core";
import { HeartPulse, Moon, Sunrise } from "lucide-react";
import { recordValue, stringValue, numericValue, formatNumber } from "./sheet-format.js";

export interface HitDicePoolInfo {
  className: string;
  size: string;
  current: number;
  max: number;
}

export function actorHitDicePools(actor: Actor): HitDicePoolInfo[] {
  if (!Array.isArray(actor.data.hitDicePools)) return [];
  return actor.data.hitDicePools.flatMap((value) => {
    const pool = recordValue(value);
    const className = stringValue(pool.className);
    const size = stringValue(pool.size);
    if (!className || !size) return [];
    const max = Math.max(0, Math.floor(numericValue(pool.max, 0)));
    const current = Math.max(0, Math.min(max, Math.floor(numericValue(pool.current, max))));
    return [{ className, size, current, max }];
  });
}

export function actorAggregateHitDice(actor: Actor): { current: number; max: number; size: string } | undefined {
  const hitDice = recordValue(actor.data.hitDice);
  const max = Math.max(0, Math.floor(numericValue(hitDice.max, 0)));
  const size = stringValue(hitDice.size);
  if (!size && max === 0) return undefined;
  return { current: Math.max(0, Math.min(max, Math.floor(numericValue(hitDice.current, max)))), max, size: size ?? "d8" };
}

export function nextShortRestPool(pools: HitDicePoolInfo[]): HitDicePoolInfo | undefined {
  const dieSize = (pool: HitDicePoolInfo) => Number(pool.size.replace(/^d/i, "")) || 0;
  return pools.filter((pool) => pool.current > 0).sort((left, right) => dieSize(right) - dieSize(left))[0];
}

export function HitDiceRestCard(props: { actor: Actor; canRest: boolean; onRest(restType: "short" | "long"): void }) {
  const pools = actorHitDicePools(props.actor);
  const aggregate = actorAggregateHitDice(props.actor);
  const nextPool = nextShortRestPool(pools);
  if (!aggregate && pools.length === 0) return null;
  return (
    <details className="actor-rest-card">
      <summary>
        <span><HeartPulse size={14} aria-hidden="true" /> Recovery</span>
        <strong>{aggregate ? `${formatNumber(aggregate.current)}/${formatNumber(aggregate.max)} hit dice` : `${formatNumber(pools.reduce((total, pool) => total + pool.current, 0))} hit dice`}</strong>
      </summary>
      <div className="actor-rest-card-body">
        {pools.length > 1 || (!aggregate && pools.length > 0) ? (
          <div className="hit-dice-pools" aria-label="Hit dice by class">
            {pools.map((pool) => (
              <div className={pool.current > 0 ? "hit-die-pool" : "hit-die-pool empty"} key={pool.className}>
                <span>{pool.className}</span>
                <strong>{formatNumber(pool.current)}/{formatNumber(pool.max)}{pool.size}</strong>
                <div className="hit-die-meter" role="meter" aria-label={`${pool.className} ${pool.size} hit dice`} aria-valuemin={0} aria-valuemax={pool.max} aria-valuenow={pool.current}>
                  <span style={{ width: `${pool.max > 0 ? Math.round((pool.current / pool.max) * 100) : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        ) : aggregate ? (
          <div className="hit-die-pool">
            <span>Hit dice</span>
            <strong>{formatNumber(aggregate.current)}/{formatNumber(aggregate.max)}{aggregate.size}</strong>
            <div className="hit-die-meter" role="meter" aria-label={`${aggregate.size} hit dice`} aria-valuemin={0} aria-valuemax={aggregate.max} aria-valuenow={aggregate.current}>
              <span style={{ width: `${aggregate.max > 0 ? Math.round((aggregate.current / aggregate.max) * 100) : 0}%` }} />
            </div>
          </div>
        ) : null}
        <p className="account-summary">{nextPool ? `A short rest spends one ${nextPool.className} ${nextPool.size} first and restores short-rest resources.` : "A short rest restores eligible resources. A long rest restores health and expended hit dice."}</p>
        <div className="rest-choice-grid" role="group" aria-label={`Rest ${props.actor.name}`}>
          <button className="ghost-button" type="button" disabled={!props.canRest} onClick={() => props.onRest("short")}><Sunrise size={14} /> Short rest</button>
          <button className="ghost-button" type="button" disabled={!props.canRest} onClick={() => props.onRest("long")}><Moon size={14} /> Long rest</button>
        </div>
      </div>
    </details>
  );
}
