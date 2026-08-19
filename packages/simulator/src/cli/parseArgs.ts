/**
 * Pure CLI and environment parsing.
 *
 * Returns a discriminated result rather than throwing or calling `process.exit`,
 * so every branch is testable and the executable boundary in `src/index.ts` owns
 * the exit code (TODO § 11, § 16). `process.env` values are strings from outside
 * the program and are validated at this same boundary, never trusted
 * (Principle 2).
 */
import { DEFAULTS, MAX_HZ, type SimulatorConfig } from "../config/simulatorConfig.ts";
import { MAX_ROBOTS } from "../fleet/createFleet.ts";

/**
 * Flags that take a value. Kept as an explicit set so an unknown flag is named
 * as unknown before anything tries to read a value for it; the switch below
 * handles exactly these, and `parseArgs.test.ts` asserts the two lists agree.
 */
const VALUE_FLAGS = new Set([
  "--robots",
  "--hz",
  "--seed",
  "--drop",
  "--endpoint",
  "--timeout",
  "--max-in-flight",
  "--retries",
  "--summary",
]);

/** The outcome of parsing: a config to run, help text to print, or an actionable error. */
export type ParseResult =
  | { readonly kind: "config"; readonly config: SimulatorConfig }
  | { readonly kind: "help"; readonly text: string }
  | { readonly kind: "error"; readonly message: string };

/** Environment keys read at startup; CLI flags take precedence over all of them. */
export const ENV_KEYS = {
  endpoint: "FLEET_INGEST_URL",
  seed: "FLEET_SIM_SEED",
} as const;

/** The `--help` text; also the documentation of record for flag syntax. */
export const HELP_TEXT = `@fleet/simulator — deterministic multi-vendor telemetry producer

Usage: node src/index.ts [options]

Options:
  --robots <n>        Robots to simulate. 1-${String(MAX_ROBOTS)}. Default ${String(DEFAULTS.robots)}.
  --hz <n>            Emission rate PER ROBOT in hertz. 0 < n <= ${String(MAX_HZ)}. Default ${String(DEFAULTS.hz)}.
                      Total request rate is robots x hz.
  --seed <n>          Seed for fleet layout and evolution. Default ${String(DEFAULTS.seed)}.
                      The same seed always produces the same run.
  --drop <ids>        Comma-separated robot ids that emit nothing at all, e.g.
                      --drop R-007,R-023,R-041. Repeatable. Unknown ids fail at startup.
  --endpoint <url>    Server ingest origin. Default ${DEFAULTS.endpoint}.
  --timeout <ms>      Per-request timeout. Default ${String(DEFAULTS.timeoutMs)}.
  --max-in-flight <n> Concurrent request ceiling. Default ${String(DEFAULTS.maxInFlight)}.
  --retries <n>       Bounded retries for retryable failures only. Default ${String(DEFAULTS.maxRetries)}.
  --summary <ms>      Interval between structured summaries. Default ${String(DEFAULTS.summaryIntervalMs)}.
  --print-manifest    Print the fleet roster as JSON and exit. Starts no timers and
                      opens no connections.
  --help              Print this text and exit.

Environment (overridden by the equivalent flag):
  ${ENV_KEYS.endpoint}    Server ingest origin.
  ${ENV_KEYS.seed}   Seed.

Profiles:
  Normal  node src/index.ts
  Load    node src/index.ts --robots 500 --hz 5
  Silence node src/index.ts --drop R-007,R-023,R-041
`;

/** Reads a positive integer flag, naming the flag and its accepted range on failure. */
function parseIntegerOption(
  flag: string,
  raw: string,
  min: number,
  max: number,
): number | { readonly error: string } {
  const value = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(value)) {
    return { error: `${flag} expects a number; received "${raw}".` };
  }
  if (!Number.isSafeInteger(value)) {
    return { error: `${flag} expects a whole number; received "${raw}".` };
  }
  if (value < min || value > max) {
    return { error: `${flag} must be between ${String(min)} and ${String(max)}; received ${raw}.` };
  }
  return value;
}

/** Reads the per-robot rate, which may be fractional but must be finite and within the ceiling. */
function parseRate(raw: string): number | { readonly error: string } {
  const value = Number(raw);
  if (raw.trim() === "" || !Number.isFinite(value)) {
    return { error: `--hz expects a finite number; received "${raw}".` };
  }
  if (value <= 0) {
    return { error: `--hz must be greater than 0; received ${raw}.` };
  }
  if (value > MAX_HZ) {
    return {
      error:
        `--hz must not exceed ${String(MAX_HZ)}; received ${raw}. Above that the simulator, ` +
        `not the server, is what the measurement reflects.`,
    };
  }
  return value;
}

/** Validates an endpoint origin, rejecting anything the transport could not use. */
function parseEndpoint(raw: string): string | { readonly error: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { error: `--endpoint expects an absolute URL; received "${raw}".` };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { error: `--endpoint must be http or https; received "${url.protocol}".` };
  }
  return raw;
}

/** True when the result of a parse helper is the error branch. */
function isError(value: unknown): value is { readonly error: string } {
  return typeof value === "object" && value !== null && "error" in value;
}

/**
 * Parses `argv` (without the node and script entries) and the environment into a
 * validated configuration.
 *
 * Precedence is defaults, then environment, then flags — the most specific
 * statement of intent wins, and a flag in a `pnpm dev` script is not silently
 * overridden by a stale shell export.
 */
