import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { installMultiplayerApiProfiling } from "./multiplayer-api-profiling.js";

type Call = { name: string; receiver: unknown; args: unknown[] };
type Timing = {
  sequence: number;
  phase: string;
  operation?: number;
  requestSequence?: number;
  sql?: string;
  errorName?: string;
};

test("API profiling preserves calls and records sanitized, correlated boundaries", async () => {
  const directory = mkdtempSync(
    join(tmpdir(), "multiplayer-api-profiling-test-"),
  );
  const calls: Call[] = [];
  const failures = new Map<string, Error>();
  const results = new Map<string, object>();
  const spy = (name: string) => {
    const result = { name };
    results.set(name, result);
    return function (this: unknown, ...args: unknown[]) {
      calls.push({ name, receiver: this, args });
      if (failures.has(name)) throw failures.get(name)!;
      return result;
    };
  };
  const latest = (name: string) =>
    [...calls].reverse().find((call) => call.name === name)!;
  const db = {
    exec: spy("exec"),
    prepare(sql: string) {
      assert.ok(sql === "PRAGMA journal_mode" || sql === "PRAGMA synchronous");
      return {
        get: () =>
          sql.endsWith("journal_mode")
            ? { journal_mode: "delete" }
            : { synchronous: 2 },
      };
    },
  };
  const store = { db, save: spy("save"), flush: spy("flush") };
  const server = new EventEmitter();
  const websocketServer = new EventEmitter();
  const socket = { send: spy("send") };
  const originalRequest = spy("request");
  let requestWork = () => {};
  server.on("request", function (this: EventEmitter, ...args: unknown[]) {
    const result = Reflect.apply(originalRequest, this, args);
    requestWork();
    return result;
  });
  const profiler = installMultiplayerApiProfiling(
    store as unknown as Parameters<typeof installMultiplayerApiProfiling>[0],
    directory,
  );
  profiler.attach({ server, websocketServer } as unknown as Parameters<
    typeof profiler.attach
  >[0]);
  websocketServer.emit("connection", socket);
  const requestListener = server.listeners("request")[0]!;
  const responses: EventEmitter[] = [];
  const response = (requestId: string) => {
    const value = Object.assign(new EventEmitter(), {
      statusCode: 201,
      getHeader: (name: string) =>
        name === "x-request-id" ? requestId : undefined,
      writeHead: spy("writeHead"),
    });
    responses.push(value);
    return value;
  };
  let running = false;
  try {
    // Disabled wrappers preserve callback identity and do not start collection.
    const untouchedCallback = () => {};
    assert.equal(
      socket.send("before-start", untouchedCallback),
      results.get("send"),
    );
    assert.equal(latest("send").args[1], untouchedCallback);
    assert.equal(store.save("before-start"), results.get("save"));

    await profiler.start();
    running = true;
    await assert.rejects(profiler.start(), /already started/);

    const thrown = new RangeError("error-secret");
    for (const [name, receiver, fn, args] of [
      ["save", store, store.save, ["save-secret"]],
      ["flush", store, store.flush, ["flush-secret"]],
      ["exec", db, db.exec, ["COMMIT"]],
      ["send", socket, socket.send, ["null"]],
    ] as const) {
      failures.set(name, thrown);
      assert.throws(
        () => Reflect.apply(fn, receiver, [...args]),
        (error) => error === thrown,
      );
      failures.delete(name);
    }

    const request = {
      method: "POST",
      url: "/api/v1/campaigns/camp_fixture/chat?token=query-secret",
      headers: {
        "idempotency-key": "fixture-command-key",
        authorization: "Bearer auth-secret",
        cookie: "session=cookie-secret",
      },
      body: { message: "body-secret" },
    };
    const res = response("fixture-request-1");
    const extra = { opaque: "extra-native-argument" };
    let resolveAsync!: () => void;
    let rejectAsync!: (error: unknown) => void;
    const asyncWork = new Promise<void>((resolve, reject) => {
      resolveAsync = resolve;
      rejectAsync = reject;
    });
    requestWork = () => {
      for (const name of ["save", "flush"] as const) {
        const receiver = { receiver: name };
        const args = [extra, "body-secret"];
        assert.equal(
          Reflect.apply(store[name], receiver, args),
          results.get(name),
        );
        assert.equal(latest(name).receiver, receiver);
        assert.deepEqual(latest(name).args, args);
      }
      const dbReceiver = { database: true };
      for (const sql of [" BEGIN IMMEDIATE; ", "COMMIT", "ROLLBACK;"]) {
        assert.equal(db.exec.call(dbReceiver, sql, extra), results.get("exec"));
        assert.equal(latest("exec").receiver, dbReceiver);
        assert.deepEqual(latest("exec").args, [sql, extra]);
      }
      db.exec("UPDATE records SET secret = 'sql-secret'");
      assert.equal(
        res.writeHead(201, "Created", extra),
        results.get("writeHead"),
      );
      assert.equal(latest("writeHead").receiver, res);
      assert.deepEqual(latest("writeHead").args, [201, "Created", extra]);
      failures.set("writeHead", thrown);
      assert.throws(
        () => res.writeHead(500),
        (error) => error === thrown,
      );
      failures.delete("writeHead");

      const payload = JSON.stringify({
        id: "evt_fixture",
        type: "chat.created",
        targetId: "chat_fixture",
        payload: { body: "event-secret" },
      });
      const sendOptions = { binary: false };
      const sendReceiver = { socket: true };
      assert.equal(
        socket.send.call(sendReceiver, payload, sendOptions),
        results.get("send"),
      );
      assert.equal(latest("send").receiver, sendReceiver);
      assert.deepEqual(latest("send").args, [payload, sendOptions]);
      assert.equal(latest("send").args.length, 2, "no callback is added");

      const callbackReceiver = { callback: true };
      const callbackResult = {};
      const callbackError = new TypeError("callback-error-secret");
      let callbackCalls = 0;
      const callback = function (this: unknown, ...args: unknown[]) {
        callbackCalls += 1;
        assert.equal(this, callbackReceiver);
        assert.deepEqual(args, [callbackError, extra]);
        return callbackResult;
      };
      for (const args of [
        [payload, callback],
        [payload, sendOptions, callback],
      ]) {
        assert.equal(
          Reflect.apply(socket.send, socket, args),
          results.get("send"),
        );
        const forwarded = latest("send").args;
        assert.equal(forwarded.length, args.length);
        assert.deepEqual(forwarded.slice(0, -1), args.slice(0, -1));
        assert.equal(
          Reflect.apply(forwarded.at(-1) as Function, callbackReceiver, [
            callbackError,
            extra,
          ]),
          callbackResult,
        );
      }
      assert.equal(callbackCalls, 2);
      const throwingCallback = () => {
        throw thrown;
      };
      socket.send(payload, throwingCallback);
      assert.throws(
        () => Reflect.apply(latest("send").args.at(-1) as Function, socket, []),
        (error) => error === thrown,
      );
      for (const frame of [
        "null",
        "42",
        "true",
        '"text"',
        "[]",
        "not-json",
        Buffer.from("buffer-frame"),
      ]) {
        assert.equal(socket.send(frame), results.get("send"));
        assert.deepEqual(latest("send").args, [frame]);
      }
      queueMicrotask(() => {
        try {
          store.flush("async-flush");
          res.emit("finish");
          resolveAsync();
        } catch (error) {
          rejectAsync(error);
        }
      });
    };
    assert.equal(
      Reflect.apply(requestListener, server, [request, res, extra]),
      results.get("request"),
    );
    assert.equal(latest("request").receiver, server);
    assert.deepEqual(latest("request").args, [request, res, extra]);
    await asyncWork;

    const failedResponse = response("fixture-request-2");
    failedResponse.statusCode = 500;
    failures.set("request", thrown);
    assert.throws(
      () =>
        Reflect.apply(requestListener, server, [
          request,
          failedResponse,
          extra,
        ]),
      (error) => error === thrown,
    );
    failures.delete("request");
    failedResponse.emit("finish");

    const output = await profiler.stop();
    running = false;
    await assert.rejects(profiler.stop(), /not running/);
    const text = readFileSync(output.timingPath, "utf8");
    const timing = JSON.parse(text) as {
      events: Timing[];
      requests: Array<{
        sequence: number;
        method: string;
        path: string;
        idempotencyKey: string;
        requestId: string;
        statusCode: number;
        finishedAt: number;
      }>;
      sqliteSettings: unknown;
      truncated: boolean;
      droppedEvents: number;
      droppedRequests: number;
      unfinishedRequestsAtStop: number;
    };
    assert.equal(timing.truncated, false);
    assert.equal(timing.droppedEvents, 0);
    assert.equal(timing.droppedRequests, 0);
    assert.equal(timing.unfinishedRequestsAtStop, 0);
    assert.equal(output.events, timing.events.length);
    assert.equal(output.requests, 2);
    assert.deepEqual(timing.sqliteSettings, {
      journalMode: { journal_mode: "delete" },
      synchronous: { synchronous: 2 },
    });
    for (const [index, value] of timing.requests.entries()) {
      assert.equal(value.sequence, index + 1);
      assert.equal(value.path, "/api/v1/campaigns/camp_fixture/chat");
      assert.equal(value.method, "POST");
      assert.equal(value.idempotencyKey, "fixture-command-key");
      assert.equal(value.requestId, "fixture-request-" + (index + 1));
      assert.equal(value.statusCode, index === 0 ? 201 : 500);
      assert.ok(Number.isFinite(value.finishedAt));
    }
    for (const secret of [
      "query-secret",
      "auth-secret",
      "cookie-secret",
      "body-secret",
      "event-secret",
      "sql-secret",
      "error-secret",
      "before-start",
    ])
      assert.equal(text.includes(secret), false, "output must omit " + secret);
    assert.deepEqual(
      timing.events.map((event) => event.sequence),
      timing.events.map((_, index) => index + 1),
    );
    for (const event of timing.events.filter((event) =>
      event.phase.endsWith(".call"),
    )) {
      const endings = timing.events.filter(
        (candidate) =>
          candidate.operation === event.sequence &&
          /\.(return|throw)$/.test(candidate.phase),
      );
      assert.equal(
        endings.length,
        1,
        "every call has exactly one return or throw",
      );
    }
    assert.deepEqual(
      timing.events
        .filter((event) => event.phase === "sqlite.exec.return")
        .map((event) => [event.sql, event.requestSequence]),
      [
        ["BEGIN IMMEDIATE;", 1],
        ["COMMIT", 1],
        ["ROLLBACK;", 1],
      ],
    );
    const listenerReturn = timing.events.find(
      (event) => event.phase === "http.request.listener.return",
    )!;
    assert.ok(
      timing.events.some(
        (event) =>
          event.phase === "flush.call" &&
          event.requestSequence === 1 &&
          event.sequence > listenerReturn.sequence,
      ),
      "async work retains its request context after listener return",
    );
    assert.equal(
      timing.events.filter((event) => event.phase === "websocket.send.callback")
        .length,
      3,
    );
    assert.ok(
      timing.events.some(
        (event) =>
          event.phase === "http.request.listener.throw" &&
          event.requestSequence === 2 &&
          event.errorName === "RangeError",
      ),
    );
    const cpu = JSON.parse(readFileSync(output.cpuPath, "utf8"));
    assert.ok(Array.isArray(cpu.nodes));
    assert.ok(cpu.endTime >= cpu.startTime);
  } finally {
    if (running) await profiler.stop();
    server.removeAllListeners();
    websocketServer.removeAllListeners();
    for (const value of responses) value.removeAllListeners();
    for (const name of ["api-child.cpuprofile", "api-timing.json"]) {
      const path = join(directory, name);
      if (existsSync(path)) unlinkSync(path);
    }
    rmdirSync(directory);
  }
});
