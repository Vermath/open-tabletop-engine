import { createId, nowIso, type Token } from "@open-tabletop/core";

export type BoardTokenPositionChange = { tokenId: string; before: Pick<Token, "x" | "y">; after: Pick<Token, "x" | "y"> };
export type BoardTokenFrameChange = { tokenId: string; before: Pick<Token, "x" | "y" | "width" | "height">; after: Pick<Token, "x" | "y" | "width" | "height"> };
export type BoardHistoryAction = { kind: "tokens.create" | "tokens.delete"; tokens: Token[] } | { kind: "tokens.move"; changes: BoardTokenPositionChange[] } | { kind: "tokens.resize"; changes: BoardTokenFrameChange[] };
export type BoardHistoryDirection = "undo" | "redo";

export interface LocalBoardHistoryResult {
  tokens: Token[];
  selectedTokenIds: string[];
}

export function applyLocalBoardHistoryAction(tokens: Token[], action: BoardHistoryAction, direction: BoardHistoryDirection): LocalBoardHistoryResult {
  if (action.kind === "tokens.move" || action.kind === "tokens.resize") {
    const target = direction === "undo" ? "before" : "after";
    const changesById = new Map(action.changes.map((change) => [change.tokenId, change[target]]));
    return {
      tokens: tokens.map((token) => {
        const change = changesById.get(token.id);
        return change ? { ...token, ...change } : token;
      }),
      selectedTokenIds: action.changes.map((change) => change.tokenId)
    };
  }

  const shouldRemoveTokens = action.kind === "tokens.create" ? direction === "undo" : direction === "redo";
  if (shouldRemoveTokens) {
    const ids = new Set(action.tokens.map((token) => token.id));
    return {
      tokens: tokens.filter((token) => !ids.has(token.id)),
      selectedTokenIds: []
    };
  }

  return {
    tokens: upsertTokens(tokens, action.tokens),
    selectedTokenIds: action.tokens.map((token) => token.id)
  };
}

export function createTokenCopies(tokens: Token[], options: { idFactory?: () => string; now?: () => string; offset?: number } = {}): Token[] {
  const idFactory = options.idFactory ?? (() => createId("tok"));
  const timestamp = options.now ?? nowIso;
  const offset = options.offset ?? 24;
  return tokens.map((token) => {
    const now = timestamp();
    return {
      ...token,
      id: idFactory(),
      name: copyTokenName(token.name),
      x: token.x + offset,
      y: token.y + offset,
      targetedByUserIds: [],
      createdAt: now,
      updatedAt: now
    };
  });
}

function upsertTokens(currentTokens: Token[], tokensToUpsert: Token[]): Token[] {
  const upserts = new Map(tokensToUpsert.map((token) => [token.id, token]));
  const seen = new Set<string>();
  const next = currentTokens.map((token) => {
    const upsert = upserts.get(token.id);
    if (!upsert) return token;
    seen.add(token.id);
    return upsert;
  });
  for (const token of tokensToUpsert) {
    if (!seen.has(token.id)) next.push(token);
  }
  return next;
}

function copyTokenName(name: string): string {
  return /\bcopy\b/i.test(name) ? name : `${name} Copy`;
}
