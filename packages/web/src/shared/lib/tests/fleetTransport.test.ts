import { describe, expect, it } from "vitest";

import { SCHEMA_VERSION } from "@fleet/contracts";
import type { FleetSnapshot, TelemetryBatch } from "@fleet/contracts";

import { createFleetTransport, type OpenSocket, type RetryTimer } from "../fleetTransport";
import { RETRY_DELAY_CEILING_MS } from "../streamLifecycle";
import type { FetchLike } from "../transportDecoding";

/**
 * The sequencing and the recovery schedule, which are the parts of the transport no pure
 * unit could test: open, buffer, fetch, reconcile, replay — and on failure, retry under
 * the ADR 31 policy with injected time and randomness. Everything the pieces do on their
 * own is already covered by `coldStart`, `streamLifecycle` and `transportDecoding`.
 */
describe("createFleetTransport", () => {
  const SESSION = "8f7a2c9e-1b3d-4e5f-9a6b-0c1d2e3f4a5b";
  const RESTARTED_SESSION = "01d3b5f7-9a2c-4e6d-8b0f-1a3c5e7d9b2f";

  function snapshot(flushSequence: number, serverSessionId: string = SESSION): FleetSnapshot {
    return {
      schemaVersion: SCHEMA_VERSION,
      serverSessionId,
      flushSequence,
      capturedAt: 0,
      sites: [],
      robots: [],
    };
  }

  function batch(flushSequence: number, serverSessionId: string = SESSION): TelemetryBatch {
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

  function socketFactory() {
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
  function fakeTimer() {
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

  function harness(options: { fetchLike: FetchLike; random?: () => number }) {
    const { sockets, openSocket, last } = socketFactory();
    const clock = fakeTimer();
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

  const serving =
    (body: unknown): FetchLike =>
    () =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

  /** Serves each body once, in order, so a restart can answer with a new session. */
  const servingInOrder = (...bodies: unknown[]): FetchLike => {
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
    const h = harness({ fetchLike: serving(snapshot(3)) });
    h.transport.connect();
    h.last()?.open();
    h.last()?.message(JSON.stringify(batch(4)));
    await flush();

    expect(h.snapshots).toHaveLength(1);
    expect(h.batches.map((b) => b.flushSequence)).toStrictEqual([4]);
  });

  it("discards a buffered frame the snapshot already covers", async () => {
    const h = harness({ fetchLike: serving(snapshot(5)) });
    h.transport.connect();
    h.last()?.open();
    h.last()?.message(JSON.stringify(batch(5)));
    await flush();

    expect(h.batches).toHaveLength(0);
  });

  it("passes a frame straight through once the snapshot has landed", async () => {
    const h = harness({ fetchLike: serving(snapshot(1)) });
    h.transport.connect();
    h.last()?.open();
    await flush();
    h.last()?.message(JSON.stringify(batch(2)));

    expect(h.batches.map((b) => b.flushSequence)).toStrictEqual([2]);
  });

  it("publishes connecting for a first attempt and connected once open", async () => {
    // ADR 31 publishes `connecting` as its own value: nothing was ever received, so
    // "reconnecting" would describe a loss that never happened.
    const h = harness({ fetchLike: serving(snapshot(0)) });

    h.transport.connect();
    expect(h.states).toStrictEqual(["connecting"]);

    h.last()?.open();
    expect(h.states).toStrictEqual(["connecting", "connected"]);
    // The attempt count survives the open and resets only when the join completes.
    expect(h.transport.state.attempt).toBe(1);
    await flush();
    expect(h.transport.state.attempt).toBe(0);
  });

  it("gives up on a body the contract refuses, rather than retrying the same bytes", async () => {
    // ADR 20: the server did not stumble; retrying returns the same bytes.
    const h = harness({ fetchLike: serving({ schemaVersion: SCHEMA_VERSION }) });
    h.transport.connect();
    h.last()?.open();
    await flush();

    expect(h.terminal).toHaveLength(1);
    expect(h.transport.state.phase).toBe("failed");
    expect(h.transport.state.terminalCause).toBe("contract");
    expect(h.states.at(-1)).toBe("disconnected");
    // Terminal means terminal: nothing is scheduled and the socket is closed.
    expect(h.clock.pending).toHaveLength(0);
    expect(h.last()?.closedByTransport).toBe(true);
  });

  it("closes the attempt and schedules a retry when the snapshot request fails", async () => {
    // ADR 31 counts socket-plus-snapshot as one attempt: a socket without a fleet has
    // not joined, so the retry policy — not an open, fleetless socket — decides next.
    const h = harness({
      fetchLike: () =>
        Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve(null) }),
    });
    h.transport.connect();
    h.last()?.open();
    await flush();

    expect(h.terminal).toHaveLength(0);
    expect(h.last()?.closedByTransport).toBe(true);
    expect(h.transport.state.phase).toBe("reconnecting");
    expect(h.clock.delays()).toHaveLength(1);

    // The scheduled attempt runs the whole joining sequence again on a new socket.
    h.clock.fire();
    expect(h.sockets).toHaveLength(2);
  });

  it("counts a frame it cannot decode and keeps the connection", () => {
    const h = harness({ fetchLike: serving(snapshot(0)) });
    h.transport.connect();
    h.last()?.open();

    h.last()?.message("<html>proxy error</html>");

    expect(h.rejectedCount()).toBe(1);
    expect(h.transport.state.phase).toBe("connected");
  });

  it("drops a snapshot that lands after its own socket closed", async () => {
    // Otherwise a stale fleet overwrites the one the new connection just fetched.
    const h = harness({ fetchLike: serving(snapshot(0)) });
    h.transport.connect();
    h.last()?.open();
    h.transport.disconnect();
    await flush();

    expect(h.snapshots).toHaveLength(0);
  });

  it("recovers automatically across a server restart, without retry or reload", async () => {
    // The defect ADR 31 exists to close, end to end: the restarted server counts flushes
    // from zero under a new session, and the console must replace its picture from the
    // new snapshot rather than silently discarding every new delta.
    const h = harness({
      fetchLike: servingInOrder(snapshot(50), snapshot(0, RESTARTED_SESSION)),
    });
    h.transport.connect();
    h.last()?.open();
    await flush();
    expect(h.snapshots.map((s) => s.serverSessionId)).toStrictEqual([SESSION]);

    // The server dies; the established stream drops. Recovery begins immediately —
    // no timer stands between the close and the next attempt.
    h.last()?.close();
    expect(h.transport.state.phase).toBe("reconnecting");
    expect(h.sockets).toHaveLength(2);

    // The new process answers. A frame flushed while the snapshot was in flight carries
    // the new session and a sequence far below the old snapshot's 50 — and must apply.
    h.last()?.open();
    h.last()?.message(JSON.stringify(batch(1, RESTARTED_SESSION)));
    await flush();

    expect(h.snapshots.map((s) => s.serverSessionId)).toStrictEqual([SESSION, RESTARTED_SESSION]);
    expect(h.batches.map((b) => b.flushSequence)).toStrictEqual([1]);
    expect(h.transport.state.phase).toBe("connected");
    expect(h.transport.state.attempt).toBe(0);

    // And live updates resume.
    h.last()?.message(JSON.stringify(batch(2, RESTARTED_SESSION)));
    expect(h.batches.map((b) => b.flushSequence)).toStrictEqual([1, 2]);
  });

  it("stops for good when a live frame arrives from a different runtime", async () => {
    // Persistent snapshot/stream disagreement is a deployment-integrity failure, not a
    // race to retry through (ADR 31). Rows stay as last-known; only manual retry leaves.
    const h = harness({ fetchLike: serving(snapshot(3)) });
    h.transport.connect();
    h.last()?.open();
    await flush();

    h.last()?.message(JSON.stringify(batch(9, RESTARTED_SESSION)));

    expect(h.batches).toHaveLength(0);
    expect(h.transport.state.phase).toBe("failed");
    expect(h.transport.state.terminalCause).toBe("session-mismatch");
    expect(h.clock.pending).toHaveLength(0);
    expect(h.last()?.closedByTransport).toBe(true);
  });

  it("applies the snapshot but stops when buffered frames disagree with its session", async () => {
    // The snapshot is authoritative either way: last-known rows beat no rows. But the
    // socket that produced mismatched frames is not describing the snapshot's server.
    const h = harness({ fetchLike: serving(snapshot(3)) });
    h.transport.connect();
    h.last()?.open();
    h.last()?.message(JSON.stringify(batch(9, RESTARTED_SESSION)));
    await flush();

    expect(h.snapshots).toHaveLength(1);
    expect(h.batches).toHaveLength(0);
    expect(h.transport.state).toMatchObject({ phase: "failed", terminalCause: "session-mismatch" });
  });

  it("gives up after three attempts in which the socket never opened", () => {
    // The initial probe is the one capped schedule (ADR 31): a server that has never
    // answered may not exist, and retrying it forever would be the console lying about
    // what is happening. Each close here is a handshake that failed.
    const h = harness({ fetchLike: serving(snapshot(0)) });
    h.transport.connect();
    h.last()?.close();
    expect(h.transport.state.phase).toBe("connecting");
    h.clock.fire();
    h.last()?.close();
    h.clock.fire();
    h.last()?.close();

    expect(h.transport.state).toMatchObject({
      phase: "failed",
      terminalCause: "handshake-exhausted",
      attempt: 3,
    });
    expect(h.clock.pending).toHaveLength(0);
  });

  it("grants a fresh three-attempt probe cycle on manual retry", () => {
    const h = harness({ fetchLike: serving(snapshot(0)) });
    h.transport.connect();
    h.last()?.close();
    h.clock.fire();
    h.last()?.close();
    h.clock.fire();
    h.last()?.close();
    expect(h.transport.state.phase).toBe("failed");

    // The banner's control: starts immediately — no timer — and earns three more.
    h.transport.connect();
    expect(h.transport.state.phase).toBe("connecting");
    expect(h.sockets).toHaveLength(4);
    h.last()?.close();
    expect(h.transport.state.phase).toBe("connecting");
    expect(h.clock.pending).toHaveLength(1);
  });

  it("schedules under the full-jitter bound and never reaches the ceiling", () => {
    // With random pinned to 1, each delay is the cap itself: 1s, 2s, 4s … 30s.
    const h = harness({ fetchLike: serving(snapshot(0)) });
    h.transport.connect();
    h.last()?.open(); // the handshake succeeded once, so the probe cap no longer applies
    h.last()?.close();

    const observed: number[] = [];
    for (let failure = 0; failure < 8; failure += 1) {
      // The immediate post-drop attempt failed (recorded), then each scheduled one fails.
      observed.push(...h.clock.delays());
      h.clock.fire();
      h.last()?.close();
    }

    expect(observed.slice(0, 6)).toStrictEqual([1000, 2000, 4000, 8000, 16000, 30000]);
    expect(Math.max(...observed)).toBe(RETRY_DELAY_CEILING_MS);
    // Uncapped: it opened once, so it keeps trying — as a recovery, not a first connect.
    expect(h.transport.state.phase).toBe("reconnecting");
  });

  it("draws zero-delay retries when the jitter lands low", () => {
    // Full jitter's lower bound is genuinely zero; a floor would re-synchronize every
    // console that lost the same server at the same moment.
    const h = harness({ fetchLike: serving(snapshot(0)), random: () => 0 });
    h.transport.connect();
    h.last()?.open();
    h.last()?.close();

    expect(h.clock.delays()).toStrictEqual([0]);
  });

  it("resets the backoff only after a completed join", async () => {
    const h = harness({ fetchLike: servingInOrder(snapshot(0), snapshot(1)) });
    h.transport.connect();
    h.last()?.open();
    await flush(); // joined: backoff resets
    h.last()?.close(); // drop; immediate attempt
    h.last()?.close(); // that attempt fails
    expect(h.clock.delays()).toStrictEqual([1000]);
    h.clock.fire();
    h.last()?.close(); // fails again: the schedule doubles
    expect(h.clock.delays()).toStrictEqual([2000]);

    h.clock.fire();
    h.last()?.open();
    await flush(); // joined again

    h.last()?.close(); // next drop starts a fresh schedule
    h.last()?.close();
    expect(h.clock.delays()).toStrictEqual([1000]);
  });

  it("never holds two sockets, however quickly retry is pressed", () => {
    const h = harness({ fetchLike: serving(snapshot(0)) });
    h.transport.connect();
    h.transport.connect();
    h.transport.connect();

    expect(h.sockets).toHaveLength(3);
    expect(h.sockets.filter((socket) => socket.isLive)).toHaveLength(1);
  });

  it("ignores the stale close of a socket a retry already superseded", () => {
    const h = harness({ fetchLike: serving(snapshot(0)) });
    h.transport.connect();
    const first = h.last();
    h.transport.connect();

    // The superseded socket's close event arrives late, as a browser would deliver it.
    first?.close();

    // One live attempt, no scheduled retry born from a dead socket's report.
    expect(h.transport.state.phase).toBe("connecting");
    expect(h.clock.pending).toHaveLength(0);
  });

  it("stops scheduling once disconnected, and lets nothing fire afterwards", () => {
    const h = harness({ fetchLike: serving(snapshot(0)) });
    h.transport.connect();
    h.last()?.open();
    h.last()?.close(); // immediate reconnect attempt
    h.last()?.close(); // fails; a retry is now scheduled

    expect(h.clock.pending).toHaveLength(1);
    h.transport.disconnect();
    expect(h.clock.pending).toHaveLength(0);
    expect(h.sockets.filter((socket) => socket.isLive)).toHaveLength(0);
  });
});
