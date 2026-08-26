import {
  type Clock,
  type Logger,
  type MonotonicClock,
  systemClock,
  systemMonotonicClock,
} from "../runtime.ts";
import type { IngestClient, SendOutcome } from "./ingestClient.ts";
import { buildPayload } from "./payloads.ts";
import { createEmissionSchedule, startScheduler } from "./scheduler.ts";
import {
  createFleet,
  createRandomSource,
  deriveSeed,
  evolveRobot,
  type RandomSource,
  SITES,
  type SimulatedRobot,
} from "./robot.ts";

export interface SimulatorConfig {
  readonly robots: number;
  readonly hz: number;
  readonly seed: number;
  readonly endpoint: string;
  readonly droppedRobotIds: readonly string[];
  readonly summaryIntervalMs: number;
}

export interface SimulatorCounters {
  attempted: number;
  succeeded: number;
  rejected: number;
  failed: number;
  shed: number;
  coalesced: number;
}

export interface SimulatorApp {
  stop(): Promise<void>;
  readonly counters: Readonly<SimulatorCounters>;
  readonly robots: readonly SimulatedRobot[];
}

export function renderFleetManifest(robots: number, seed: number): string {
  return JSON.stringify(
    {
      sites: SITES,
      robots: createFleet(robots, seed).map(({ identity }) => ({
        robotId: identity.robotId,
        siteId: identity.siteId,
        vendorId: identity.vendor,
        model: identity.model,
      })),
    },
    null,
    2,
  );
}

function countOutcome(counters: SimulatorCounters, outcome: SendOutcome): void {
  switch (outcome.kind) {
    case "success":
      counters.succeeded += 1;
      break;
    case "rejected":
      counters.rejected += 1;
      break;
    case "shed":
      counters.shed += 1;
      break;
    default:
      counters.failed += 1;
  }
}

export function startSimulator(
  config: SimulatorConfig,
  dependencies: {
    readonly ingest: IngestClient;
    readonly logger: Logger;
    readonly clock?: Clock;
    readonly monotonic?: MonotonicClock;
  },
): SimulatorApp {
  const clock = dependencies.clock ?? systemClock;
  const monotonic = dependencies.monotonic ?? systemMonotonicClock;
  const { ingest, logger } = dependencies;

  const robots = [...createFleet(config.robots, config.seed)];
  const dropped = new Set(config.droppedRobotIds);
  const streams: RandomSource[] = robots.map((robot) =>
    createRandomSource(deriveSeed(config.seed, `evolve:${robot.identity.robotId}`)),
  );
  const counters: SimulatorCounters = {
    attempted: 0,
    succeeded: 0,
    rejected: 0,
    failed: 0,
    shed: 0,
    coalesced: 0,
  };
  // Never queue another reading for a robot with an in-flight request.
  const busy = new Set<number>();

  logger.log("info", "simulator.started", {
    robots: config.robots,
    hz: config.hz,
    seed: config.seed,
    dropped: dropped.size,
  });

  function emit(robotIndex: number, elapsedMs: number): void {
    const robot = robots[robotIndex];
    const stream = streams[robotIndex];
    if (robot === undefined || stream === undefined || dropped.has(robot.identity.robotId)) {
      return;
    }
    if (busy.has(robotIndex)) {
      counters.shed += 1;
      return;
    }
    const evolved = evolveRobot(robot, elapsedMs, stream);
    robots[robotIndex] = evolved;
    counters.attempted += 1;
    busy.add(robotIndex);
    void ingest
      .send(evolved.identity.vendor, buildPayload(evolved, clock.now()))
      .then((outcome) => {
        countOutcome(counters, outcome);
      })
      .finally(() => busy.delete(robotIndex));
  }

  const scheduler = startScheduler({
    schedule: createEmissionSchedule(robots.length, config.hz),
    monotonic,
    onTick({ due, coalesced }) {
      counters.coalesced += coalesced;
      for (const tick of due) {
        emit(tick.robotIndex, tick.elapsedMs);
      }
    },
  });

  const summary = setInterval(() => {
    logger.log("info", "simulator.summary", { ...counters, inFlight: ingest.inFlight() });
  }, config.summaryIntervalMs);
  summary.unref();

  let stopped = false;
  return {
    counters,
    robots,
    async stop() {
      if (stopped) {
        return;
      }
      stopped = true;
      scheduler.stop();
      clearInterval(summary);
      ingest.abortAll();
      await Promise.resolve();
      logger.log("info", "simulator.stopped", { ...counters });
    },
  };
}
