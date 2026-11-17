import type { Actor, DiceRoll, DiceRollTerm } from "@open-tabletop/core";
import { Dices, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "./api.js";

export interface HeroicInspirationDieChoice {
  termIndex: number;
  resultIndex: number;
  value: number;
  kept: boolean;
}

interface GrantResult {
  awardedTo: "actor" | "recipient";
  actor: Actor;
  recipient?: Actor;
}

interface RerollResult {
  actor: Actor;
  originalRoll: DiceRoll;
  reroll: DiceRoll;
  mustUseNewRoll: true;
}

export function heroicInspirationDieChoicesForRoll(roll: Pick<DiceRoll, "terms">): HeroicInspirationDieChoice[] {
  const termIndex = roll.terms.findIndex(isSelectableD20Term);
  if (termIndex < 0) return [];
  const term = roll.terms[termIndex]!;
  return term.results!.map((value, resultIndex) => ({ termIndex, resultIndex, value, kept: (term.kept ?? []).includes(value) }));
}

export function HeroicInspirationCard(props: { campaignId: string; actor: Actor; actors: Actor[]; canManage: boolean; canReroll: boolean }) {
  const [currentActor, setCurrentActor] = useState(props.actor);
  const [rolls, setRolls] = useState<DiceRoll[]>([]);
  const [recipientActorId, setRecipientActorId] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => setCurrentActor(props.actor), [props.actor]);
  const hasInspiration = currentActor.data.heroicInspiration === true;
  useEffect(() => {
    if (!hasInspiration) {
      setRolls([]);
      return;
    }
    let active = true;
    void apiGet<DiceRoll[]>(`/api/v1/campaigns/${props.campaignId}/rolls`)
      .then((result) => { if (active) setRolls(result); })
      .catch((error) => { if (active) setStatus(errorText(error)); });
    return () => { active = false; };
  }, [props.campaignId, currentActor.id, currentActor.updatedAt, hasInspiration]);

  const eligibleRecipients = props.actors.filter((actor) => actor.id !== currentActor.id && actor.systemId === "dnd-5e-srd" && actor.data.heroicInspiration !== true);
  const latestActorRoll = useMemo(() => rolls.filter((roll) => roll.actorId === currentActor.id).at(-1), [rolls, currentActor.id]);
  const dieChoices = latestActorRoll && !latestActorRoll.heroicInspiration ? heroicInspirationDieChoicesForRoll(latestActorRoll) : [];

  async function grantOrTransfer() {
    const recipient = eligibleRecipients.find((actor) => actor.id === recipientActorId);
    if (hasInspiration && !recipient) {
      setStatus("Choose an eligible recipient for the overflow grant.");
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      const result = await apiPost<GrantResult>(`/api/v1/campaigns/${props.campaignId}/systems/dnd-5e-srd/actors/${currentActor.id}/heroic-inspiration/grant`, {
        expectedActorUpdatedAt: currentActor.updatedAt,
        ...(recipient ? { recipientActorId: recipient.id, expectedRecipientUpdatedAt: recipient.updatedAt } : {}),
      }, { idempotencyKey: `heroic-inspiration-grant:${window.crypto.randomUUID()}` });
      setCurrentActor(result.actor);
      setRecipientActorId("");
      setStatus(result.awardedTo === "recipient" ? `Overflow Heroic Inspiration granted to ${result.recipient?.name ?? "recipient"}.` : `${result.actor.name} has Heroic Inspiration.`);
    } catch (error) {
      setStatus(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function reroll(choice: HeroicInspirationDieChoice) {
    if (!latestActorRoll) return;
    const accepted = window.confirm(`Spend Heroic Inspiration to reroll the selected d20 (${choice.value})? You must use the new roll, even if it is lower.`);
    if (!accepted) return;
    setBusy(true);
    setStatus("");
    try {
      const result = await apiPost<RerollResult>(`/api/v1/campaigns/${props.campaignId}/systems/dnd-5e-srd/actors/${currentActor.id}/heroic-inspiration/reroll`, {
        originalRollId: latestActorRoll.id,
        selectedTermIndex: choice.termIndex,
        selectedResultIndex: choice.resultIndex,
        expectedActorUpdatedAt: currentActor.updatedAt,
      }, { idempotencyKey: `heroic-inspiration-reroll:${window.crypto.randomUUID()}` });
      setCurrentActor(result.actor);
      setRolls((current) => [...current.filter((roll) => roll.id !== result.originalRoll.id), result.originalRoll, result.reroll]);
      setStatus(`New required result: ${result.reroll.total}. Heroic Inspiration spent.`);
    } catch (error) {
      setStatus(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="actor-rules-trace-disclosure" aria-label="Heroic Inspiration">
      <div className="actor-sheet-subheading">
        <span><Sparkles size={14} aria-hidden="true" /> Heroic Inspiration</span>
        <strong>{hasInspiration ? "Ready" : "None"}</strong>
      </div>
      {props.canManage && !hasInspiration && (
        <button className="ghost-button small" type="button" disabled={busy} onClick={() => void grantOrTransfer()}>Grant Heroic Inspiration</button>
      )}
      {props.canManage && hasInspiration && eligibleRecipients.length > 0 && (
        <div className="sheet-row">
          <label htmlFor={`heroic-recipient-${currentActor.id}`}>Overflow grant</label>
          <select id={`heroic-recipient-${currentActor.id}`} aria-label="Heroic Inspiration recipient" value={recipientActorId} disabled={busy} onChange={(event) => setRecipientActorId(event.target.value)}>
            <option value="">Choose recipient</option>
            {eligibleRecipients.map((actor) => <option key={actor.id} value={actor.id}>{actor.name}</option>)}
          </select>
          <button className="ghost-button small" type="button" disabled={busy || !recipientActorId} onClick={() => void grantOrTransfer()}>Transfer incoming grant</button>
        </div>
      )}
      {hasInspiration && props.canReroll && latestActorRoll && dieChoices.length > 0 && (
        <div className="placement-list" aria-label={`Reroll dice from ${latestActorRoll.label ?? latestActorRoll.formula}`}>
          <span className="muted">Latest d20: {latestActorRoll.label ?? latestActorRoll.formula} = {latestActorRoll.total}. Select exactly one die; the new result is mandatory.</span>
          {dieChoices.map((choice) => (
            <button className="ghost-button small" type="button" key={`${choice.termIndex}:${choice.resultIndex}`} disabled={busy} onClick={() => void reroll(choice)}>
              <Dices size={14} aria-hidden="true" /> Reroll die {choice.value}{choice.kept ? " (kept)" : ""}
            </button>
          ))}
        </div>
      )}
      {hasInspiration && props.canReroll && (!latestActorRoll || dieChoices.length === 0) && <div className="empty-state compact">Roll a normal, Advantage, or Disadvantage d20 test to use it.</div>}
      {status && <div className="empty-state compact" role="status">{status}</div>}
    </section>
  );
}

function isSelectableD20Term(term: DiceRollTerm): boolean {
  if (term.type !== "die" || term.sides !== 20 || !Array.isArray(term.results)) return false;
  if (term.results.length === 1 && (term.count === undefined || term.count === 1)) return term.keep === undefined && term.drop === undefined;
  return term.results.length === 2 && term.count === 2 && (term.keep === "highest" || term.keep === "lowest") && term.keepCount === 1 && term.drop === undefined;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
