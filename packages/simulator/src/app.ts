/**
 * Composition and lifecycle.
 *
 * Takes every dependency — clocks, randomness, transport, logger — as an
 * argument, so `app.test.ts` proves the whole path from generation through
 * vendor serialization to transport invocation and metrics without a network,
 * a real timer, or a real clock. Process globals belong to `src/index.ts` alone
 * (TODO § 16).
 */
import { createFaultPolicy, NO_FAULTS, type FaultPolicy } from "./faults/faultPolicy.ts";
import { SITE_DIRECTORY, createFleet, toFleetManifest } from "./fleet/createFleet.ts";
import { evolveRobot, type SimulatedRobot } from "./fleet/simulatedRobot.ts";
import { createMetrics, type SimulatorMetrics } from "./observability/simulatorMetrics.ts";
import { createJsonLogger, sanitizeEndpoint, type Logger } from "./observability/logger.ts";
import { createEmissionSchedule, startScheduler } from "./scheduling/emissionScheduler.ts";
import { createRandomSource, deriveSeed, type RandomSource } from "./runtime/random.ts";
import {
  systemClock,
  systemMonotonicClock,
  type Clock,
  type MonotonicClock,
} from "./runtime/clock.ts";
import { buildPayload } from "./vendors/buildPayload.ts";
import type { IngestClient } from "./transport/ingestClient.ts";
import type { SimulatorConfig } from "./config/simulatorConfig.ts";

/** Dependencies the app does not construct itself, so tests can replace each one. */
export interface AppDependencies {
  readonly ingest: IngestClient;
  readonly clock?: Clock;
  readonly monotonic?: MonotonicClock;
  readonly logger?: Logger;
}

/** A running simulator. */
export interface SimulatorApp {
  /** Stops scheduling, drains in-flight work to the deadline, and emits the final summary. */
  readonly stop: () => Promise<void>;
  /** Current counters; the app-level test asserts against this. */
  readonly metrics: SimulatorMetrics;
  /** The built fleet, exposed for the manifest handoff and for tests. */
  readonly robots: readonly SimulatedRobot[];
}

/**
 * Renders the fleet roster the server seeds its current-state map from
 * (`--print-manifest`).
 *
 * The output is exactly what `fleetManifestSchema` accepts and nothing more:
 * a `sites` directory and a `robots` array, no wrapper (ADR 34). The seed that
 * produced it is operator information, not roster data, so it goes to stderr
 * at the call site — a `seed` key here is an unrecognized field to a strict
 * schema, and would fail the server at startup on a file the operator just
 * generated for it (ADR 14).
 */
export function renderFleetManifest(config: SimulatorConfig): string {
  const robots = createFleet(config.robots, config.seed);
  return JSON.stringify({ sites: SITE_DIRECTORY, robots: toFleetManifest(robots) }, null, 2);
}

/**
 * Builds and starts the simulator.
 *
 * Startup order is deliberate: configuration is already validated by the caller,
 * then the fleet is built, then drop targets are validated against that fleet,
 * and only then does any timer start. A `--drop` typo therefore fails before a
 * single request has been sent rather than halfway into a demo (TODO § 16).
 */
