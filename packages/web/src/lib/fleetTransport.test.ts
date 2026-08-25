import { describe, expect, it } from "vitest";

import { SCHEMA_VERSION } from "@fleet/contracts";
import type { FleetSnapshot, TelemetryBatch } from "@fleet/contracts";

import { createFleetTransport, type OpenSocket, type RetryTimer } from "./fleetTransport";
import { RETRY_DELAY_CEILING_MS } from "./streamLifecycle";
import type { FetchLike } from "./transportDecoding";

/**
 * The sequencing and the recovery schedule, which are the parts of the transport no pure
 * unit could test: open, buffer, fetch, reconcile, replay — and on failure, retry under
 * the ADR 31 policy with injected time and randomness. Everything the pieces do on their
 * own is already covered by `coldStart`, `streamLifecycle` and `transportDecoding`.
 */
describe("createFleetTransport", () => {
  const SESSION = "8f7a2c9e-1b3d-4e5f-9a6b-0c1d2e3f4a5b";
  const RESTARTED_SESSION = "01d3b5f7-9a2c-4e6d-8b0f-1a3c5e7d9b2f";

  function buildSnapshot(flushSequence: number, serverSessionId: string = SESSION): FleetSnapshot {
    return {
      schemaVersion: SCHEMA_VERSION,
      serverSessionId,
      flushSequence,
      capturedAt: 0,
      sites: [],
      robots: [],
    };
  }

  function buildBatch(flushSequence: number, serverSessionId: string = SESSION): TelemetryBatch {
    return { schemaVersion: SCHEMA_VERSION, serverSessionId, flushSequence, sentAt: 0, robots: [] };
  }

  /** One fake socket per attempt, so reconnects and concurrency are observable. */
  interface FakeSocket {
    readonly open: () => void;
    readonly message: (data: string) => void;
    /** The server side dropping the connection; delivers the close event. */
    readonly close: () => void;
    closedByTransport: boolean;
    closedByServer: boolean;
    readonly isLive: boolean;
  }

  function createSocketFactory() {
    const sockets: FakeSocket[] = [];
    const openSocket: OpenSocket = (_url, handlers) => {
      const socket: FakeSocket = {
        open: handlers.onOpen,
        message: handlers.onMessage,
        close: () => {
          socket.closedByServer = true;
          handlers.onClose();
        },
        closedByTransport: false,
        closedByServer: false,
        get isLive() {
          return !this.closedByTransport && !this.closedByServer;
        },
      };
      sockets.push(socket);
      return {
        close: () => {
          socket.closedByTransport = true;
        },
      };
    };
    return { sockets, openSocket, last: () => sockets.at(-1) };
  }

  /** A hand-cranked timer, so every scheduled delay is an assertable number. */
  function createFakeTimer() {
    const pending: { fn: () => void; delayMs: number; id: number }[] = [];
    let nextId = 1;
    const timer: RetryTimer = {
      set: (fn, delayMs) => {
        const id = nextId;
        nextId += 1;
        pending.push({ fn, delayMs, id });
        return id;
      },
      clear: (handle) => {
        const index = pending.findIndex((entry) => entry.id === handle);
        if (index >= 0) pending.splice(index, 1);
      },
    };
    return {
      timer,
      pending,
      delays: () => pending.map((entry) => entry.delayMs),
      fire: () => {
        const entry = pending.shift();
        if (!entry) throw new Error("nothing scheduled");
        entry.fn();
      },
    };
  }

  function createTransportHarness(options: {
    readonly fetchLike: FetchLike;
    readonly random?: () => number;
  }) {
    const { sockets, openSocket, last } = createSocketFactory();
    const clock = createFakeTimer();
    const snapshots: FleetSnapshot[] = [];
    const batches: TelemetryBatch[] = [];
    const states: string[] = [];
    const terminal: unknown[] = [];
    let rejected = 0;

    const transport = createFleetTransport({
      endpoints: { snapshotUrl: "/api/fleet", streamUrl: "/ws" },
      openSocket,
      fetchLike: options.fetchLike,
      timer: clock.timer,
      random: options.random ?? (() => 1),
      handlers: {
        onSnapshot: (value) => snapshots.push(value),
        onBatch: (value) => batches.push(value),
        onConnectionState: (published) => states.push(published),
        onTerminalError: (issues) => terminal.push(issues),
        onFrameRejected: () => {
          rejected += 1;
        },
      },
    });

    return {
      transport,
      sockets,
      last,
      clock,
      snapshots,
      batches,
      states,
      terminal,
      rejectedCount: () => rejected,
    };
  }

  /** Lets the injected fetch's promise chain settle; the transport awaits two of them. */
  const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  const createServingFetch =
    (body: unknown): FetchLike =>
    () =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

  /** Serves each body once, in order, so a restart can answer with a new session. */
  const createSequentialServingFetch = (...bodies: unknown[]): FetchLike => {
    let index = 0;
    return () => {
      const body = bodies[Math.min(index, bodies.length - 1)];
      index += 1;
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    };
  };

  it("opens the socket before fetching, and replays what the snapshot missed", async () => {
    // The whole reason this order exists. Flush 4 arrived while the snapshot (captured at
    // 3) was in flight; it is the console's only copy of that change.
    const testHarness = createTransportHarness({ fetchLike: createServingFetch(buildSnapshot(3)) });
    testHarness.transport.connect();
    testHarness.last()?.open();
    testHarness.last()?.message(JSON.stringify(buildBatch(4)));
    await flush();

    expect(testHarness.snapshots).toHaveLength(1);
    expect(testHarness.batches.map((telemetryBatch) => telemetryBatch.flushSequence)).toStrictEqual(
      [4],
    );
  });

  it("discards a buffered frame the snapshot already covers", async () => {
    const testHarness = createTransportHarness({ fetchLike: createServingFetch(buildSnapshot(5)) });
    testHarness.transport.connect();
    testHarness.last()?.open();
    testHarness.last()?.message(JSON.stringify(buildBatch(5)));
    await flush();

    expect(testHarness.batches).toHaveLength(0);
  });

  it("passes a frame straight through once the snapshot has landed", async () => {
    const testHarness = createTransportHarness({ fetchLike: createServingFetch(buildSnapshot(1)) });
    testHarness.transport.connect();
    testHarness.last()?.open();
    await flush();
    testHarness.last()?.message(JSON.stringify(buildBatch(2)));

    expect(testHarness.batches.map((telemetryBatch) => telemetryBatch.flushSequence)).toStrictEqual(
      [2],
    );
  });

  it("publishes connecting for a first attempt and connected once open", async () => {
    // ADR 31 publishes `connecting` as its own value: nothing was ever received, so
    // "reconnecting" would describe a loss that never happened.
    const testHarness = createTransportHarness({ fetchLike: createServingFetch(buildSnapshot(0)) });

    testHarness.transport.connect();
    expect(testHarness.states).toStrictEqual(["connecting"]);

    testHarness.last()?.open();
    expect(testHarness.states).toStrictEqual(["connecting", "connected"]);
    // The attempt count survives the open and resets only when the join completes.
    expect(testHarness.transport.state.attempt).toBe(1);
    await flush();
    expect(testHarness.transport.state.attempt).toBe(0);
  });

  it("gives up on a body the contract refuses, rather than retrying the same bytes", async () => {
    // ADR 20: the server did not stumble; retrying returns the same bytes.
    const testHarness = createTransportHarness({
      fetchLike: createServingFetch({ schemaVersion: SCHEMA_VERSION }),
    });
    testHarness.transport.connect();
    testHarness.last()?.open();
    await flush();

    expect(testHarness.terminal).toHaveLength(1);
    expect(testHarness.transport.state.phase).toBe("failed");
    expect(testHarness.transport.state.terminalCause).toBe("contract");
    expect(testHarness.states.at(-1)).toBe("disconnected");
    // Terminal means terminal: nothing is scheduled and the socket is closed.
    expect(testHarness.clock.pending).toHaveLength(0);
    expect(testHarness.last()?.closedByTransport).toBe(true);
  });

  it("closes the attempt and schedules a retry when the snapshot request fails", async () => {
    // ADR 31 counts socket-plus-snapshot as one attempt: a socket without a fleet has
    // not joined, so the retry policy — not an open, fleetless socket — decides next.
    const testHarness = createTransportHarness({
      fetchLike: () =>
        Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve(null) }),
    });
    testHarness.transport.connect();
    testHarness.last()?.open();
    await flush();

    expect(testHarness.terminal).toHaveLength(0);
    expect(testHarness.last()?.closedByTransport).toBe(true);
    expect(testHarness.transport.state.phase).toBe("reconnecting");
    expect(testHarness.clock.delays()).toHaveLength(1);

    // The scheduled attempt runs the whole joining sequence again on a new socket.
    testHarness.clock.fire();
    expect(testHarness.sockets).toHaveLength(2);
  });

  it("counts a frame it cannot decode and keeps the connection", () => {
    const testHarness = createTransportHarness({ fetchLike: createServingFetch(buildSnapshot(0)) });
    testHarness.transport.connect();
    testHarness.last()?.open();

    testHarness.last()?.message("<html>proxy error</html>");

    expect(testHarness.rejectedCount()).toBe(1);
    expect(testHarness.transport.state.phase).toBe("connected");
  });

  it("drops a snapshot that lands after its own socket closed", async () => {
    // Otherwise a stale fleet overwrites the one the new connection just fetched.
    const testHarness = createTransportHarness({ fetchLike: createServingFetch(buildSnapshot(0)) });
    testHarness.transport.connect();
    testHarness.last()?.open();
    testHarness.transport.disconnect();
    await flush();

    expect(testHarness.snapshots).toHaveLength(0);
  });

  it("recovers automatically across a server restart, without retry or reload", async () => {
    // The defect ADR 31 exists to close, end to end: the restarted server counts flushes
    // from zero under a new session, and the console must replace its picture from the
    // new snapshot rather than silently discarding every new delta.
    const testHarness = createTransportHarness({
      fetchLike: createSequentialServingFetch(
        buildSnapshot(50),
        buildSnapshot(0, RESTARTED_SESSION),
      ),
    });
    testHarness.transport.connect();
    testHarness.last()?.open();
    await flush();
    expect(
      testHarness.snapshots.map((fleetSnapshot) => fleetSnapshot.serverSessionId),
    ).toStrictEqual([SESSION]);

    // The server dies; the established stream drops. Recovery begins immediately —
    // no timer stands between the close and the next attempt.
    testHarness.last()?.close();
    expect(testHarness.transport.state.phase).toBe("reconnecting");
    expect(testHarness.sockets).toHaveLength(2);

    // The new process answers. A frame flushed while the snapshot was in flight carries
    // the new session and a sequence far below the old snapshot's 50 — and must apply.
    testHarness.last()?.open();
    testHarness.last()?.message(JSON.stringify(buildBatch(1, RESTARTED_SESSION)));
    await flush();

    expect(
      testHarness.snapshots.map((fleetSnapshot) => fleetSnapshot.serverSessionId),
    ).toStrictEqual([SESSION, RESTARTED_SESSION]);
    expect(testHarness.batches.map((telemetryBatch) => telemetryBatch.flushSequence)).toStrictEqual(
      [1],
    );
    expect(testHarness.transport.state.phase).toBe("connected");
    expect(testHarness.transport.state.attempt).toBe(0);

    testHarness.last()?.message(JSON.stringify(buildBatch(2, RESTARTED_SESSION)));
    expect(testHarness.batches.map((telemetryBatch) => telemetryBatch.flushSequence)).toStrictEqual(
      [1, 2],
    );
  });

  it("stops for good when a live frame arrives from a different runtime", async () => {
    // Persistent snapshot/stream disagreement is a deployment-integrity failure, not a
    // race to retry through (ADR 31). Rows stay as last-known; only manual retry leaves.
    const testHarness = createTransportHarness({ fetchLike: createServingFetch(buildSnapshot(3)) });
    testHarness.transport.connect();
    testHarness.last()?.open();
    await flush();

    testHarness.last()?.message(JSON.stringify(buildBatch(9, RESTARTED_SESSION)));

    expect(testHarness.batches).toHaveLength(0);
    expect(testHarness.transport.state.phase).toBe("failed");
    expect(testHarness.transport.state.terminalCause).toBe("session-mismatch");
    expect(testHarness.clock.pending).toHaveLength(0);
    expect(testHarness.last()?.closedByTransport).toBe(true);
  });

  it("applies the snapshot but stops when buffered frames disagree with its session", async () => {
    // The snapshot is authoritative either way: last-known rows beat no rows. But the
    // socket that produced mismatched frames is not describing the snapshot's server.
    const testHarness = createTransportHarness({ fetchLike: createServingFetch(buildSnapshot(3)) });
    testHarness.transport.connect();
    testHarness.last()?.open();
    testHarness.last()?.message(JSON.stringify(buildBatch(9, RESTARTED_SESSION)));
    await flush();

    expect(testHarness.snapshots).toHaveLength(1);
    expect(testHarness.batches).toHaveLength(0);
    expect(testHarness.transport.state).toMatchObject({
      phase: "failed",
      terminalCause: "session-mismatch",
    });
  });

  it("gives up after three attempts in which the socket never opened", () => {
    // The initial probe is the one capped schedule (ADR 31): a server that has never
    // answered may not exist, and retrying it forever would be the console lying about
    // what is happening. Each close here is a handshake that failed.
    const testHarness = createTransportHarness({ fetchLike: createServingFetch(buildSnapshot(0)) });
    testHarness.transport.connect();
    testHarness.last()?.close();
    expect(testHarness.transport.state.phase).toBe("connecting");
    testHarness.clock.fire();
    testHarness.last()?.close();
    testHarness.clock.fire();
    testHarness.last()?.close();

    expect(testHarness.transport.state).toMatchObject({
      phase: "failed",
      terminalCause: "handshake-exhausted",
      attempt: 3,
    });
    expect(testHarness.clock.pending).toHaveLength(0);
  });

  it("grants a fresh three-attempt probe cycle on manual retry", () => {
    const testHarness = createTransportHarness({ fetchLike: createServingFetch(buildSnapshot(0)) });
    testHarness.transport.connect();
    testHarness.last()?.close();
    testHarness.clock.fire();
    testHarness.last()?.close();
    testHarness.clock.fire();
    testHarness.last()?.close();
    expect(testHarness.transport.state.phase).toBe("failed");

    // The banner's control: starts immediately — no timer — and earns three more.
    testHarness.transport.connect();
    expect(testHarness.transport.state.phase).toBe("connecting");
    expect(testHarness.sockets).toHaveLength(4);
    testHarness.last()?.close();
    expect(testHarness.transport.state.phase).toBe("connecting");
    expect(testHarness.clock.pending).toHaveLength(1);
  });

  it("schedules under the full-jitter bound and never reaches the ceiling", () => {
    // With random pinned to 1, each delay is the cap itself: 1s, 2s, 4s … 30s.
    const testHarness = createTransportHarness({ fetchLike: createServingFetch(buildSnapshot(0)) });
    testHarness.transport.connect();
    // Opening once moves the lifecycle from the capped initial probe to uncapped recovery.
    testHarness.last()?.open();
    testHarness.last()?.close();

    const observed: number[] = [];
    for (let failure = 0; failure < 8; failure += 1) {
      // The immediate post-drop attempt failed (recorded), then each scheduled one fails.
      observed.push(...testHarness.clock.delays());
      testHarness.clock.fire();
      testHarness.last()?.close();
    }

    expect(observed.slice(0, 6)).toStrictEqual([1000, 2000, 4000, 8000, 16000, 30000]);
    expect(Math.max(...observed)).toBe(RETRY_DELAY_CEILING_MS);
    // Uncapped: it opened once, so it keeps trying — as a recovery, not a first connect.
    expect(testHarness.transport.state.phase).toBe("reconnecting");
  });

  it("draws zero-delay retries when the jitter lands low", () => {
    // Full jitter's lower bound is genuinely zero; a floor would re-synchronize every
    // console that lost the same server at the same moment.
    const testHarness = createTransportHarness({
      fetchLike: createServingFetch(buildSnapshot(0)),
      random: () => 0,
    });
    testHarness.transport.connect();
    testHarness.last()?.open();
    testHarness.last()?.close();

    expect(testHarness.clock.delays()).toStrictEqual([0]);
  });

  it("resets the backoff only after a completed join", async () => {
    const testHarness = createTransportHarness({
      fetchLike: createSequentialServingFetch(buildSnapshot(0), buildSnapshot(1)),
    });
    testHarness.transport.connect();
    testHarness.last()?.open();
    await flush();
    // A drop and then a failed immediate attempt advance the recovery schedule, so the
    // second join below has something to reset rather than a schedule already at rest.
    testHarness.last()?.close();
    testHarness.last()?.close();
    expect(testHarness.clock.delays()).toStrictEqual([1000]);
    testHarness.clock.fire();
    testHarness.last()?.close();
    expect(testHarness.clock.delays()).toStrictEqual([2000]);

    testHarness.clock.fire();
    testHarness.last()?.open();
    await flush();

    // A new completed join must erase the earlier failures; otherwise the next outage
    // would inherit an old delay and recovery would get slower across healthy sessions.
    testHarness.last()?.close();
    testHarness.last()?.close();
    expect(testHarness.clock.delays()).toStrictEqual([1000]);
  });

  it("never holds two sockets, however quickly retry is pressed", () => {
    const testHarness = createTransportHarness({ fetchLike: createServingFetch(buildSnapshot(0)) });
    testHarness.transport.connect();
    testHarness.transport.connect();
    testHarness.transport.connect();

    expect(testHarness.sockets).toHaveLength(3);
    expect(testHarness.sockets.filter((socket) => socket.isLive)).toHaveLength(1);
  });

  it("ignores the stale close of a socket a retry already superseded", () => {
    const testHarness = createTransportHarness({ fetchLike: createServingFetch(buildSnapshot(0)) });
    testHarness.transport.connect();
    const first = testHarness.last();
    testHarness.transport.connect();

    // The superseded socket's close event arrives late, as a browser would deliver it.
    first?.close();

    // One live attempt, no scheduled retry born from a dead socket's report.
    expect(testHarness.transport.state.phase).toBe("connecting");
    expect(testHarness.clock.pending).toHaveLength(0);
  });

  it("stops scheduling once disconnected, and lets nothing fire afterwards", () => {
    const testHarness = createTransportHarness({ fetchLike: createServingFetch(buildSnapshot(0)) });
    testHarness.transport.connect();
    testHarness.last()?.open();
    // The first close starts the immediate recovery attempt; failing that attempt is
    // what creates a scheduled retry for `disconnect` to cancel.
    testHarness.last()?.close();
    testHarness.last()?.close();

    expect(testHarness.clock.pending).toHaveLength(1);
    testHarness.transport.disconnect();
    expect(testHarness.clock.pending).toHaveLength(0);
    expect(testHarness.sockets.filter((socket) => socket.isLive)).toHaveLength(0);
  });
});