export function parseArgs(
  argv: readonly string[],
  env: Readonly<Partial<Record<string, string>>> = {},
): ParseResult {
  let robots: number = DEFAULTS.robots;
  let hz: number = DEFAULTS.hz;
  let seed: number = DEFAULTS.seed;
  let endpoint: string = DEFAULTS.endpoint;
  let timeoutMs: number = DEFAULTS.timeoutMs;
  let maxInFlight: number = DEFAULTS.maxInFlight;
  let maxRetries: number = DEFAULTS.maxRetries;
  let summaryIntervalMs: number = DEFAULTS.summaryIntervalMs;
  let printManifest = false;
  const dropped = new Set<string>();

  const envEndpoint = env[ENV_KEYS.endpoint];
  if (envEndpoint !== undefined) {
    const parsed = parseEndpoint(envEndpoint);
    if (isError(parsed)) {
      return { kind: "error", message: parsed.error.replace("--endpoint", ENV_KEYS.endpoint) };
    }
    endpoint = parsed;
  }

  const envSeed = env[ENV_KEYS.seed];
  if (envSeed !== undefined) {
    const parsed = parseIntegerOption(ENV_KEYS.seed, envSeed, 0, Number.MAX_SAFE_INTEGER);
    if (isError(parsed)) {
      return { kind: "error", message: parsed.error };
    }
    seed = parsed;
  }

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === undefined) {
      continue;
    }

    if (flag === "--help" || flag === "-h") {
      return { kind: "help", text: HELP_TEXT };
    }
    if (flag === "--print-manifest") {
      printManifest = true;
      continue;
    }

    // pnpm forwards the `--` separator itself, so `pnpm start -- --print-manifest`
    // — the form the README documented — reached this loop as a literal "--" and
    // was rejected as an unknown option. POSIX reads `--` as "end of options";
    // this CLI takes no positional arguments, so skipping it is the honest
    // reading and makes both invocation styles work (ADR 14 § Observed
    // consequences).
    if (flag === "--") {
      continue;
    }

    // Unknown flags are identified before their value is looked at. Checking
    // for a missing value first would report `--turbo expects a value.` for a
    // flag that does not exist, sending the reader after the wrong problem.
    if (!VALUE_FLAGS.has(flag)) {
      return {
        kind: "error",
        message: `Unknown option ${flag}. Run with --help for the accepted options.`,
      };
    }

    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      return { kind: "error", message: `${flag} expects a value.` };
    }
    index += 1;

    switch (flag) {
      case "--robots": {
        const parsed = parseIntegerOption("--robots", value, 1, MAX_ROBOTS);
        if (isError(parsed)) {
          return { kind: "error", message: parsed.error };
        }
        robots = parsed;
        break;
      }
      case "--hz": {
        const parsed = parseRate(value);
        if (isError(parsed)) {
          return { kind: "error", message: parsed.error };
        }
        hz = parsed;
        break;
      }
      case "--seed": {
        const parsed = parseIntegerOption("--seed", value, 0, Number.MAX_SAFE_INTEGER);
        if (isError(parsed)) {
          return { kind: "error", message: parsed.error };
        }
        seed = parsed;
        break;
      }
      case "--endpoint": {
        const parsed = parseEndpoint(value);
        if (isError(parsed)) {
          return { kind: "error", message: parsed.error };
        }
        endpoint = parsed;
        break;
      }
      case "--timeout": {
        const parsed = parseIntegerOption("--timeout", value, 1, 60_000);
        if (isError(parsed)) {
          return { kind: "error", message: parsed.error };
        }
        timeoutMs = parsed;
        break;
      }
      case "--max-in-flight": {
        const parsed = parseIntegerOption("--max-in-flight", value, 1, 10_000);
        if (isError(parsed)) {
          return { kind: "error", message: parsed.error };
        }
        maxInFlight = parsed;
        break;
      }
      case "--retries": {
        const parsed = parseIntegerOption("--retries", value, 0, 10);
        if (isError(parsed)) {
          return { kind: "error", message: parsed.error };
        }
        maxRetries = parsed;
        break;
      }
      case "--summary": {
        const parsed = parseIntegerOption("--summary", value, 100, 3_600_000);
        if (isError(parsed)) {
          return { kind: "error", message: parsed.error };
        }
        summaryIntervalMs = parsed;
        break;
      }
      case "--drop": {
        // Repeatable and comma-separated, both accepted; whitespace trimmed and
        // duplicates collapsed by the set, because `--drop R-1, R-1` is a typo
        // rather than a request to drop a robot twice.
        for (const id of value.split(",")) {
          const trimmed = id.trim();
          if (trimmed !== "") {
            dropped.add(trimmed);
          }
        }
        break;
      }
      default:
        // Unreachable: VALUE_FLAGS above is the same list as these cases, and
        // `valueFlags.test.ts` asserts the two agree.
        return {
          kind: "error",
          message: `Unknown option ${flag}. Run with --help for the accepted options.`,
        };
    }
  }

  return {
    kind: "config",
    config: {
      robots,
      hz,
      seed,
      endpoint,
      timeoutMs,
      maxInFlight,
      maxRetries,
      retryBaseDelayMs: DEFAULTS.retryBaseDelayMs,
      summaryIntervalMs,
      shutdownDeadlineMs: DEFAULTS.shutdownDeadlineMs,
      droppedRobotIds: [...dropped].sort(),
      printManifest,
    },
  };
}
