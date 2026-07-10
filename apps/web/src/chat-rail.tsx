import type { ChatMessage, DiceRoll } from "@open-tabletop/core";
import { Activity, Check, ChevronDown, Dices, MessageSquare, PencilLine, Plus, Save, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { verifyDiceRoll, type DiceRollVerification, type Snapshot } from "./api.js";
import { addDieToFormula, adjustDiceModifier, diceQuickPresets, diceTraySides, rollHighlight, rollTermHighlight } from "./dice-insights.js";
import { errorMessage, formatDateTime, formatNumber, formatRollTermDetail, formatRollTermName, rollTermTotal, safeProbabilityRange, titleCaseLabel } from "./sheet-format.js";


export type ChatRailProps = {
  campaignId: string;
  command: string;
  setCommand(value: string): void;
  replyTarget?: ChatMessage;
  messages: ChatMessage[];
  rolls: DiceRoll[];
  concealedRollIds: ReadonlySet<string>;
  members: Snapshot["members"];
  diceFormula: string;
  setDiceFormula(value: string): void;
  diceVisibility: DiceRoll["visibility"];
  setDiceVisibility(value: DiceRoll["visibility"]): void;
  savedDiceFormulas: string[];
  diceMacros: Snapshot["diceMacros"];
  onRollDice(): Promise<void>;
  onSaveDiceFormula(): Promise<void>;
  onSubmitCommand(): Promise<void>;
  onClearReply(): void;
  currentUserId: string;
  onEditMessage(message: ChatMessage, body: string): Promise<void>;
  canRollDice: boolean;
  dice3dEnabled: boolean;
  onToggleDice3d(): void;
};


export function ChatRail(props: ChatRailProps) {
  const streamRef = useRef<HTMLDivElement>(null);
  const memberNames = new Map(props.members.map((member) => [member.user.id, member.user.displayName]));
  const messageById = new Map(props.messages.map((message) => [message.id, message]));
  const rollById = new Map(props.rolls.map((roll) => [roll.id, roll]));
  const savedFormulaOptions = [...props.diceMacros.map((macro) => ({ label: macro.name === macro.formula ? macro.formula : `${macro.name} - ${macro.formula}`, formula: macro.formula })), ...props.savedDiceFormulas.map((formula) => ({ label: formula, formula }))].filter((option, index, options) => options.findIndex((item) => item.formula === option.formula) === index);

  useEffect(() => {
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight });
  }, [props.messages.length]);

  return (
    <section className="chat-rail" aria-label="Chat">
      <form
        className="dice-box chat-dice-box"
        aria-label="Dice roller"
        onSubmit={(event) => {
          event.preventDefault();
          props.onRollDice().catch(console.error);
        }}
      >
        <Activity size={16} />
        <input aria-label="Dice formula" value={props.diceFormula} placeholder="1d20+5" onChange={(event) => props.setDiceFormula(event.target.value)} />
        <button className="icon-button" type="submit" title="Roll dice" aria-label="Roll dice" disabled={!props.canRollDice || !props.diceFormula.trim()}>
          <Activity size={15} />
        </button>
        <select aria-label="Dice roll visibility" value={props.diceVisibility} onChange={(event) => props.setDiceVisibility(event.target.value as DiceRoll["visibility"])}>
          <option value="public">Public</option>
          <option value="gm_only">GM only</option>
        </select>
        <button className="icon-button" type="button" title="Save dice formula" aria-label="Save dice formula" disabled={!props.diceFormula.trim()} onClick={() => props.onSaveDiceFormula().catch(console.error)}>
          <Plus size={15} />
        </button>
        <select aria-label="Saved dice formula" value="" onChange={(event) => event.target.value && props.setDiceFormula(event.target.value)}>
          <option value="">Saved formulas</option>
          {savedFormulaOptions.map((option) => (
            <option key={option.formula} value={option.formula}>{option.label}</option>
          ))}
        </select>
        <div className="dice-tray" role="group" aria-label="Quick dice">
          {diceTraySides.map((sides) => (
            <button className="dice-chip" key={sides} type="button" title={`Add 1d${sides} to the formula`} aria-label={`Add 1d${sides} to the formula`} onClick={() => props.setDiceFormula(addDieToFormula(props.diceFormula, sides))}>
              d{sides}
            </button>
          ))}
          <span className="dice-tray-divider" aria-hidden="true" />
          {diceQuickPresets.map((preset) => (
            <button className="dice-chip dice-preset-chip" key={preset.id} type="button" title={preset.title} aria-label={preset.title} onClick={() => props.setDiceFormula(preset.formula)}>
              {preset.label}
            </button>
          ))}
          <button className="dice-chip dice-modifier-chip" type="button" title="Reduce the roll modifier by 1" aria-label="Reduce dice modifier by 1" onClick={() => props.setDiceFormula(adjustDiceModifier(props.diceFormula, -1))}>−1</button>
          <button className="dice-chip dice-modifier-chip" type="button" title="Increase the roll modifier by 1" aria-label="Increase dice modifier by 1" onClick={() => props.setDiceFormula(adjustDiceModifier(props.diceFormula, 1))}>+1</button>
          <button className={props.dice3dEnabled ? "dice-chip dice-3d-toggle active" : "dice-chip dice-3d-toggle"} type="button" title={props.dice3dEnabled ? "3D dice on; click for text-only rolling" : "Text-only rolling; click to enable 3D dice"} aria-label={props.dice3dEnabled ? "Use text-only dice" : "Enable 3D dice"} aria-pressed={props.dice3dEnabled} onClick={props.onToggleDice3d}>
            <Dices size={13} aria-hidden="true" /> 3D
          </button>
        </div>
      </form>
      <div className="chat-rail-stream" aria-label="Chat messages" ref={streamRef}>
        {props.messages.length === 0 ? (
          <div className="empty-state compact">No messages yet.</div>
        ) : (
          props.messages.map((message) => (
            <ChatMessageItem key={message.id} campaignId={props.campaignId} message={message} roll={message.rollId ? rollById.get(message.rollId) : undefined} rollConcealed={message.rollId ? props.concealedRollIds.has(message.rollId) : false} memberNames={memberNames} messageById={messageById} canEdit={message.userId === props.currentUserId && !message.rollId && message.type !== "roll"} onEditMessage={props.onEditMessage} />
          ))
        )}
      </div>
      <ChatComposer command={props.command} setCommand={props.setCommand} replyTarget={props.replyTarget} onSubmitCommand={props.onSubmitCommand} onClearReply={props.onClearReply} />
    </section>
  );
}


