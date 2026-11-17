import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync, writeFileSync } from "node:fs";
import type {
  IncomingMessage,
  RequestListener,
  ServerResponse,
} from "node:http";
import { Session } from "node:inspector/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import type { buildApp } from "../../apps/api/src/app.js";
import type { SqliteStateStore } from "../../apps/api/src/sqlite-store.js";

type RequestRecord = {
  sequence: number;
  method: string;
  path: string;
  idempotencyKey: string | null;
  requestId?: string;
  enteredAt: number;
  finishedAt?: number;
  statusCode?: number;
};
type RequestScope = { record: RequestRecord; response: ServerResponse };
type TimingEvent = {
  sequence: number;
  at: number;
  phase: string;
  requestSequence?: number;
  operation?: number;
  sql?: string;
  socket?: number;
  eventId?: string;
  eventType?: string;
  targetId?: string;
  errorName?: string;
};

// This helper is loaded only by the isolated multiplayer API fixture in its
// opt-in diagnostic mode. No production route or shared process is instrumented.
export function installMultiplayerApiProfiling(
  store: SqliteStateStore,
  outputDirectory: string,
) {
  const epoch = () => performance.timeOrigin + performance.now();
  const scopes = new AsyncLocalStorage<RequestScope>();
  const maximumEvents = 100_000;
  const maximumRequests = 10_000;
  const events: TimingEvent[] = [];
  const requests: RequestRecord[] = [];
  let collecting = false;
  let droppedEvents = 0;
  let droppedRequests = 0;
  let eventSequence = 0;
  let requestSequence = 0;
  let socketSequence = 0;
  let session: Session | undefined;
  let profileStartRequestedAt: number | undefined;
  let collectionStartedAt: number | undefined;
  let collectionStoppedAt: number | undefined;
  const sqliteSettings = {
    journalMode: store.db.prepare("PRAGMA journal_mode").get(),
    synchronous: store.db.prepare("PRAGMA synchronous").get(),
  };
  const errorName = (error: unknown) =>
    error instanceof Error ? error.name : typeof error;
  const record = (
    phase: string,
    fields: Omit<Partial<TimingEvent>, "phase" | "sequence" | "at"> = {},
  ) => {
    if (!collecting) return undefined;
    const sequence = ++eventSequence;
    if (events.length >= maximumEvents) {
      droppedEvents += 1;
      return sequence;
    }
    const scope = scopes.getStore();
    if (scope) {
      const requestId = scope.response.getHeader("x-request-id");
      if (typeof requestId === "string") scope.record.requestId = requestId;
    }
    events.push({
      sequence,
      at: epoch(),
      phase,
      ...(scope ? { requestSequence: scope.record.sequence } : {}),
      ...fields,
    });
    return sequence;
  };

  // Install before buildApp: its idempotency/flush hooks capture these methods.
  for (const method of ["save", "flush"] as const) {
    const original = store[method];
    store[method] = function (...args: Parameters<typeof original>) {
      const operation = record(`${method}.call`);
      try {
        const result = Reflect.apply(original, this, args);
        record(`${method}.return`, { operation });
        return result;
      } catch (error) {
        record(`${method}.throw`, { operation, errorName: errorName(error) });
        throw error;
      }
    };
  }
  const originalExec = store.db.exec;
  store.db.exec = function (...args: Parameters<typeof originalExec>) {
    const sql = args[0].trim().toUpperCase();
    const observed = /^(BEGIN(?: IMMEDIATE)?|COMMIT|ROLLBACK);?$/.test(sql);
    if (!observed || !collecting)
      return Reflect.apply(originalExec, this, args);
    const operation = record("sqlite.exec.call", { sql });
    try {
      const result = Reflect.apply(originalExec, this, args);
      record("sqlite.exec.return", { operation, sql });
      return result;
    } catch (error) {
      record("sqlite.exec.throw", {
        operation,
        sql,
        errorName: errorName(error),
      });
      throw error;
    }
  };

  const attach = (app: Awaited<ReturnType<typeof buildApp>>) => {
    const listeners = app.server.listeners("request");
    if (listeners.length !== 1)
      throw new Error(
        "API diagnostic expects exactly one native request listener",
      );
    const originalRequest = listeners[0]! as RequestListener;
    app.server.removeListener("request", originalRequest);
    app.server.on(
      "request",
      function (
        this: typeof app.server,
        ...args: [IncomingMessage, ServerResponse, ...unknown[]]
      ) {
        const [request, response] = args;
        if (!collecting) return Reflect.apply(originalRequest, this, args);
        const requestRecord: RequestRecord = {
          sequence: ++requestSequence,
          method: request.method ?? "UNKNOWN",
          path: (request.url ?? "").split("?")[0]!,
          idempotencyKey:
            typeof request.headers["idempotency-key"] === "string"
              ? request.headers["idempotency-key"].slice(0, 256)
              : null,
          enteredAt: epoch(),
        };
        if (requests.length < maximumRequests) requests.push(requestRecord);
        else droppedRequests += 1;
        const scope = { record: requestRecord, response };
        const originalWriteHead = response.writeHead;
        response.writeHead = function (
          this: ServerResponse,
          ...args: Parameters<typeof originalWriteHead>
        ) {
          const operation = record("response.writeHead.call", {
            requestSequence: requestRecord.sequence,
          });
          try {
            const result = Reflect.apply(originalWriteHead, this, args);
            record("response.writeHead.return", {
              operation,
              requestSequence: requestRecord.sequence,
            });
            return result;
          } catch (error) {
            record("response.writeHead.throw", {
              operation,
              requestSequence: requestRecord.sequence,
              errorName: errorName(error),
            });
            throw error;
          }
        } as typeof originalWriteHead;
        response.once("finish", () => {
          if (!collecting) return;
          requestRecord.finishedAt = epoch();
          requestRecord.statusCode = response.statusCode;
          const requestId = response.getHeader("x-request-id");
          if (typeof requestId === "string")
            requestRecord.requestId = requestId;
          record("response.finish", {
            requestSequence: requestRecord.sequence,
          });
        });
        return scopes.run(scope, () => {
          record("http.request.listener.enter");
          try {
            const result = Reflect.apply(originalRequest, this, args);
            // The listener can return while the async handler is still pending.
            record("http.request.listener.return");
            return result;
          } catch (error) {
            record("http.request.listener.throw", {
              errorName: errorName(error),
            });
            throw error;
          }
        });
      },
    );
    app.websocketServer.on("connection", (socket) => {
      const socketId = ++socketSequence;
      const originalSend = socket.send;
      socket.send = function (
        this: typeof socket,
        ...args: Parameters<typeof originalSend>
      ) {
        if (!collecting) return Reflect.apply(originalSend, this, args);
        let event: Record<string, unknown> = {};
        if (typeof args[0] === "string") {
          try {
            const parsed: unknown = JSON.parse(args[0]);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
              event = parsed as Record<string, unknown>;
          } catch {
            /* Non-event frame. */
          }
        }
        const fields = {
          socket: socketId,
          ...(typeof event.id === "string" ? { eventId: event.id } : {}),
          ...(typeof event.type === "string" ? { eventType: event.type } : {}),
          ...(typeof event.targetId === "string"
            ? { targetId: event.targetId }
            : {}),
        };
        const operation = record("websocket.send.call", fields);
        const callArgs: unknown[] = [...args];
        const last = callArgs.length - 1;
        const callback = callArgs[last];
        if (typeof callback === "function") {
          callArgs[last] = function (
            this: unknown,
            ...callbackArgs: unknown[]
          ) {
            record("websocket.send.callback", {
              ...fields,
              operation,
              ...(callbackArgs[0]
                ? { errorName: errorName(callbackArgs[0]) }
                : {}),
            });
            return Reflect.apply(callback, this, callbackArgs);
          };
        }
        try {
          const result = Reflect.apply(originalSend, this, callArgs);
          record("websocket.send.return", { ...fields, operation });
          return result;
        } catch (error) {
          record("websocket.send.throw", {
            ...fields,
            operation,
            errorName: errorName(error),
          });
          throw error;
        }
      } as typeof originalSend;
    });
  };

  const start = async () => {
    if (session || collecting)
      throw new Error("API diagnostic already started");
    events.length = 0;
    requests.length = 0;
    droppedEvents = 0;
    droppedRequests = 0;
    eventSequence = 0;
    requestSequence = 0;
    const startingSession = new Session();
    session = startingSession;
    try {
      startingSession.connect();
      await startingSession.post("Profiler.enable");
      await startingSession.post("Profiler.setSamplingInterval", {
        interval: 1000,
      });
      profileStartRequestedAt = epoch();
      await startingSession.post("Profiler.start");
      collectionStartedAt = epoch();
      collecting = true;
      return { collectionStartedAt, pid: process.pid };
    } catch (error) {
      startingSession.disconnect();
      session = undefined;
      throw error;
    }
  };
  const stop = async () => {
    if (!session || !collecting)
      throw new Error("API diagnostic is not running");
    collectionStoppedAt = epoch();
    collecting = false;
    const activeSession = session;
    session = undefined;
    let profile: unknown;
    try {
      profile = (await activeSession.post("Profiler.stop")).profile;
    } finally {
      activeSession.disconnect();
    }
    mkdirSync(outputDirectory, { recursive: true });
    const cpuPath = resolve(outputDirectory, "api-child.cpuprofile");
    const timingPath = resolve(outputDirectory, "api-timing.json");
    writeFileSync(cpuPath, JSON.stringify(profile));
    writeFileSync(
      timingPath,
      JSON.stringify(
        {
          method:
            "Fixture-only diagnostic. Epoch timestamps use performance.timeOrigin + performance.now(). Native HTTP listener entry precedes existing Fastify hooks; listener return is not async handler completion. writeHead and response finish are local response milestones, not receipt. save schedules/coalesces work; flush and SQLite BEGIN/COMMIT call/return are distinct exact boundaries, not physical-disk or network-completion measurements. Keep every commit because WebSocket dispatch may occur between commits. AsyncLocalStorage is observed request context; timer inheritance is not proof of exclusive mutation ownership. WebSocket send return measures synchronous queueing/call cost; only an existing callback is wrapped. No callback is added. Original errors/receivers/arguments/return values are preserved. Bounded metadata stays in memory until stop; no authentication headers, URL queries, body or event payload fields are retained.",
          node: process.version,
          pid: process.pid,
          sqliteSettings,
          profileStartRequestedAt,
          collectionStartedAt,
          collectionStoppedAt,
          maximumEvents,
          maximumRequests,
          droppedEvents,
          droppedRequests,
          truncated: droppedEvents > 0 || droppedRequests > 0,
          unfinishedRequestsAtStop: requests.filter(
            (request) => request.finishedAt === undefined,
          ).length,
          requests,
          events,
        },
        null,
        2,
      ),
    );
    return {
      cpuPath,
      timingPath,
      events: events.length,
      requests: requests.length,
      droppedEvents,
      droppedRequests,
    };
  };
  return { attach, start, stop };
}