export function startSimulator(
  config: SimulatorConfig,
  dependencies: AppDependencies,
): SimulatorApp {
  const clock = dependencies.clock ?? systemClock;
  const monotonic = dependencies.monotonic ?? systemMonotonicClock;
  const logger = dependencies.logger ?? createJsonLogger();
  const { ingest } = dependencies;

  const robots = [...createFleet(config.robots, config.seed)];
  const faults: FaultPolicy =
    config.droppedRobotIds.length === 0
      ? NO_FAULTS
      : createFaultPolicy(
          config.droppedRobotIds,
          robots.map((robot) => robot.identity.robotId),
        );

  const activeRobots = robots.filter((robot) => !faults.isDropped(robot.identity.robotId)).length;

  const metrics = createMetrics(
    {
      configuredRobots: config.robots,
      configuredHz: config.hz,
      activeRobots,
      droppedRobots: robots.length - activeRobots,
    },
    monotonic,
  );

  // One stream per robot, derived from the run seed, so a robot's history does
  // not depend on how many other robots share the process.
  const streams: RandomSource[] = robots.map((robot) =>
    createRandomSource(deriveSeed(config.seed, `evolve:${robot.identity.robotId}`)),
  );

  // A robot with a send still outstanding is skipped rather than queued behind
  // itself; the skip is counted so underproduction is visible (TODO § 13).
  const busy = new Set<number>();

  logger.log("info", "simulator.started", {
    robots: config.robots,
    hz: config.hz,
    seed: config.seed,
    endpoint: sanitizeEndpoint(config.endpoint),
    maxInFlight: config.maxInFlight,
    maxRetries: config.maxRetries,
    droppedRobots: faults.droppedRobotIds.length,
    droppedRobotIds: faults.droppedRobotIds.slice(0, 20),
  });

  function emit(robotIndex: number, elapsedMs: number): void {
    const robot = robots[robotIndex];
    const stream = streams[robotIndex];
    if (robot === undefined || stream === undefined) {
      return;
    }

    // A dropped robot advances no state and sends nothing. Its sequence and
    // battery are frozen, so when the simulator is restarted without the flag it
    // resumes from where it stopped rather than jumping forward — the recovery
    // consequence TODO § 12 asks to be chosen and documented.
    if (faults.isDropped(robot.identity.robotId)) {
      return;
    }

    if (busy.has(robotIndex)) {
      metrics.recordSkippedOverdue(1);
      return;
    }

    const evolved = evolveRobot(robot, elapsedMs, stream);
    robots[robotIndex] = evolved;
    metrics.recordReadingAttempted(evolved.identity.vendor);

    const payload = buildPayload(evolved, clock.now());
    busy.add(robotIndex);

    // The gauge is read from the transport after the send has been initiated,
    // never predicted as `inFlight + 1` beforehand: a shed request never
    // increments, so predicting reports a peak the transport never reached and
    // makes the in-flight ceiling look violated in the measurement output.
    const pending = ingest.send(evolved.identity.vendor, payload);
    metrics.setInFlight(ingest.inFlight());

    void pending
      .then((outcome) => {
        switch (outcome.kind) {
          case "success":
            metrics.recordSuccess();
            break;
          case "rejected":
            metrics.recordRejected();
            break;
          case "server-failure":
            metrics.recordServerFailure();
            break;
          case "timeout":
            metrics.recordTimeout();
            break;
          case "network-failure":
            metrics.recordNetworkFailure();
            break;
          case "cancelled":
            metrics.recordCancelled();
            break;
          case "shed":
            metrics.recordSkippedOverdue(1);
            break;
        }
        if (outcome.kind !== "shed" && outcome.attempts > 1) {
          metrics.recordRetrySent();
        }
        if (outcome.kind !== "shed") {
          metrics.recordRequestSent();
        }
      })
      .finally(() => {
        busy.delete(robotIndex);
        metrics.setInFlight(ingest.inFlight());
      });
  }

  const scheduler = startScheduler({
    schedule: createEmissionSchedule(robots.length, config.hz),
    monotonic,
    onTick({ due, coalesced }) {
      if (coalesced > 0) {
        metrics.recordCoalescedOverdue(coalesced);
      }
      for (const tick of due) {
        emit(tick.robotIndex, tick.elapsedMs);
      }
    },
  });

  const summaryTimer = setInterval(() => {
    logger.log("info", "simulator.summary", { ...metrics.snapshot() });
  }, config.summaryIntervalMs);
  // Bookkeeping only: it must never be the reason the process stays alive.
  // The scheduler's interval owns that job (see `startScheduler`).
  summaryTimer.unref();

  let stopped = false;

  return {
    metrics,
    robots,
    async stop(): Promise<void> {
      // Repeated signals must not run shutdown twice; the second Ctrl-C should
      // be a no-op, not a second drain racing the first (TODO § 16).
      if (stopped) {
        return;
      }
      stopped = true;
      scheduler.stop();
      clearInterval(summaryTimer);

      const deadline = monotonic.elapsed() + config.shutdownDeadlineMs;
      while (ingest.inFlight() > 0 && monotonic.elapsed() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      if (ingest.inFlight() > 0) {
        ingest.abortAll();
      }

      logger.log("info", "simulator.stopped", { ...metrics.snapshot() });
    },
  };
}
