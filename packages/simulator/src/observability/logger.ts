/**
 * Structured logging.
 *
 * One JSON object per line, so the same stream is readable by a person during a
 * demo and parseable by the measurement harness that fills the README table
 * (TODO § 15, § 18). There is deliberately no per-reading success log: at 500
 * robots and 5 Hz that would be 2,500 lines a second, and the formatting cost
 * alone would make the simulator the bottleneck it is meant to measure.
 */

/** Severity of a structured log record. */
export type LogLevel = "info" | "warn" | "error";

/** A sink for structured records; the app takes this rather than writing to a stream. */
export interface Logger {
  readonly log: (
    level: LogLevel,
    event: string,
    fields?: Readonly<Record<string, unknown>>,
  ) => void;
}

/** Writes one JSON object per line to the given sink, defaulting to stdout. */
export function createJsonLogger(write: (line: string) => void = writeStdout): Logger {
  return {
    log(level, event, fields = {}): void {
      write(JSON.stringify({ level, event, ...fields }));
    },
  };
}

/** A logger that records into an array, for tests. */
export function createMemoryLogger(): Logger & {
  readonly records: { level: LogLevel; event: string; fields: Readonly<Record<string, unknown>> }[];
} {
  const records: { level: LogLevel; event: string; fields: Readonly<Record<string, unknown>> }[] =
    [];
  return {
    records,
    log(level, event, fields = {}): void {
      records.push({ level, event, fields });
    },
  };
}

/** The default sink; isolated so the logger itself stays free of process globals. */
function writeStdout(line: string): void {
  process.stdout.write(`${line}\n`);
}

/**
 * Removes credentials from an endpoint before it is logged.
 *
 * Principle 7: a routine startup line must not put a password into a demo
 * recording or a CI log.
 */
export function sanitizeEndpoint(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return "(unparseable endpoint)";
  }
}