export function ChatMessageItem(props: { campaignId: string; message: ChatMessage; roll?: DiceRoll; rollConcealed?: boolean; memberNames: Map<string, string>; messageById: Map<string, ChatMessage>; canEdit?: boolean; onEditMessage?(message: ChatMessage, body: string): Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(props.message.body);
  const [editStatus, setEditStatus] = useState("");
  const messageKind = props.roll || props.message.type === "roll" ? "roll" : props.message.type;
  const author = props.memberNames.get(props.message.userId) ?? props.message.userId;
  const replyMessage = props.message.replyToMessageId ? props.messageById.get(props.message.replyToMessageId) : undefined;
  const recipientLabel = props.message.visibility === "whisper" ? props.message.recipientUserIds.map((recipientId) => props.memberNames.get(recipientId) ?? recipientId).join(", ") : "";

  return (
    <article className={`chat-message chat-message-${messageKind}`} aria-label={`${titleCaseLabel(messageKind)} message`}>
      <header className="chat-message-header">
        <span className="chat-author">{messageKind === "emote" ? `${author} ${props.message.body}` : author}</span>
        <span className="chat-time">{formatDateTime(props.message.createdAt)}</span>
        <span className={`chat-visibility chat-visibility-${props.message.visibility}`}>{chatVisibilityLabel(props.message.visibility)}</span>
        {props.message.editedAt && <span className="chat-edited-label" title={`Edited ${formatDateTime(props.message.editedAt)}`}>edited</span>}
        {props.canEdit && !editing && <button className="chat-message-action" type="button" aria-label={`Edit message from ${author}`} title="Edit message" onClick={() => { setEditBody(props.message.body); setEditing(true); }}><PencilLine size={12} /></button>}
      </header>
      {replyMessage && (
        <div className="chat-reply-context" aria-label="Chat reply context">
          <MessageSquare size={13} />
          <span>{replyMessage.body.slice(0, 96)}</span>
        </div>
      )}
      {editing ? (
        <form className="chat-edit-form" aria-label="Edit chat message" onSubmit={(event) => {
          event.preventDefault();
          const body = editBody.trim();
          if (!body || !props.onEditMessage) return;
          setEditStatus("Saving");
          props.onEditMessage(props.message, body).then(() => { setEditing(false); setEditStatus(""); }).catch((error) => setEditStatus(`Save failed: ${errorMessage(error)}`));
        }}>
          <textarea aria-label="Edited chat message" value={editBody} rows={3} onChange={(event) => setEditBody(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setEditing(false); setEditBody(props.message.body); } }} />
          <div className="button-row wrap">
            <button className="ghost-button small" type="submit" disabled={!editBody.trim() || editBody.trim() === props.message.body}><Save size={12} /> Save</button>
            <button className="ghost-button small" type="button" onClick={() => { setEditing(false); setEditBody(props.message.body); setEditStatus(""); }}><X size={12} /> Cancel</button>
            {editStatus && <span role="status">{editStatus}</span>}
          </div>
        </form>
      ) : props.roll ? (
        <RollMessageCard campaignId={props.campaignId} message={props.message} roll={props.roll} concealed={props.rollConcealed === true} />
      ) : messageKind === "emote" ? null : (
        <p className="chat-body">{props.message.body}</p>
      )}
      {props.message.visibility === "whisper" && recipientLabel && <p className="chat-recipient-line">To {recipientLabel}</p>}
      {props.message.rollId && !props.roll && <p className="chat-recipient-line">Roll result is not available in this snapshot.</p>}
    </article>
  );
}


