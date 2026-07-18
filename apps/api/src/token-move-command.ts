import type {
  Scene,
  Token,
  TokenMoveBatchEventPayload,
  TokenMoveBatchRequest,
  TokenMoveBatchResult,
} from "@open-tabletop/core";

export type TokenMoveBatchCommandFailure =
  | { kind: "bad_request"; message: string }
  | { kind: "not_found"; message: string }
  | { kind: "forbidden"; message: string }
  | {
      kind: "stale_write";
      message: string;
      resourceType: "scene" | "token";
      resourceId: string;
      expectedUpdatedAt: string;
      currentUpdatedAt: string;
      current: Scene | Token;
    };

export interface PreparedTokenMoveBatchCommand {
  scene: Scene;
  movedAt: string;
  changes: Array<{ token: Token; x: number; y: number }>;
  beforePositions: Array<{
    tokenId: string;
    x: number;
    y: number;
    updatedAt: string;
  }>;
  undo: TokenMoveBatchRequest;
}

/**
 * Preflights the complete shared token-move command without mutating any token.
 * Callers may safely validate other work before committing this prepared batch.
 */
export function prepareTokenMoveBatchCommand(input: {
  scene: Scene;
  tokens: readonly Token[];
  request: unknown;
  canReadToken: (token: Token) => boolean;
  canMoveToken: (token: Token) => boolean;
  now?: () => number;
}):
  | { ok: true; value: PreparedTokenMoveBatchCommand }
  | { ok: false; error: TokenMoveBatchCommandFailure } {
  const request = input.request;
  if (!isRecord(request)) return badRequest("Atomic token movement requires a command object");

  const expectedSceneUpdatedAt = nonEmptyString(request.expectedSceneUpdatedAt);
  if (!expectedSceneUpdatedAt || !validDateTime(expectedSceneUpdatedAt)) {
    return badRequest("expectedSceneUpdatedAt must be a valid scene date-time");
  }
  if (expectedSceneUpdatedAt !== input.scene.updatedAt) {
    return {
      ok: false,
      error: {
        kind: "stale_write",
        message: "Scene changed after this action was prepared. Review the latest state and retry.",
        resourceType: "scene",
        resourceId: input.scene.id,
        expectedUpdatedAt: expectedSceneUpdatedAt,
        currentUpdatedAt: input.scene.updatedAt,
        current: input.scene,
      },
    };
  }

  if (!Array.isArray(request.changes) || request.changes.length < 1 || request.changes.length > 100) {
    return badRequest("changes must contain between 1 and 100 token moves");
  }

  const seenTokenIds = new Set<string>();
  const changes: PreparedTokenMoveBatchCommand["changes"] = [];
  for (const rawChange of request.changes) {
    if (!isRecord(rawChange)) return badRequest("Each token move must be an object");
    const tokenId = nonEmptyString(rawChange.tokenId);
    if (!tokenId) return badRequest("Each token move requires tokenId");
    if (seenTokenIds.has(tokenId)) return badRequest("A token can appear only once in an atomic move");
    seenTokenIds.add(tokenId);
    if (
      typeof rawChange.x !== "number" ||
      !Number.isFinite(rawChange.x) ||
      typeof rawChange.y !== "number" ||
      !Number.isFinite(rawChange.y)
    ) {
      return badRequest("Token move coordinates must be finite numbers");
    }
    const expectedUpdatedAt = nonEmptyString(rawChange.expectedUpdatedAt);
    if (!expectedUpdatedAt || !validDateTime(expectedUpdatedAt)) {
      return badRequest("Each token move expectedUpdatedAt must be a valid date-time");
    }

    const token = input.tokens.find(
      (candidate) => candidate.id === tokenId && candidate.sceneId === input.scene.id,
    );
    if (!token || !input.canReadToken(token)) {
      return { ok: false, error: { kind: "not_found", message: "Token not found" } };
    }
    if (!input.canMoveToken(token)) {
      return { ok: false, error: { kind: "forbidden", message: "Missing token ownership" } };
    }
    if (expectedUpdatedAt !== token.updatedAt) {
      return {
        ok: false,
        error: {
          kind: "stale_write",
          message: "Token changed after this action was prepared. Review the latest state and retry.",
          resourceType: "token",
          resourceId: token.id,
          expectedUpdatedAt,
          currentUpdatedAt: token.updatedAt,
          current: token,
        },
      };
    }
    changes.push({ token, x: rawChange.x, y: rawChange.y });
  }

  const movedAtMs = Math.max(
    (input.now ?? Date.now)(),
    ...changes.map(({ token }) => {
      const timestamp = Date.parse(token.updatedAt);
      return Number.isFinite(timestamp) ? timestamp + 1 : 0;
    }),
  );
  const movedAt = new Date(movedAtMs).toISOString();
  const beforePositions = changes.map(({ token }) => ({
    tokenId: token.id,
    x: token.x,
    y: token.y,
    updatedAt: token.updatedAt,
  }));

  return {
    ok: true,
    value: {
      scene: input.scene,
      movedAt,
      changes,
      beforePositions,
      undo: {
        expectedSceneUpdatedAt: input.scene.updatedAt,
        changes: beforePositions.map((position) => ({
          tokenId: position.tokenId,
          x: position.x,
          y: position.y,
          expectedUpdatedAt: movedAt,
        })),
      },
    },
  };
}

/** Commits one previously preflighted batch as a single in-memory mutation. */
export function commitPreparedTokenMoveBatchCommand(
  prepared: PreparedTokenMoveBatchCommand,
): { result: TokenMoveBatchResult; eventPayload: TokenMoveBatchEventPayload } {
  for (const change of prepared.changes) {
    Object.assign(change.token, {
      x: change.x,
      y: change.y,
      updatedAt: prepared.movedAt,
    });
  }
  const tokens = prepared.changes.map(({ token }) => token);
  return {
    result: { tokens, movedAt: prepared.movedAt, undo: prepared.undo },
    eventPayload: {
      sceneId: prepared.scene.id,
      tokens,
      movedAt: prepared.movedAt,
    },
  };
}

function badRequest(
  message: string,
): { ok: false; error: Extract<TokenMoveBatchCommandFailure, { kind: "bad_request" }> } {
  return { ok: false, error: { kind: "bad_request", message } };
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function validDateTime(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
