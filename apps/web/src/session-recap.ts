import type { Visibility } from "@open-tabletop/core";
import type { CampaignSessionInfo, Snapshot } from "./api.js";
import { isAdversaryActor } from "./actor-rails.js";
import { formatDateTime, formatNumber, numericValue, recordValue } from "./sheet-format.js";

export type SessionRecapSnapshot = Pick<Snapshot, "actors" | "campaignSessions" | "chat" | "combatAudit" | "combats" | "journals" | "rolls" | "tokens">;

export interface SessionRecapJournalPayload {
  title: string;
  body: string;
  visibility: Visibility;
  tags: string[];
}

export interface SessionRecapScope {
  session?: CampaignSessionInfo;
  startsAt: Date;
  endsAt: Date;
}

export function sessionRecapWindowStart(journals: Snapshot["journals"], now = Date.now()): Date {
  const latestRecap = journals
    .filter((journal) => journal.tags.includes("recap"))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
  return latestRecap ? new Date(latestRecap.createdAt) : new Date(now - 12 * 60 * 60 * 1000);
}

export function sessionRecapChatSnippet(body: string): string {
  const compact = body.replace(/\s+/g, " ").trim();
  return compact.length > 80 ? `${compact.slice(0, 77)}...` : compact;
}

export function sessionRecapNaturalTwentyCount(rolls: Snapshot["rolls"]): number {
  return rolls.filter((roll) => roll.formula.toLocaleLowerCase().includes("d20") && roll.terms.some((term) => term.sides === 20 && (term.results ?? []).includes(20))).length;
}

/**
 * Resolve an explicitly selected session that has actually started. Planned
 * sessions are not recap sources. The campaign fallback is intentionally named
 * and bounded so it cannot masquerade as evidence for one session.
 */
export function sessionRecapScope(snapshot: SessionRecapSnapshot, now = new Date(), sessionId?: string): SessionRecapScope {
  const session = sessionId
    ? (snapshot.campaignSessions ?? []).find((candidate) => candidate.id === sessionId && candidate.status !== "planned" && Boolean(candidate.startedAt))
    : undefined;
  if (!session) {
    return { startsAt: sessionRecapWindowStart(snapshot.journals, now.getTime()), endsAt: now };
  }
  return {
    session,
    startsAt: new Date(session.startedAt ?? session.createdAt),
    endsAt: new Date(session.endedAt ?? now.toISOString())
  };
}

export function generateSessionRecapBody(snapshot: SessionRecapSnapshot, windowStart: Date, windowEnd = new Date(8_640_000_000_000_000), encounterIds: readonly string[] = []): string {
  const since = windowStart.toISOString();
  const startsAt = windowStart.getTime();
  const endsAt = windowEnd.getTime();
  const inWindow = (value: string) => {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) && timestamp >= startsAt && timestamp <= endsAt;
  };
  const sections: string[] = [];
  const rolls = snapshot.rolls.filter((roll) => inWindow(roll.createdAt));
  if (rolls.length > 0) {
    const highest = rolls.reduce((best, roll) => (roll.total > best.total ? roll : best), rolls[0]!);
    const highestLabel = highest.label ? `${highest.label} ${highest.formula} = ${formatNumber(highest.total)}` : `${highest.formula} = ${formatNumber(highest.total)}`;
    sections.push(["## Rolls", `- ${formatNumber(rolls.length)} rolls`, `- Highest: ${highestLabel}`, `- Natural 20s: ${formatNumber(sessionRecapNaturalTwentyCount(rolls))}`].join("\n"));
  }

  const combats = snapshot.combats.filter((combat) => {
    if (!inWindow(combat.createdAt) && !inWindow(combat.updatedAt)) return false;
    return encounterIds.length === 0 || (combat.encounterId !== undefined && encounterIds.includes(combat.encounterId));
  });
  if (combats.length > 0) {
    const combatLines = combats.map((combat) => {
      const names = combat.combatants.map((combatant) => combatant.name).join(", ") || "No combatants";
      const defeated = combat.combatants.filter((combatant) => combatant.defeated).map((combatant) => combatant.name).join(", ") || "None";
      const combatAudit = snapshot.combatAudit.filter((entry) => inWindow(entry.createdAt) && entry.targetType === "combat" && entry.targetId === combat.id);
      const pending = combatAudit.filter((entry) => entry.action.toLocaleLowerCase().includes("pending")).length;
      const confirmed = combatAudit.filter((entry) => entry.action.toLocaleLowerCase().includes("confirm")).length;
      return `- ${combat.active ? "Active" : "Ended"} combat: ${formatNumber(combat.round)} rounds; combatants ${names}; defeated ${defeated}; actions ${formatNumber(pending)} pending / ${formatNumber(confirmed)} confirmed`;
    });
    sections.push(["## Combat", ...combatLines].join("\n"));
  }

  const partyActors = snapshot.actors.filter((actor) => !isAdversaryActor(actor, snapshot.tokens));
  if (partyActors.length > 0) {
    const partyLines = partyActors.map((actor) => {
      const hp = recordValue(actor.data.hp);
      const hpLabel = hp.current !== undefined || hp.max !== undefined ? `${formatNumber(numericValue(hp.current, 0))}/${formatNumber(numericValue(hp.max, 0))}` : "unknown";
      const xpLabel = actor.data.xp !== undefined ? `, XP ${formatNumber(numericValue(actor.data.xp, 0))}` : "";
      return `- ${actor.name} - Level ${formatNumber(numericValue(actor.data.level, 1))}, HP ${hpLabel}${xpLabel}`;
    });
    sections.push(["## Current party status", "Current state shown for reference; this is not a historical actor snapshot.", ...partyLines].join("\n"));
  }

  const chatHighlights = snapshot.chat
    .filter((message) => inWindow(message.createdAt) && message.visibility === "public" && !message.body.trim().startsWith("/"))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  if (chatHighlights.length > 0) {
    sections.push(["## Chat highlights", `- ${formatNumber(chatHighlights.length)} public messages`, ...chatHighlights.slice(-3).map((message) => `- ${sessionRecapChatSnippet(message.body)}`)].join("\n"));
  }

  return sections.length > 0 ? sections.join("\n\n") : `No table activity recorded since ${formatDateTime(since)}.`;
}

export function sessionRecapJournalPayload(snapshot: SessionRecapSnapshot, visibility: Visibility, now = new Date(), sessionId?: string): SessionRecapJournalPayload {
  const scope = sessionRecapScope(snapshot, now, sessionId);
  const session = scope.session;
  const scopeSummary = session
    ? `Scope: Session ${formatNumber(session.number)} only, from ${formatDateTime(scope.startsAt.toISOString())} through ${formatDateTime(scope.endsAt.toISOString())}.`
    : `Scope: campaign activity from ${formatDateTime(scope.startsAt.toISOString())} through ${formatDateTime(scope.endsAt.toISOString())}; no started session record was available.`;
  return {
    title: session ? `Session ${formatNumber(session.number)}: ${session.title} - Recap` : `Campaign Activity Recap - ${formatDateTime(now.toISOString())}`,
    body: `${scopeSummary}\n\n${generateSessionRecapBody(snapshot, scope.startsAt, scope.endsAt, session?.encounterIds)}`,
    visibility,
    tags: session ? ["recap", `session:${session.id}`] : ["recap", "campaign-recap"]
  };
}