export function RollMessageCard(props: { campaignId: string; message: ChatMessage; roll: DiceRoll; concealed?: boolean }) {
  const [verification, setVerification] = useState<DiceRollVerification | undefined>();
  const [verificationStatus, setVerificationStatus] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const label = props.roll.label || props.message.body || "Roll";
  const highlight = props.concealed ? null : rollHighlight(props.roll.terms);
  const range = props.concealed ? undefined : safeProbabilityRange(props.roll.formula);
  const className = ["chat-roll-card", highlight ? `chat-roll-card-${highlight}` : "", props.concealed ? "chat-roll-card-pending" : ""].filter(Boolean).join(" ");
  const verify = async () => {
    if (props.concealed) return;
    setVerificationStatus("Checking");
    try {
      const result = await verifyDiceRoll(props.campaignId, props.roll.id);
      setVerification(result);
      setVerificationStatus(result.verified ? `Verified total ${formatNumber(result.expected.total)}` : `Failed: ${diceVerificationReasonLabel(result.reason)}`);
    } catch (error) {
      setVerification(undefined);
      setVerificationStatus(`Failed: ${errorMessage(error)}`);
    }
  };
  return (
    <div className={className} aria-busy={props.concealed ? "true" : undefined}>
      <button
        className="chat-roll-summary"
        type="button"
        aria-expanded={detailOpen}
        aria-label={props.concealed ? "Roll result pending" : `${label}: rolled ${props.roll.formula} for ${props.roll.total}. Toggle breakdown.`}
        disabled={props.concealed}
        onClick={() => setDetailOpen((open) => !open)}
      >
        <span className="chat-roll-kind">{props.roll.visibility === "gm_only" ? "GM Roll" : "Roll"}</span>
        <strong className="chat-roll-label">{label}</strong>
        <code className="chat-roll-formula">{props.roll.formula}{range ? ` (${formatNumber(range.min)}-${formatNumber(range.max)})` : ""}</code>
        {highlight && (
          <em className={`chat-roll-flag chat-roll-flag-${highlight}`} aria-label={highlight === "crit" ? "Natural 20" : "Natural 1"}>
            {highlight === "crit" ? "Nat 20" : "Nat 1"}
          </em>
        )}
        <strong className="chat-roll-total" aria-hidden="true">{props.concealed ? "..." : formatNumber(props.roll.total)}</strong>
        {!props.concealed && <ChevronDown className={detailOpen ? "chat-roll-chevron open" : "chat-roll-chevron"} size={14} aria-hidden="true" />}
      </button>
      {detailOpen && !props.concealed && (
        <div className="chat-roll-detail">
          <div className="chat-roll-dice" aria-label="Dice term breakdown">
            {props.roll.terms.map((term, index) => {
              const termTotal = rollTermTotal(term);
              const termHighlight = rollTermHighlight(term);
              return (
                <span className={termHighlight ? `chat-roll-die chat-roll-die-${termHighlight}` : "chat-roll-die"} key={`${props.roll.id}-${index}`}>
                  <strong>{termTotal === undefined ? formatRollTermName(term, index) : formatNumber(termTotal)}</strong>
                  <span>{formatRollTermName(term, index)}</span>
                  <small>{formatRollTermDetail(term)}</small>
                </span>
              );
            })}
          </div>
          <div className="chat-roll-verification">
            <button className="ghost-button small" type="button" onClick={() => verify().catch(console.error)}>
              <Check size={13} /> Verify fairness
            </button>
            {verificationStatus && (
              <span className={verification?.verified ? "verification-status verified" : "verification-status"} role="status">
                {verificationStatus}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


export function diceVerificationReasonLabel(reason: DiceRollVerification["reason"]): string {
  switch (reason) {
    case "fairness_unavailable":
      return "fairness data missing";
    case "unsupported_algorithm":
      return "unsupported algorithm";
    case "seed_hash_mismatch":
      return "seed hash mismatch";
    case "formula_unparseable":
      return "formula could not be replayed";
    case "result_mismatch":
      return "result mismatch";
    default:
      return "verification unavailable";
  }
}


export function ChatComposer(props: { command: string; setCommand(value: string): void; replyTarget?: ChatMessage; onSubmitCommand(): Promise<void>; onClearReply(): void }) {
  return (
    <form className="chat-composer-dock" aria-label="Chat composer" onSubmit={(event) => { event.preventDefault(); props.onSubmitCommand().catch(console.error); }}>
      {props.replyTarget && (
        <div className="chat-reply-draft" role="status" aria-label="Chat reply target">
          <span>Replying to {props.replyTarget.body.slice(0, 80)}</span>
          <button className="ghost-button small" type="button" onClick={props.onClearReply}>Clear</button>
        </div>
      )}
      <div className="chat-composer-row">
        <MessageSquare size={16} />
        <textarea
          aria-label="Chat message"
          value={props.command}
          placeholder="Message, /1d20 + 2, /roll 2d6, /gm secret, /w player message"
          rows={2}
          onChange={(event) => props.setCommand(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey) return;
            event.preventDefault();
            props.onSubmitCommand().catch(console.error);
          }}
        />
        <button className="icon-button chat-send-button" type="submit" title="Send chat command" aria-label="Send chat command" disabled={!props.command.trim()}>
          <Send size={16} />
        </button>
      </div>
      <p className="chat-command-reference">/roll /r /gmroll /gm /w /me /ooc</p>
    </form>
  );
}


export function chatVisibilityLabel(visibility: ChatMessage["visibility"]): string {
  if (visibility === "gm_only") return "GM";
  if (visibility === "whisper") return "Whisper";
  return "Public";
}
