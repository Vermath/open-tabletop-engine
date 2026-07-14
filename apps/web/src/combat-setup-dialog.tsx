import type { Actor, Token } from "@open-tabletop/core";
import { ChevronDown, ChevronUp, Dices, Swords, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { initialCombatSetupTokenIds, isNpcInitiativeActor, moveCombatSetupToken, validateCombatSetup, type CombatSetupSubmission } from "./combat-setup.js";
import { useModalAccessibility } from "./modal-accessibility.js";

export function CombatSetupDialog(props: {
  sceneName: string;
  tokens: Token[];
  actors: Actor[];
  initialSelectedTokenIds: string[];
  surpriseEnabled: boolean;
  onConfirm(input: CombatSetupSubmission): Promise<void>;
  onClose(): void;
}) {
  const [selectedTokenIds, setSelectedTokenIds] = useState(() => initialCombatSetupTokenIds(props.tokens, props.initialSelectedTokenIds));
  const [initiativeDrafts, setInitiativeDrafts] = useState<Record<string, string>>({});
  const [surprisedTokenIds, setSurprisedTokenIds] = useState<Set<string>>(() => new Set());
  const [rollNpcInitiative, setRollNpcInitiative] = useState(true);
  const [manualTurnOrder, setManualTurnOrder] = useState(false);
  const [idempotencyKey] = useState(() => `combat-start:${globalThis.crypto.randomUUID()}`);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const dialogRef = useModalAccessibility<HTMLDivElement>(() => {
    if (!submitting) props.onClose();
  });
  const actorById = useMemo(() => new Map(props.actors.map((actor) => [actor.id, actor])), [props.actors]);
  const validation = validateCombatSetup({ tokens: props.tokens, actors: props.actors, selectedTokenIds, initiativeDrafts, surprisedTokenIds: [...surprisedTokenIds], surpriseEnabled: props.surpriseEnabled, rollNpcInitiative, manualTurnOrder });
  const selectedSet = new Set(selectedTokenIds);
  const tokenById = new Map(props.tokens.map((token) => [token.id, token]));
  const orderedTokens = [
    ...selectedTokenIds.flatMap((tokenId) => tokenById.has(tokenId) ? [tokenById.get(tokenId)!] : []),
    ...props.tokens.filter((token) => !selectedSet.has(token.id))
  ];

  useEffect(() => {
    const available = new Set(props.tokens.map((token) => token.id));
    setSelectedTokenIds((current) => {
      const next = current.filter((tokenId) => available.has(tokenId));
      return next.length === current.length ? current : next;
    });
  }, [props.tokens]);

  const toggleToken = (tokenId: string, checked: boolean) => {
    setSubmitError("");
    setSelectedTokenIds((current) => checked ? [...current, tokenId] : current.filter((id) => id !== tokenId));
    if (!checked) setSurprisedTokenIds((current) => {
      if (!current.has(tokenId)) return current;
      const next = new Set(current);
      next.delete(tokenId);
      return next;
    });
  };

  const submit = async () => {
    if (!validation.submission || submitting) {
      setSubmitError(validation.error ?? "Review the combatants before starting combat.");
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    try {
      await props.onConfirm({ ...validation.submission, idempotencyKey });
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : String(error));
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (!submitting && event.target === event.currentTarget) props.onClose();
    }}>
      <div ref={dialogRef} className="modal-dialog combat-setup-dialog" role="dialog" aria-modal="true" aria-labelledby="combat-setup-title" tabIndex={-1}>
        <header className="creator-header">
          <div>
            <div className="section-title">Combat setup</div>
            <h2 id="combat-setup-title">Review {props.sceneName}</h2>
            <p>Only checked tokens join combat. Board selections are prechecked.</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close combat setup" disabled={submitting} onClick={props.onClose}>
            <X size={16} />
          </button>
        </header>

        <div className="combat-setup-toolbar">
          <span><strong>{selectedTokenIds.length}</strong> of {props.tokens.length} selected</span>
          <div className="button-row">
            <button className="ghost-button small" type="button" disabled={submitting || selectedTokenIds.length === props.tokens.length} onClick={() => setSelectedTokenIds(props.tokens.map((token) => token.id))}>Select all</button>
            <button className="ghost-button small" type="button" disabled={submitting || selectedTokenIds.length === 0} onClick={() => setSelectedTokenIds([])}>Clear</button>
          </div>
        </div>

        <label className="inline-check combat-setup-roll-option">
          <input type="checkbox" checked={rollNpcInitiative} disabled={submitting} onChange={(event) => {
            setSubmitError("");
            setRollNpcInitiative(event.target.checked);
          }} />
          <span><Dices size={15} /> Server-roll initiative for linked NPCs and monsters</span>
        </label>

        <label className="inline-check combat-setup-roll-option">
          <input type="checkbox" checked={manualTurnOrder} disabled={submitting} onChange={(event) => {
            setSubmitError("");
            setManualTurnOrder(event.target.checked);
          }} />
          <span>Use the reviewed order instead of automatic initiative sorting</span>
        </label>

        <div className="combat-setup-list" role="list" aria-label="Scene combatants">
          {props.tokens.length === 0 ? (
            <div className="empty-state compact">This scene has no combat-ready tokens.</div>
          ) : orderedTokens.map((token) => {
            const selected = selectedSet.has(token.id);
            const selectedIndex = selectedTokenIds.indexOf(token.id);
            const actor = token.actorId ? actorById.get(token.actorId) : undefined;
            const serverRoll = selected && rollNpcInitiative && isNpcInitiativeActor(actor);
            const checkboxId = `combat-setup-${token.id}`;
            return (
              <div className={`combat-setup-participant ${selected ? "selected" : ""}`} role="listitem" key={token.id}>
                <input id={checkboxId} type="checkbox" checked={selected} disabled={submitting} onChange={(event) => toggleToken(token.id, event.target.checked)} />
                <label className="combat-setup-identity" htmlFor={checkboxId}>
                  <span className="party-avatar">{token.name.slice(0, 2).toUpperCase()}</span>
                  <span>
                    <strong>{token.name}</strong>
                    <small>{actor ? actor.type : "Unlinked token"}{token.hidden ? " · Hidden from players" : ""}</small>
                  </span>
                </label>
                {selected && (serverRoll ? (
                  <span className="status-pill combat-setup-server-roll">Server roll</span>
                ) : (
                  <label className="combat-setup-initiative">
                    <span>Initiative</span>
                    <input
                      aria-label={`${token.name} initiative`}
                      type="number"
                      inputMode="numeric"
                      value={initiativeDrafts[token.id] ?? ""}
                      disabled={submitting}
                      placeholder="Required"
                      onChange={(event) => {
                        setSubmitError("");
                        setInitiativeDrafts((current) => ({ ...current, [token.id]: event.target.value }));
                      }}
                    />
                  </label>
                ))}
                {selected && props.surpriseEnabled && (
                  <label className="inline-check combat-setup-surprise">
                    <input
                      type="checkbox"
                      checked={surprisedTokenIds.has(token.id)}
                      disabled={submitting}
                      onChange={(event) => setSurprisedTokenIds((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(token.id);
                        else next.delete(token.id);
                        return next;
                      })}
                    />
                    <span>Surprised</span>
                  </label>
                )}
                {selected && manualTurnOrder && (
                  <div className="button-row combat-setup-order-controls" aria-label={`${token.name} turn order controls`}>
                    <button className="icon-button" type="button" aria-label={`Move ${token.name} earlier`} disabled={submitting || selectedIndex <= 0} onClick={() => setSelectedTokenIds((current) => moveCombatSetupToken(current, token.id, -1))}><ChevronUp size={14} /></button>
                    <button className="icon-button" type="button" aria-label={`Move ${token.name} later`} disabled={submitting || selectedIndex < 0 || selectedIndex >= selectedTokenIds.length - 1} onClick={() => setSelectedTokenIds((current) => moveCombatSetupToken(current, token.id, 1))}><ChevronDown size={14} /></button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {!props.surpriseEnabled && <p className="combat-setup-rule-note" role="status">Surprise is disabled by this campaign's saved rules profile.</p>}

        <footer className="encounter-builder-footer button-row">
          <div className="combat-setup-validation" role={submitError ? "alert" : "status"} aria-live="polite">
            {submitError || validation.error || "Participants and initiative are ready."}
          </div>
          <button className="primary-button" type="button" disabled={submitting || !validation.submission} onClick={() => void submit()}>
            <Swords size={15} /> {submitting ? "Starting..." : `Start combat (${selectedTokenIds.length})`}
          </button>
        </footer>
      </div>
    </div>
  );
}
